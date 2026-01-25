import { EntidadRPG } from './EntidadRPG';

export class JugadorRemoto extends EntidadRPG {
  constructor(f: number, c: number, nombre: string) {
    super(f, c, nombre);
  }

  dibujar(ctx: CanvasRenderingContext2D, offset: { colOffset: number, filaOffset: number }, config: any) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP, CELDAS_VISIBLES_Y, CELDAS_VISIBLES_X } = config;

    if (this.fila < filaOffset || this.fila >= filaOffset + CELDAS_VISIBLES_Y ||
        this.columna < colOffset || this.columna >= colOffset + CELDAS_VISIBLES_X) return;

    const x = (this.columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const y = (this.fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;
    const escala = TAMANO_CELDA * 0.6;

    ctx.strokeStyle = '#28a745';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.arc(x, y - escala / 3, escala / 6, 0, Math.PI * 2);
    ctx.moveTo(x, y - escala / 6);
    ctx.lineTo(x, y + escala / 6);
    let desfasePierna = this.estaCaminando ? Math.sin(Date.now() / 100) * (escala / 4) : 0;
    ctx.moveTo(x, y + escala / 6); ctx.lineTo(x - escala / 6 + desfasePierna, y + escala / 2);
    ctx.moveTo(x, y + escala / 6); ctx.lineTo(x + escala / 6 - desfasePierna, y + escala / 2);
    ctx.moveTo(x - escala / 4, y); ctx.lineTo(x + escala / 4, y);
    ctx.stroke();

    ctx.fillStyle = '#28a745';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.nombre, x, y - escala);
    ctx.textAlign = 'left';
  }

  recibirDano(cantidad: number): number {
    this.vidaActual = Math.max(0, this.vidaActual - cantidad);
    if (this.vidaActual <= 0) {
      this.estaVivo = false;
      this.vidaActual = 0;
    }
    return cantidad;
  }
}
