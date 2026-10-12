import { EntidadRPG } from './EntidadRPG';
import { IGame } from '../types';
import type { AparienciaAvatar } from '../core/avatarTintes';
import { APARIENCIA_DEFECTO } from '../config/apariencia';
import {
  equipoVacio, equipar, desequipar, bonosEquipo, aplicarBonos, piezasDeEquipo, danoArma,
  capacidadMaxima, pesoTotal, penalizacionSobrecarga,
  anadirAlInventario, consumir, type Equipo, type Inventario, type RanuraEquipo,
} from '../core/equipo';
import { ITEMS } from '../config/items';
import { sanearEquipoGuardado, type InventarioGuardado } from '../core/inventario';

export class Jugador extends EntidadRPG {
  pasosDesdeUltimoDano: number = 0;
  tienePico: boolean = false;
  ultimaCasillaAtacada: {f: number, c: number} | null = null;
  ultimaInteraccion: number = 0;
  ultimaVezHabilidad: { fireball: number, bow: number, food: number, radar: number, whirlwind: number, freeze: number } = { fireball: 0, bow: 0, food: 0, radar: 0, whirlwind: 0, freeze: 0 };
  clase: string = 'guerrero';
  color: string = '#007bff';
  apariencia: AparienciaAvatar = { formato: 1, zonas: { ...APARIENCIA_DEFECTO.guerrero.zonas }, genero: 'm', piezas: { pelo: null, torso: null, piernas: null, casco: null } };
  spriteKey: string = 'player_idle';
  personajeCreado: boolean = false;
  /** Equipo puesto (7 ranuras) e inventario (pilas de consumibles/materiales). */
  equipo: Equipo = equipoVacio();
  inventario: Inventario = { pocion_vida: 3, flecha: 20 };
  /** Equipo poseído pero no puesto (bulto del loot). Se llena al recoger botín. */
  bulto: string[] = ['casco_hierro', 'daga'];
  /** Vida máxima sin equipo; `vidaMaxima` = base + bonus de vida del equipo. */
  vidaMaximaBase: number = 0;

  constructor(nombre: string = "Jugador") {
    super(0, 0, nombre);
    this.generarStats();
  }

  generarStats(nuevaClase?: string) {
    if (nuevaClase && nuevaClase !== this.clase) {
        this.clase = nuevaClase;
        // La apariencia siempre es defecto de su clase hasta personalizar (Task 5):
        // evita teñir una clase con los colores de otra.
        const def = APARIENCIA_DEFECTO[nuevaClase] ?? APARIENCIA_DEFECTO.guerrero;
        this.apariencia = { formato: 1, zonas: { ...def.zonas }, genero: this.apariencia.genero ?? 'm', piezas: { pelo: null, torso: null, piernas: null, casco: null } };
    } else if (nuevaClase) {
        this.clase = nuevaClase;
    }

    this.fuerza = Math.floor(Math.random() * 10) + 1;
    this.agilidad = Math.floor(Math.random() * 10) + 1;
    this.inteligencia = Math.floor(Math.random() * 10) + 1;

    // Aplicar bonus por clase ANTES del balanceo para que influyan en el resultado final
    if (this.clase === 'guerrero') {
        this.fuerza += 3;
        this.agilidad += 1;
    } else if (this.clase === 'explorador') {
        this.agilidad += 4;
    } else if (this.clase === 'mago') {
        this.inteligencia += 6;
    }

    let sum = this.fuerza + this.agilidad + this.inteligencia;

    if (sum > 24) {
      const exceso = sum - 24;
      if (this.fuerza >= this.agilidad && this.fuerza >= this.inteligencia) {
        this.fuerza -= exceso;
      } else if (this.agilidad >= this.fuerza && this.agilidad >= this.inteligencia) {
        this.agilidad -= exceso;
      } else {
        this.inteligencia -= exceso;
      }
    } else if (sum < 6) {
      if (this.fuerza >= this.agilidad && this.fuerza >= this.inteligencia) {
        this.fuerza = 15;
      } else if (this.agilidad >= this.fuerza && this.agilidad >= this.inteligencia) {
        this.agilidad = 15;
      } else {
        this.inteligencia = 15;
      }
    } else if (sum < 9) {
      if (this.fuerza <= this.agilidad && this.fuerza <= this.inteligencia) {
        this.fuerza = 8;
      } else if (this.agilidad <= this.fuerza && this.agilidad <= this.inteligencia) {
        this.agilidad = 8;
      } else {
        this.inteligencia = 8;
      }
    }

    this.vidaMaximaBase = Math.floor(10 * ((this.fuerza * 2 + this.agilidad) / 3));
    this.recalcularVidaMaxima();
    this.vidaActual = this.vidaMaxima;
  }

  /** Stats efectivos = base + bonos del equipo (no mutan la base). */
  statsEfectivos(): { fuerza: number; agilidad: number; inteligencia: number; vida: number } {
    return aplicarBonos(
      { fuerza: this.fuerza, agilidad: this.agilidad, inteligencia: this.inteligencia },
      bonosEquipo(this.equipo),
    );
  }

  /** Equipa un item del catálogo (resuelve conflictos de empuñadura) y reaplica efectos. */
  equiparItem(id: string): void {
    this.equipo = equipar(this.equipo, id);
    this.aplicarEquipo();
  }

  /** Vacía una ranura del equipo y reaplica efectos. */
  desequiparRanura(ranura: RanuraEquipo): void {
    this.equipo = desequipar(this.equipo, ranura);
    this.aplicarEquipo();
  }

  anadirItem(id: string, cantidad: number = 1): void {
    this.inventario = anadirAlInventario(this.inventario, id, cantidad);
  }

  /** Recoge botín: equipo → bulto (sin duplicar); consumibles/materiales → mochila. */
  recibirBotin(botin: Array<{ id: string; cantidad: number }>): void {
    for (const b of botin) {
      const it = ITEMS[b.id];
      if (!it) continue;
      if (it.tipo === 'equipo') {
        this.bulto.push(b.id);
      } else {
        this.inventario = anadirAlInventario(this.inventario, b.id, b.cantidad);
      }
    }
  }

  /** Munición del arco: gasta una flecha. Devuelve false si no hay. */
  consumirFlecha(): boolean {
    if ((this.inventario.flecha ?? 0) <= 0) return false;
    this.inventario = consumir(this.inventario, 'flecha', 1);
    return true;
  }

  /** ¿Lleva un pico empuñado? (requisito para cavar). */
  puedeCavar(): boolean {
    return this.equipo.mano_derecha === 'pico' || this.equipo.mano_izquierda === 'pico';
  }

  /** Capacidad máxima de carga según la fuerza efectiva (kg). */
  capacidadMaxima(): number {
    return capacidadMaxima(this.statsEfectivos().fuerza);
  }

  /** Peso actual (equipo puesto + mochila). */
  peso(): number {
    return pesoTotal(this.equipo, this.inventario);
  }

  /** Penalización por sobrecarga (ataque, defensa, coste de movimiento). */
  penalizacion(): { ataque: number; defensa: number; movimiento: number } {
    return penalizacionSobrecarga(this.peso(), this.capacidadMaxima());
  }

  /** Daño de las armas empuñadas (el pico resta 1). */
  danoArma(): number {
    return danoArma(this.equipo);
  }

  /** Serializa equipo, bulto y mochila para sesión/red. */
  exportarInventario(): InventarioGuardado {
    return { formato: 1, puesto: { ...this.equipo }, bulto: [...this.bulto], mochila: { ...this.inventario } };
  }

  /** Aplica un payload guardado (saneado). Payload inválido → no altera el estado. */
  importarInventario(raw: unknown): void {
    const g = sanearEquipoGuardado(raw);
    if (!g) return;
    this.equipo = g.puesto;
    this.bulto = g.bulto;
    this.inventario = g.mochila;
    this.aplicarEquipo();
  }

  consumirItem(id: string, cantidad: number = 1): void {
    this.inventario = consumir(this.inventario, id, cantidad);
  }

  /** Usa un consumible: aplica su efecto (p. ej. curar) y lo gasta. Devuelve true si hubo efecto. */
  usarItem(id: string): boolean {
    if ((this.inventario[id] ?? 0) <= 0) return false;
    const item = ITEMS[id];
    if (!item || item.tipo !== 'consumible') return false;
    if (item.curacion) {
      this.vidaActual = Math.min(this.vidaMaxima, this.vidaActual + item.curacion);
    }
    this.inventario = consumir(this.inventario, id, 1);
    return true;
  }

  /** Sincroniza apariencia (equipo viste al avatar; el pelo es cosmético) y vida máxima. */
  aplicarEquipo(): void {
    const p = piezasDeEquipo(this.equipo);
    this.apariencia = {
      ...this.apariencia,
      piezas: { ...this.apariencia.piezas, torso: p.torso, piernas: p.piernas, casco: p.casco },
    };
    this.recalcularVidaMaxima();
  }

  private recalcularVidaMaxima(): void {
    this.vidaMaxima = this.vidaMaximaBase + bonosEquipo(this.equipo).vida;
    if (this.vidaActual > this.vidaMaxima) this.vidaActual = this.vidaMaxima;
  }


  recibirDano(cantidad: number, atacante?: EntidadRPG | null): number {
    if (Date.now() < this.inmunidadHasta) {
        return 0;
    }
    const result = super.recibirDano(cantidad, atacante);
    if (cantidad > 0) {
      this.pasosDesdeUltimoDano = 0;
    }
    return result;
  }

  intentarMover(deltaFila: number, deltaColumna: number, game: IGame): boolean {
    if (!this.estaVivo) return false;

    const ahora = Date.now();
    const costePaso = 100 * (1 + this.penalizacion().movimiento);
    if (ahora - this.ultimaInteraccion < costePaso) return false;
    this.ultimaInteraccion = ahora;

    const net: any = game.network;
    const netHttp: any = (game as any).networkHttp;
    const mpActivo = !!(net && net.multiplayerActivo) || !!(netHttp && netHttp.multiplayerActivo);
    const idLocal = (net && net.multiplayerActivo ? net.idLocal : (netHttp?.idLocal ?? 'local'));
    const enviar = (msg: any) => {
      if (net && net.multiplayerActivo) net.enviarMensaje(msg);
      else if (netHttp && netHttp.multiplayerActivo) netHttp.enviarMensaje(msg);
    };

    if (mpActivo) {
        if (game.esHost) {
            (game as any).colaAcciones.push({ id: idLocal, accion: { tipo: 'mover', df: deltaFila, dc: deltaColumna } });
        } else {
            enviar({ tipo: 'action', accion: { tipo: 'mover', df: deltaFila, dc: deltaColumna } });

            // Predicción local para feedback inmediato
            const sigF = this.fila + deltaFila;
            const sigC = this.columna + deltaColumna;

            // Solo predecir movimiento si no hay colisiones obvias con muros o NPCs
            const celdaActual = game.mapaLaberinto[this.fila]?.[this.columna];
            let muroBloquea = false;
            if (deltaFila === -1 && celdaActual?.muros?.superior) muroBloquea = true;
            if (deltaFila === 1 && celdaActual?.muros?.inferior) muroBloquea = true;
            if (deltaColumna === -1 && celdaActual?.muros?.izquierdo) muroBloquea = true;
            if (deltaColumna === 1 && celdaActual?.muros?.derecho) muroBloquea = true;

            const npcEnCasilla = game.listaDeEnemigos.some(e => e.estaVivo && e.fila === sigF && e.columna === sigC);

            if (!muroBloquea && !npcEnCasilla && game.mapaLaberinto[sigF]?.[sigC]?.esTransitable) {
                this.fila = sigF;
                this.columna = sigC;
            }
        }
        this.estaCaminando = true;
        return true;
    } else {
        if ((game as any).juegoPausado) return false;
        (game as any).colaAcciones.push({ id: idLocal, accion: { tipo: 'mover', df: deltaFila, dc: deltaColumna } });
        return true;
    }
  }
}
