import { CameraOffset, GameConfig } from '../types';

export abstract class EntidadRPG {
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
  consecutiveInteractions: Map<string, number> = new Map();
  public bubbleChat: { texto: string, expira: number } | null = null;
  public onDamageReceived?: (amount: number, entity: EntidadRPG) => void;

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
    }
    if (this.onDamageReceived && cantidad > 0) {
      this.onDamageReceived(cantidad, this);
    }
    return cantidad;
  }

  abstract dibujar(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig, mapaLaberinto?: any): void;

  dibujarBubbleChat(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig) {
    if (!this.bubbleChat || Date.now() > this.bubbleChat.expira) {
        this.bubbleChat = null;
        return;
    }

    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP } = config;
    const x = (this.columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const y = (this.fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP - 10;

    ctx.save();
    ctx.font = '10px Arial';
    const metrics = ctx.measureText(this.bubbleChat.texto);
    const padding = 4;
    const w = metrics.width + padding * 2;
    const h = 14;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h, w, h, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.fillText(this.bubbleChat.texto, x, y - 3);
    ctx.restore();
  }

  dibujarBarraVida(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig, mapaLaberinto: any[][]) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP, CELDAS_VISIBLES_X, CELDAS_VISIBLES_Y, vistaDebugActivada, TIEMPO_DESVANECIMIENTO_NIEBLA } = config;

    if (this.fila < filaOffset || this.fila >= filaOffset + CELDAS_VISIBLES_Y ||
        this.columna < colOffset || this.columna >= colOffset + CELDAS_VISIBLES_X) return;

    // Niebla de guerra para barra de vida
    const celdaActual = mapaLaberinto[this.fila][this.columna];
    if (!vistaDebugActivada && celdaActual) {
        const tiempoDesdeVisto = Date.now() - celdaActual.ultimoAvistamiento;
        if (celdaActual.ultimoAvistamiento === 0 || tiempoDesdeVisto > TIEMPO_DESVANECIMIENTO_NIEBLA) {
            return;
        }
    }

    const x = (this.columna - colOffset) * TAMANO_CELDA + 2;
    const y = (this.fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + 2;
    const anchoBarra = TAMANO_CELDA - 4;
    const altoBarra = 4;

    const pct = this.vidaActual / this.vidaMaxima;
    const hue = pct * 120;

    ctx.fillStyle = "#333";
    ctx.fillRect(x, y, anchoBarra, altoBarra);
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    ctx.fillRect(x, y, anchoBarra * pct, altoBarra);
  }
}
