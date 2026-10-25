import type { EstadoSala, JugadorSala } from './migracionHost';
import type { SignalingClient } from './SignalingClient';

export interface ProgresoJugador {
  nick: string;
  oro: number;
  xp: number;
  bajas: number;
}

export interface MetadatosPartida {
  inicioPartida?: number;
  dificultad?: string;
  hostNick?: string;
  hostEpoch?: number;
  roster?: string[] | null;
  jugadores?: Record<string, ProgresoJugador>;
}

export interface ResultadoReclamo {
  ok: boolean;
  epoch: number;
}

/**
 * Punto común de coordinación de la sala. Firebase y HTTP comparten el mismo
 * contrato: leer estado/lease, presencia, CAS de host y metadatos de partida.
 */
export interface CoordinadorSala {
  leerEstado(): Promise<EstadoSala | null>;
  registrarJugador(id: string, playerId: string, nick: string): Promise<void>;
  latirPresencia(id: string, playerId: string, nick: string): Promise<void>;
  latirHost(id: string, epoch: number): Promise<boolean>;
  reclamarHost(
    id: string,
    nick: string,
    playerId: string,
    expectedEpoch: number,
  ): Promise<ResultadoReclamo | null>;
  salirJugador(id: string): Promise<void>;
  guardarMetadatos(meta: MetadatosPartida): Promise<void>;
  leerMetadatos(): Promise<MetadatosPartida | null>;
}

/** Normaliza la foto de sala de Firestore/HTTP a `EstadoSala`. */
export function normalizarEstado(datos: any): EstadoSala {
  const bruto = datos?.jugadores;
  const jugadores: Record<string, JugadorSala> = {};
  if (bruto && typeof bruto === 'object') {
    for (const [id, valor] of Object.entries(bruto)) {
      if (!valor || typeof valor !== 'object') continue;
      const j = valor as any;
      jugadores[id] = {
        playerId: typeof j.playerId === 'string' ? j.playerId : id,
        nick: typeof j.nick === 'string' ? j.nick : id,
        ultimaVez: typeof j.ultimaVez === 'number' ? j.ultimaVez : 0,
      };
    }
  }
  const lastSeen = typeof datos?.lastSeen === 'number'
    ? datos.lastSeen
    : typeof datos?.ultimoHb === 'number'
      ? datos.ultimoHb
      : typeof datos?.creacion === 'number'
        ? datos.creacion
        : 0;
  return {
    hostId: typeof datos?.hostId === 'string' ? datos.hostId : '',
    hostNick: typeof datos?.hostNick === 'string' ? datos.hostNick : '',
    hostPlayerId: typeof datos?.playerId === 'string' ? datos.playerId : '',
    hostEpoch: typeof datos?.hostEpoch === 'number' ? datos.hostEpoch : 1,
    lastSeen,
    jugadores,
  };
}

export class CoordinadorFirebase implements CoordinadorSala {
  constructor(private readonly db: any, private readonly partidaId: string) {}

  private ref(): any {
    return this.db.collection('partidas').doc(this.partidaId);
  }

  async leerEstado(): Promise<EstadoSala | null> {
    try {
      const snap = await this.ref().get();
      if (!snap.exists) return null;
      return normalizarEstado(snap.data() ?? {});
    } catch (e) {
      console.warn('CoordinadorFirebase.leerEstado:', e);
      return null;
    }
  }

  async registrarJugador(id: string, playerId: string, nick: string): Promise<void> {
    const ahora = Date.now();
    try {
      await this.ref().set({
        jugadores: { [id]: { playerId, nick, ultimaVez: ahora } },
      }, { merge: true });
    } catch (e) {
      console.warn('CoordinadorFirebase.registrarJugador:', e);
    }
  }

  async latirPresencia(id: string, playerId: string, nick: string): Promise<void> {
    await this.registrarJugador(id, playerId, nick);
  }

  async latirHost(id: string, epoch: number): Promise<boolean> {
    try {
      return await this.db.runTransaction(async (tx: any) => {
        const ref = this.ref();
        const snap = await tx.get(ref);
        if (!snap.exists) return false;
        const d = snap.data() ?? {};
        if (d.hostId !== id || (d.hostEpoch ?? 1) !== epoch) return false;
        const ahora = Date.now();
        tx.update(ref, {
          lastSeen: ahora,
          [`jugadores.${id}.ultimaVez`]: ahora,
        });
        return true;
      });
    } catch (e) {
      console.warn('CoordinadorFirebase.latirHost:', e);
      return false;
    }
  }

  async reclamarHost(
    id: string,
    nick: string,
    playerId: string,
    expectedEpoch: number,
  ): Promise<ResultadoReclamo | null> {
    try {
      return await this.db.runTransaction(async (tx: any) => {
        const ref = this.ref();
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const d = snap.data() ?? {};
        const actual = typeof d.hostEpoch === 'number' ? d.hostEpoch : 1;
        if (actual !== expectedEpoch) return { ok: false, epoch: actual };
        const nuevo = actual + 1;
        const ahora = Date.now();
        tx.update(ref, {
          hostId: id,
          hostNick: nick,
          playerId,
          hostEpoch: nuevo,
          lastSeen: ahora,
          [`jugadores.${id}`]: { playerId, nick, ultimaVez: ahora },
        });
        return { ok: true, epoch: nuevo };
      });
    } catch (e) {
      console.warn('CoordinadorFirebase.reclamarHost:', e);
      return null;
    }
  }

  async salirJugador(id: string): Promise<void> {
    try {
      await this.ref().set({ jugadores: { [id]: null } }, { merge: true });
    } catch (e) {
      console.warn('CoordinadorFirebase.salirJugador:', e);
    }
  }

  async guardarMetadatos(meta: MetadatosPartida): Promise<void> {
    try {
      await this.ref().set({ meta }, { merge: true });
    } catch (e) {
      console.warn('CoordinadorFirebase.guardarMetadatos:', e);
    }
  }

  async leerMetadatos(): Promise<MetadatosPartida | null> {
    try {
      const snap = await this.ref().get();
      if (!snap.exists) return null;
      const meta = (snap.data() ?? {}).meta;
      return meta && typeof meta === 'object' ? (meta as MetadatosPartida) : null;
    } catch (e) {
      console.warn('CoordinadorFirebase.leerMetadatos:', e);
      return null;
    }
  }
}

export class CoordinadorHttp implements CoordinadorSala {
  constructor(
    private readonly signaling: SignalingClient,
    private readonly partidaId: string,
  ) {}

  async leerEstado(): Promise<EstadoSala | null> {
    const datos = await this.signaling.leerEstado(this.partidaId);
    return datos ? normalizarEstado(datos) : null;
  }

  async registrarJugador(id: string, playerId: string, nick: string): Promise<void> {
    await this.signaling.registrarJugador(this.partidaId, id, playerId, nick);
  }

  async latirPresencia(id: string, playerId: string, nick: string): Promise<void> {
    await this.signaling.latirPresencia(this.partidaId, id, playerId, nick);
  }

  async latirHost(id: string, epoch: number): Promise<boolean> {
    return await this.signaling.latirHost(this.partidaId, id, epoch);
  }

  async reclamarHost(
    id: string,
    nick: string,
    playerId: string,
    expectedEpoch: number,
  ): Promise<ResultadoReclamo | null> {
    const res = await this.signaling.reclamarHost(this.partidaId, id, nick, playerId, expectedEpoch);
    if (!res) return null;
    return { ok: res.ok, epoch: res.hostEpoch };
  }

  async salirJugador(id: string): Promise<void> {
    await this.signaling.salirJugador(this.partidaId, id);
  }

  async guardarMetadatos(meta: MetadatosPartida): Promise<void> {
    await this.signaling.guardarMetadatos(this.partidaId, meta as unknown as Record<string, unknown>);
  }

  async leerMetadatos(): Promise<MetadatosPartida | null> {
    const meta = await this.signaling.leerMetadatos(this.partidaId);
    return meta && typeof meta === 'object' ? (meta as MetadatosPartida) : null;
  }
}
