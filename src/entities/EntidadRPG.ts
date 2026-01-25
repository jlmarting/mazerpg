
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

  abstract recibirDano(cantidad: number, atacante?: EntidadRPG | null): number;
  abstract dibujar(ctx: CanvasRenderingContext2D, offset: { colOffset: number, filaOffset: number }, config: any): void;

  dibujarBarraVida(ctx: CanvasRenderingContext2D, offset: { colOffset: number, filaOffset: number }, config: any) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP, CELDAS_VISIBLES_X, CELDAS_VISIBLES_Y } = config;

    if (this.fila < filaOffset || this.fila >= filaOffset + CELDAS_VISIBLES_Y ||
        this.columna < colOffset || this.columna >= colOffset + CELDAS_VISIBLES_X) return;

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
