import { EntidadRPG } from './EntidadRPG';

export class Jugador extends EntidadRPG {
  pasosDesdeUltimoDano: number = 0;

  constructor() {
    super(0, 0, "Jugador");
  }

  dibujar(ctx: CanvasRenderingContext2D, offset: { colOffset: number, filaOffset: number }, config: any) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP } = config;
    const x = (this.columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const y = (this.fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;
    const escala = TAMANO_CELDA * 0.6;

    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y - escala / 3, escala / 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - escala / 6);
    ctx.lineTo(x, y + escala / 6);
    ctx.stroke();

    let desfasePierna = this.estaCaminando ? Math.sin(Date.now() / 100) * (escala / 4) : 0;
    ctx.beginPath();
    ctx.moveTo(x, y + escala / 6);
    ctx.lineTo(x - escala / 6 + desfasePierna, y + escala / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + escala / 6);
    ctx.lineTo(x + escala / 6 - desfasePierna, y + escala / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - escala / 4, y);
    ctx.lineTo(x + escala / 4, y);
    ctx.stroke();
  }

  recibirDano(cantidad: number): number {
    this.vidaActual = Math.max(0, this.vidaActual - cantidad);
    if (cantidad > 0) this.pasosDesdeUltimoDano = 0;
    if (this.vidaActual <= 0) this.estaVivo = false;
    return cantidad;
  }

  intentarMover(deltaFila: number, deltaColumna: number, game: any): boolean {
    if (!this.estaVivo) return false;
    const sigFila = this.fila + deltaFila;
    const sigColumna = this.columna + deltaColumna;
    const enemigoEnCasilla = game.listaDeEnemigos.find((e: any) => e.fila === sigFila && e.columna === sigColumna && e.estaVivo);
    if (enemigoEnCasilla) {
      game.iniciarCombate(this, enemigoEnCasilla);
      return false;
    }
    const celdaActual = game.mapaLaberinto[this.fila][this.columna];
    let esMovimientoValido = false;
    if (deltaFila === -1 && !celdaActual.muros.superior) esMovimientoValido = true;
    if (deltaFila === 1 && !celdaActual.muros.inferior) esMovimientoValido = true;
    if (deltaColumna === -1 && !celdaActual.muros.izquierdo) esMovimientoValido = true;
    if (deltaColumna === 1 && !celdaActual.muros.derecho) esMovimientoValido = true;
    if (esMovimientoValido) {
      this.fila += deltaFila;
      this.columna += deltaColumna;
      this.estaCaminando = true;
      this.ultimaVezMovido = Date.now();
      return true;
    }
    return false;
  }
}
