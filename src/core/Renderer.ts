import { Celda } from '../world/Celda';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  limpiar() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  dibujarLaberinto(mapaLaberinto: Celda[][], offset: { colOffset: number, filaOffset: number }, config: any) {
    const { colOffset, filaOffset } = offset;
    const { NUMERO_FILAS, NUMERO_COLUMNAS, TAMANO_CELDA, ALTO_UI_TOP, CELDAS_VISIBLES_X, CELDAS_VISIBLES_Y } = config;

    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, ALTO_UI_TOP, this.canvas.width, CELDAS_VISIBLES_Y * TAMANO_CELDA);

    for (let fila = filaOffset; fila < filaOffset + CELDAS_VISIBLES_Y; fila++) {
      if (fila < 0 || fila >= NUMERO_FILAS) continue;
      for (let columna = colOffset; columna < colOffset + CELDAS_VISIBLES_X; columna++) {
        if (columna < 0 || columna >= NUMERO_COLUMNAS) continue;

        const celda = mapaLaberinto[fila][columna];
        if (celda.esTransitable) {
          this.ctx.fillStyle = '#FFF';
          this.ctx.fillRect((columna - colOffset) * TAMANO_CELDA, (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP, TAMANO_CELDA, TAMANO_CELDA);
        }
      }
    }

    // Meta
    const filaMeta = NUMERO_FILAS - 1;
    const colMeta = NUMERO_COLUMNAS - 1;
    if (filaMeta >= filaOffset && filaMeta < filaOffset + CELDAS_VISIBLES_Y &&
        colMeta >= colOffset && colMeta < colOffset + CELDAS_VISIBLES_X) {
        this.ctx.fillStyle = 'rgba(0, 200, 0, 0.6)';
        this.ctx.fillRect((colMeta - colOffset) * TAMANO_CELDA + 2, (filaMeta - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + 2, TAMANO_CELDA - 4, TAMANO_CELDA - 4);
        this.ctx.fillStyle = '#050';
        this.ctx.font = 'bold 10px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('META', (colMeta - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2, (filaMeta - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2 + 4);
        this.ctx.textAlign = 'left';
    }
  }

  dibujarNiebla(mapaLaberinto: Celda[][], offset: { colOffset: number, filaOffset: number }, config: any) {
    if (config.vistaDebugActivada) return;
    const { colOffset, filaOffset } = offset;
    const { NUMERO_FILAS, NUMERO_COLUMNAS, TAMANO_CELDA, ALTO_UI_TOP, CELDAS_VISIBLES_X, CELDAS_VISIBLES_Y, TIEMPO_DESVANECIMIENTO_NIEBLA } = config;

    const tiempoActual = Date.now();
    for (let fila = filaOffset; fila < filaOffset + CELDAS_VISIBLES_Y; fila++) {
      if (fila < 0 || fila >= NUMERO_FILAS) continue;
      for (let columna = colOffset; columna < colOffset + CELDAS_VISIBLES_X; columna++) {
        if (columna < 0 || columna >= NUMERO_COLUMNAS) continue;

        const celda = mapaLaberinto[fila][columna];
        let opacidad = 1;

        if (celda.ultimoAvistamiento > 0) {
          const tiempoDesdeVisto = tiempoActual - celda.ultimoAvistamiento;
          if (tiempoDesdeVisto < 50) {
            opacidad = 0;
          } else {
            opacidad = Math.min(1, tiempoDesdeVisto / TIEMPO_DESVANECIMIENTO_NIEBLA);
          }
        }

        if (opacidad > 0) {
          this.ctx.fillStyle = `rgba(0, 0, 0, ${opacidad})`;
          this.ctx.fillRect((columna - colOffset) * TAMANO_CELDA, (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP, TAMANO_CELDA, TAMANO_CELDA);
        }
      }
    }
  }

  dibujarUI(config: any) {
    const { ALTO_UI_TOP, ALTO_UI_BOTTOM, CELDAS_VISIBLES_Y, TAMANO_CELDA, protagonista, enemigoVisible, colaDeMensajes, juegoTerminado } = config;

    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(0, 0, this.canvas.width, ALTO_UI_TOP);
    this.ctx.fillRect(0, ALTO_UI_TOP + (CELDAS_VISIBLES_Y * TAMANO_CELDA), this.canvas.width, ALTO_UI_BOTTOM);

    this.ctx.strokeStyle = '#555';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, ALTO_UI_TOP); this.ctx.lineTo(this.canvas.width, ALTO_UI_TOP);
    this.ctx.moveTo(0, this.canvas.height - ALTO_UI_BOTTOM); this.ctx.lineTo(this.canvas.width, this.canvas.height - ALTO_UI_BOTTOM);
    this.ctx.stroke();

    this.ctx.fillStyle = '#fff';
    this.ctx.font = 'bold 12px monospace';
    this.ctx.fillText("HÉROE", 10, 20);
    this.ctx.font = '11px monospace';
    this.ctx.fillText(`HP: ${protagonista.vidaActual}/${protagonista.vidaMaxima}`, 10, 35);
    this.ctx.fillText(`FUE:${protagonista.fuerza} AGI:${protagonista.agilidad} INT:${protagonista.inteligencia}`, 10, 50);

    if (enemigoVisible) {
      this.ctx.textAlign = 'right';
      this.ctx.fillStyle = '#f55';
      this.ctx.font = 'bold 12px monospace';
      this.ctx.fillText(enemigoVisible.nombre.toUpperCase(), this.canvas.width - 10, 20);
      this.ctx.font = '11px monospace';
      this.ctx.fillText(`HP: ${enemigoVisible.vidaActual}/${enemigoVisible.vidaMaxima}`, this.canvas.width - 10, 35);
      this.ctx.fillText(`FUE:${enemigoVisible.fuerza} AGI:${enemigoVisible.agilidad}`, this.canvas.width - 10, 50);
      this.ctx.textAlign = 'left';
    }

    this.ctx.fillStyle = '#aaa';
    this.ctx.font = '10px monospace';
    colaDeMensajes.forEach((msj: string, i: number) => {
      this.ctx.fillText(msj, 10, this.canvas.height - ALTO_UI_BOTTOM + 20 + (i * 15));
    });

    if (juegoTerminado) {
      this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
      this.ctx.fillRect(0, ALTO_UI_TOP, this.canvas.width, CELDAS_VISIBLES_Y * TAMANO_CELDA);
      this.ctx.fillStyle = '#fff';
      this.ctx.font = 'bold 16px monospace';
      this.ctx.textAlign = 'center';
      const msjFin = protagonista.vidaActual > 0 ? "¡VICTORIA!" : "HAS CAÍDO";
      this.ctx.fillText(msjFin, this.canvas.width / 2, ALTO_UI_TOP + 100);
      this.ctx.textAlign = 'left';
    }
  }

  dibujarMarcadoresMovimiento(config: any) {
    if (config.juegoTerminado) return;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    const tam = 20;
    const centroX = this.canvas.width / 2;
    const centroY = config.ALTO_UI_TOP + (config.CELDAS_VISIBLES_Y * config.TAMANO_CELDA) / 2;
    const gap = 10;

    this.ctx.beginPath();
    this.ctx.moveTo(centroX, config.ALTO_UI_TOP + gap);
    this.ctx.lineTo(centroX - tam, config.ALTO_UI_TOP + gap + tam);
    this.ctx.lineTo(centroX + tam, config.ALTO_UI_TOP + gap + tam);
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.moveTo(centroX, config.ALTO_UI_TOP + (config.CELDAS_VISIBLES_Y * config.TAMANO_CELDA) - gap);
    this.ctx.lineTo(centroX - tam, config.ALTO_UI_TOP + (config.CELDAS_VISIBLES_Y * config.TAMANO_CELDA) - gap - tam);
    this.ctx.lineTo(centroX + tam, config.ALTO_UI_TOP + (config.CELDAS_VISIBLES_Y * config.TAMANO_CELDA) - gap - tam);
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.moveTo(gap, centroY);
    this.ctx.lineTo(gap + tam, centroY - tam);
    this.ctx.lineTo(gap + tam, centroY + tam);
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.moveTo(this.canvas.width - gap, centroY);
    this.ctx.lineTo(this.canvas.width - gap - tam, centroY - tam);
    this.ctx.lineTo(this.canvas.width - gap - tam, centroY + tam);
    this.ctx.fill();
  }

  getCtx() {
    return this.ctx;
  }
}
