import { EntidadRPG } from './EntidadRPG';
import { CameraOffset, GameConfig } from '../types';

export class JugadorRemoto extends EntidadRPG {
  public id: string;
  constructor(fila: number, columna: number, nombre: string, id: string) {
    super(fila, columna, nombre);
    this.id = id;
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
        ctx.fillStyle = '#888';
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;

        const w = TAMANO_CELDA * 0.7;
        const h = TAMANO_CELDA * 0.8;
        ctx.beginPath();
        ctx.moveTo(x - w/2, y + h/2);
        ctx.lineTo(x - w/2, y - h/4);
        ctx.arc(x, y - h/4, w/2, Math.PI, 0);
        ctx.lineTo(x + w/2, y + h/2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#444';
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('RIP', x, y + 2);
    } else {
        ctx.strokeStyle = '#28a745';
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
    }

    ctx.restore();
  }

  recibirDano(cantidad: number, _atacante?: EntidadRPG | null): number {
    return super.recibirDano(cantidad, _atacante);
  }
}
