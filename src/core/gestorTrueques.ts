import {
  sanearCesta,
  validarDisposicion,
  type OfertaTrade,
  type EstadoTrade,
} from './intercambio';
import { sanearEquipoGuardado, type InventarioGuardado } from './inventario';

export type TradeActivo = {
  estado: EstadoTrade;
  a: string;
  b: string;
  ofertaA: OfertaTrade | null;
  ofertaB: OfertaTrade | null;
  exportA: InventarioGuardado | null;
  exportB: InventarioGuardado | null;
  confirmoA: boolean;
  confirmoB: boolean;
};

export type EfectoTrade =
  | { tipo: 'relay'; para: string; msj: Record<string, unknown> }
  | { tipo: 'aplicar'; idA: string; idB: string };

export function clavePar(a: string, b: string): string {
  return [a, b].sort().join('|');
}

type MsjTrade = Record<string, unknown>;

/**
 * Máquina de estados del trueque, por par de jugadores. Pura respecto a red y
 * DOM: el caller ejecuta los efectos devueltos (relay/aplicar) contra el mundo real.
 */
export class GestorTrueques {
  private trades: Map<string, TradeActivo> = new Map();

  /** ¿Hay algún trade en curso (no terminado)? */
  activo(): boolean {
    for (const trade of this.trades.values()) {
      if (trade.estado !== 'cancelada' && trade.estado !== 'aplicada') return true;
    }
    return false;
  }

  par(pairKey: string): TradeActivo | null {
    return this.trades.get(pairKey) ?? null;
  }

  /**
   * Procesa un mensaje trade_* desde `idEmisor`. `exportDe(id)` aporta la
   * exportación del jugador (host: su protagonista; remoto: su último estado).
   */
  procesar(
    msj: MsjTrade,
    idEmisor: string,
    exportDe: (id: string) => InventarioGuardado | null,
  ): EfectoTrade[] {
    const tipo = typeof msj.tipo === 'string' ? msj.tipo : '';
    if (tipo === 'trade_invite') return this.invitar(msj, idEmisor);
    if (tipo === 'trade_accept') return this.aceptar(idEmisor);
    if (tipo === 'trade_offer' || tipo === 'trade_confirm') return this.ofertarOConfirmar(tipo, msj, idEmisor, exportDe);
    if (tipo === 'trade_cancel') return this.cancelarParDe(idEmisor);
    return []; // trade_state / trade_apply / desconocidos: llegados de fuera se ignoran
  }

  /** Desconexión (o fin de partida): cierra todo trade en el que aparezca el id. */
  cancelarPorId(id: string): EfectoTrade[] {
    const efectos: EfectoTrade[] = [];
    for (const trade of this.trades.values()) {
      if (trade.estado === 'cancelada' || trade.estado === 'aplicada') continue;
      if (trade.a !== id && trade.b !== id) continue;
      trade.estado = 'cancelada';
      const socio = trade.a === id ? trade.b : trade.a;
      efectos.push({ tipo: 'relay', para: socio, msj: { tipo: 'trade_state', estado: 'cancelada' } });
    }
    return efectos;
  }

  /** Borra los trades terminados (llamar tras consumir los efectos). */
  limpiarTerminados(): void {
    for (const [clave, trade] of this.trades) {
      if (trade.estado === 'cancelada' || trade.estado === 'aplicada') this.trades.delete(clave);
    }
  }

  // ─── Transiciones ───────────────────────────────────────────────────────────

  private invitar(msj: MsjTrade, idEmisor: string): EfectoTrade[] {
    const destino = typeof msj.destino === 'string' ? msj.destino : '';
    if (!destino || destino === idEmisor) return [];
    if (this.tieneTradeActivo(idEmisor) || this.tieneTradeActivo(destino)) {
      return [{ tipo: 'relay', para: idEmisor, msj: { tipo: 'trade_state', estado: 'ocupado' } }];
    }
    const clave = clavePar(idEmisor, destino);
    this.trades.set(clave, {
      estado: 'propuesta',
      a: idEmisor,
      b: destino,
      ofertaA: null,
      ofertaB: null,
      exportA: null,
      exportB: null,
      confirmoA: false,
      confirmoB: false,
    });
    return [{ tipo: 'relay', para: destino, msj: { tipo: 'trade_invite', de: idEmisor } }];
  }

  private aceptar(idEmisor: string): EfectoTrade[] {
    const trade = this.tradeDeParte(idEmisor);
    if (!trade || trade.estado !== 'propuesta' || trade.b !== idEmisor) return [];
    return [{ tipo: 'relay', para: trade.a, msj: { tipo: 'trade_accept', de: idEmisor } }];
  }

  private ofertarOConfirmar(
    tipo: string,
    msj: MsjTrade,
    idEmisor: string,
    exportDe: (id: string) => InventarioGuardado | null,
  ): EfectoTrade[] {
    const trade = this.tradeDeParte(idEmisor);
    if (!trade) return [];

    const oferta: OfertaTrade = {
      de: idEmisor,
      da: sanearCesta(msj.da),
      pide: sanearCesta(msj.pide),
    };
    const exportPropia = (typeof msj.export === 'object' && msj.export !== null ? sanearEquipoGuardado(msj.export) : null)
      ?? exportDe(idEmisor);
    if (!exportPropia) return this.cancelar(trade, idEmisor, 'export ausente');

    if (trade.a === idEmisor) {
      trade.ofertaA = oferta;
      trade.exportA = exportPropia;
      if (tipo === 'trade_offer') trade.confirmoA = false; // nueva oferta invalida su confirm previa
    } else {
      trade.ofertaB = oferta;
      trade.exportB = exportPropia;
      if (tipo === 'trade_offer') trade.confirmoB = false;
    }
    // Toda oferta NUEVA invalida ambas confirmaciones: el consentimiento anterior
    // se dio sobre otra cesta (evita recibir algo distinto de lo acordado).
    if (tipo === 'trade_offer') {
      trade.confirmoA = false;
      trade.confirmoB = false;
    }

    const socio = trade.a === idEmisor ? trade.b : trade.a;
    if (tipo === 'trade_offer') {
      return [{ tipo: 'relay', para: socio, msj: { tipo: 'trade_offer', de: idEmisor, da: oferta.da, pide: oferta.pide } }];
    }

    // trade_confirm: valida posesión contra la exportación fresca.
    if (!validarDisposicion(oferta.da, exportPropia.bulto, exportPropia.mochila)) {
      return this.cancelar(trade, idEmisor, 'posesión insuficiente');
    }
    if (trade.a === idEmisor) trade.confirmoA = true;
    else trade.confirmoB = true;
    if (trade.confirmoA && trade.confirmoB) {
      // Ambos confirman con validaciones de export propias; el caller (host)
      // ejecuta aplicarIntercambio con los estados reales y difunde trade_apply.
      trade.estado = 'aplicada';
      return [{ tipo: 'aplicar', idA: trade.a, idB: trade.b }];
    }
    trade.estado = 'confirmada_uno';
    return [{ tipo: 'relay', para: socio, msj: { tipo: 'trade_state', estado: 'confirmada_uno' } }];
  }

  private cancelarParDe(idEmisor: string): EfectoTrade[] {
    const trade = this.tradeDeParte(idEmisor);
    if (!trade) return [];
    return this.cancelar(trade, idEmisor, 'cancelado');
  }

  private cancelar(trade: TradeActivo, emisor: string, _motivo: string): EfectoTrade[] {
    trade.estado = 'cancelada';
    const socio = trade.a === emisor ? trade.b : trade.a;
    return [
      { tipo: 'relay', para: socio, msj: { tipo: 'trade_state', estado: 'cancelada' } },
    ];
  }

  private tradeDeParte(id: string): TradeActivo | null {
    for (const trade of this.trades.values()) {
      if ((trade.a === id || trade.b === id) && trade.estado !== 'cancelada' && trade.estado !== 'aplicada') {
        return trade;
      }
    }
    return null;
  }

  private tieneTradeActivo(id: string): boolean {
    return this.tradeDeParte(id) !== null;
  }
}