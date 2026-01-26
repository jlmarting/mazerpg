import { EntidadRPG } from './EntidadRPG';

export class JugadorRemoto extends EntidadRPG {
  dibujar(ctx: CanvasRenderingContext2D, offset: { colOffset: number, filaOffset: number }, config: any) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP } = config;
    const x = (this.columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const y = (this.fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;
    const escala = TAMANO_CELDA * 0.6;
    ctx.strokeStyle = '#28a745';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y - escala/3, escala/6, 0, Math.PI * 2);
    ctx.stroke();
  }

  recibirDano(cantidad: number): number {
    this.vidaActual = Math.max(0, this.vidaActual - cantidad);
    if (this.vidaActual <= 0) this.estaVivo = false;
    return cantidad;
  }
}
