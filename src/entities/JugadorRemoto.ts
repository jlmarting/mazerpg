import { EntidadRPG } from './EntidadRPG';
import { CameraOffset, GameConfig } from '../types';

export class JugadorRemoto extends EntidadRPG {
  constructor(fila: number, columna: number, nombre: string) {
    super(fila, columna, nombre);
  }

  dibujar(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP, CELDAS_VISIBLES_X, CELDAS_VISIBLES_Y } = config;

    if (this.fila < filaOffset || this.fila >= filaOffset + CELDAS_VISIBLES_Y ||
        this.columna < colOffset || this.columna >= colOffset + CELDAS_VISIBLES_X) return;

    const x = (this.columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const y = (this.fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;
    const escala = TAMANO_CELDA * 0.6;

    ctx.save();

    if (!this.estaVivo) {
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 2);
        ctx.translate(-x, -y);
        ctx.strokeStyle = '#555';
    } else {
        ctx.strokeStyle = '#28a745';
    }

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.arc(x, y - escala/3, escala/6, 0, Math.PI * 2);
    ctx.moveTo(x, y - escala/6);
    ctx.lineTo(x, y + escala/6);
    let desfasePierna = (this.estaCaminando && this.estaVivo) ? Math.sin(Date.now() / 100) * (escala/4) : 0;
    ctx.moveTo(x, y + escala/6); ctx.lineTo(x - escala/6 + desfasePierna, y + escala/2);
    ctx.moveTo(x, y + escala/6); ctx.lineTo(x + escala/6 - desfasePierna, y + escala/2);
    ctx.moveTo(x - escala/4, y); ctx.lineTo(x + escala/4, y);
    ctx.stroke();

    ctx.fillStyle = this.estaVivo ? '#28a745' : '#555';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.nombre, x, y - escala);

    ctx.restore();
  }

  recibirDano(cantidad: number, _atacante?: EntidadRPG | null): number {
    return super.recibirDano(cantidad, _atacante);
  }
}
