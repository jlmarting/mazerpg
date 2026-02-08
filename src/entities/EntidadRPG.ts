import { IEntidadRPG } from '../types';

/**
 * Clase base para todas las entidades del juego (Jugadores, NPCs).
 * Contiene el estado lógico, estadísticas y lógica de combate.
 */
export abstract class EntidadRPG implements IEntidadRPG {
  fila: number;
  columna: number;
  nombre: string;
  fuerza: number;
  agilidad: number;
  inteligencia: number;
  modDano: number;
  vidaMaxima: number;
  vidaActual: number;
  estaVivo: boolean;
  estaCaminando: boolean;
  ultimaVezMovido: number;
  enCombateCon: EntidadRPG | null;
  puntosExperiencia: number = 0;
  inmunidadHasta: number = 0;
  consecutiveInteractions: Map<string, number> = new Map();
  public bubbleChat: { texto: string, expira: number } | null = null;
  public onDamageReceived?: (amount: number, entity: EntidadRPG) => void;

  // Sistema de Animación y Estados
  estadoActual: 'idle' | 'walking' | 'attacking' | 'defending' | 'fallen' = 'idle';
  frameActual: number = 0;
  ultimaActualizacionFrame: number = 0;
  estadoExpira: number = 0;

  constructor(fila: number, columna: number, nombre: string) {
    this.fila = fila;
    this.columna = columna;
    this.nombre = nombre;

    this.fuerza = Math.floor(Math.random() * 10) + 1;
    this.agilidad = Math.floor(Math.random() * 10) + 1;
    this.inteligencia = Math.floor(Math.random() * 10) + 1;
    this.modDano = 0;

    this.vidaMaxima = Math.floor(10 * ((this.fuerza * 2 + this.agilidad) / 3));
    this.vidaActual = this.vidaMaxima;

    this.estaVivo = true;
    this.estaCaminando = false;
    this.ultimaVezMovido = 0;
    this.enCombateCon = null;
  }

  obtenerIniciativa(): number {
    const dado = Math.floor(Math.random() * 10) + 1;
    return dado + (this.agilidad + (this.inteligencia * 2)) / 3;
  }

  generarAtaque(): number {
    const dado = Math.floor(Math.random() * 10) + 1;
    return dado + this.fuerza + this.modDano;
  }

  generarDefensa(): number {
    const dado = Math.floor(Math.random() * 10) + 1;
    return dado + this.agilidad;
  }

  recibirDano(cantidad: number, _atacante?: EntidadRPG | null): number {
    this.vidaActual = Math.max(0, this.vidaActual - cantidad);
    if (this.vidaActual <= 0) {
      this.estaVivo = false;
      this.vidaActual = 0;
      this.setEstado('fallen');
    } else if (cantidad > 0 && this.estadoActual !== 'attacking') {
        this.setEstado('defending', 500);
    }

    if (this.onDamageReceived && cantidad > 0) {
      this.onDamageReceived(cantidad, this);
    }
    return cantidad;
  }

  setEstado(nuevoEstado: 'idle' | 'walking' | 'attacking' | 'defending' | 'fallen', duracion: number = 0) {
    if (this.estadoActual === 'fallen' && nuevoEstado !== 'fallen') return; // Una vez caído, no cambia (a menos que reviva)

    if (this.estadoActual !== nuevoEstado) {
        this.estadoActual = nuevoEstado;
        this.frameActual = 0;
        this.ultimaActualizacionFrame = Date.now();
    }

    if (duracion > 0) {
        this.estadoExpira = Date.now() + duracion;
    } else {
        this.estadoExpira = 0;
    }
  }

  /**
   * Actualiza el estado de animación y lógica temporal de la entidad.
   */
  actualizarEstado() {
    const ahora = Date.now();

    // Volver a idle si el estado temporal expiró
    if (this.estadoExpira > 0 && ahora > this.estadoExpira) {
        this.estadoExpira = 0;
    }

    if (this.estaVivo && this.estadoExpira === 0) {
        const estadoDeseado = this.estaCaminando ? 'walking' : 'idle';
        if (this.estadoActual !== estadoDeseado) {
            this.setEstado(estadoDeseado);
        }
    }

    // Actualizar frames (ej. cada 200ms)
    const msPorFrame = 200;
    if (ahora - this.ultimaActualizacionFrame > msPorFrame) {
        this.ultimaActualizacionFrame = ahora;

        const spriteManager = (window as any).game?.renderer?.spriteManager;
        let maxFrames = 1;

        if (spriteManager) {
            const prefix = (this as any).tipo !== undefined ? 'npc' : 'player';
            const clase = (this as any).clase || (this as any).tipo?.toLowerCase() || 'guerrero';
            const keyBase = `${prefix}_${clase}_${this.estadoActual}`;
            maxFrames = spriteManager.obtenerContadorFrames(keyBase) || 1;
        }

        if (this.estadoActual === 'fallen' && this.frameActual === maxFrames - 1 && maxFrames > 1) {
            // Se queda en el último frame de caído
        } else {
            this.frameActual = (this.frameActual + 1) % maxFrames;
        }
    }
  }
}
