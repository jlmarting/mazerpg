import { Celda } from '../world/Celda';
import { CameraOffset, GameConfig } from '../types';

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

  aplicarZoom(config: GameConfig) {
    const z = config.zoom;
    const { ALTO_UI_TOP, ALTO_UI_BOTTOM } = config;
    const mazeWidth = this.canvas.width;
    const mazeHeight = this.canvas.height - ALTO_UI_TOP - ALTO_UI_BOTTOM;

    this.ctx.save();

    // Recorte para que el zoom no afecte a la UI estática
    this.ctx.beginPath();
    this.ctx.rect(0, ALTO_UI_TOP, mazeWidth, mazeHeight);
    this.ctx.clip();

    // Centrar zoom
    this.ctx.translate(mazeWidth / 2, ALTO_UI_TOP + mazeHeight / 2);
    this.ctx.scale(z, z);
    this.ctx.translate(-mazeWidth / 2, -(ALTO_UI_TOP + mazeHeight / 2));
  }

  finalizarZoom() {
    this.ctx.restore();
  }

  obtenerOffsetCamara(protagonista: any, config: GameConfig): CameraOffset {
    if (!protagonista) return { colOffset: 0, filaOffset: 0 };

    const { TAMANO_CELDA, ALTO_UI_TOP, ALTO_UI_BOTTOM } = config;
    const mazeWidth = this.canvas.width;
    const mazeHeight = this.canvas.height - ALTO_UI_TOP - ALTO_UI_BOTTOM;

    // Calculamos el offset para que el protagonista esté exactamente en el centro del viewport
    // Usamos las coordenadas visuales para suavizar el movimiento de la cámara
    const fV = protagonista.visualFila !== undefined ? protagonista.visualFila : protagonista.fila;
    const cV = protagonista.visualColumna !== undefined ? protagonista.visualColumna : protagonista.columna;

    const colOffset = cV - (mazeWidth / TAMANO_CELDA / 2) + 0.5;
    const filaOffset = fV - (mazeHeight / TAMANO_CELDA / 2) + 0.5;

    return { colOffset, filaOffset };
  }

  dibujarLaberinto(mapaLaberinto: Celda[][], offset: CameraOffset, config: GameConfig) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP, CELDAS_VISIBLES_X, CELDAS_VISIBLES_Y, NUMERO_FILAS, NUMERO_COLUMNAS } = config;

    // Dibujamos el fondo negro para toda el área del laberinto visible
    // Lo hacemos antes de dibujar las celdas para evitar parpadeos
    this.ctx.fillStyle = '#000';

    // Calculamos un área generosa para el fondo que cubra todo el viewport escalado
    const mazeWidth = this.canvas.width;
    const mazeHeight = this.canvas.height - ALTO_UI_TOP;

    // En lugar de usar coordenadas escaladas, usamos un rectángulo enorme que cubra todo
    // ya que estamos dentro del clip() del aplicarZoom.
    this.ctx.fillRect(-mazeWidth * 2, -mazeHeight * 2, mazeWidth * 5, mazeHeight * 5);

    const fInicio = Math.floor(filaOffset);
    const fFin = Math.ceil(filaOffset + CELDAS_VISIBLES_Y);
    const cInicio = Math.floor(colOffset);
    const cFin = Math.ceil(colOffset + CELDAS_VISIBLES_X);

    // DIBUJAR REJILLA INFINITA
    this.ctx.strokeStyle = '#1a1a1a';
    this.ctx.lineWidth = 1;
    for (let f = fInicio; f <= fFin; f++) {
        const y = (f - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP;
        this.ctx.beginPath();
        this.ctx.moveTo((cInicio - colOffset) * TAMANO_CELDA, y);
        this.ctx.lineTo((cFin - colOffset) * TAMANO_CELDA, y);
        this.ctx.stroke();
    }
    for (let c = cInicio; c <= cFin; c++) {
        const x = (c - colOffset) * TAMANO_CELDA;
        this.ctx.beginPath();
        this.ctx.moveTo(x, (fInicio - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP);
        this.ctx.lineTo(x, (fFin - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP);
        this.ctx.stroke();
    }

    // DIBUJAR COORDENADAS FIJAS
    this.ctx.fillStyle = '#666';
    this.ctx.font = '7px monospace';
    this.ctx.textAlign = 'center';
    for (let f = fInicio; f < fFin; f++) {
        for (let c = cInicio; c < cFin; c++) {
            const x = (c - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
            const y = (f - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2 + 3;
            this.ctx.fillText(`${f},${c}`, x, y);
        }
    }
    this.ctx.textAlign = 'left';

    for (let fila = fInicio; fila < fFin; fila++) {
      if (fila < 0 || fila >= NUMERO_FILAS) continue;
      for (let columna = cInicio; columna < cFin; columna++) {
        if (columna < 0 || columna >= NUMERO_COLUMNAS) continue;

        const celda = mapaLaberinto[fila][columna];
        if (celda.esTransitable) {
          this.ctx.fillStyle = '#FFF';
          const x = (columna - colOffset) * TAMANO_CELDA;
          const y = (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP;
          this.ctx.fillRect(x, y, TAMANO_CELDA, TAMANO_CELDA);

          // Delinear bordes púrpura
          this.ctx.strokeStyle = '#800080';
          this.ctx.lineWidth = 2;

          if (fila === 0 || !mapaLaberinto[fila - 1][columna].esTransitable) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x + TAMANO_CELDA, y);
            this.ctx.stroke();
          }
          if (fila === NUMERO_FILAS - 1 || !mapaLaberinto[fila + 1][columna].esTransitable) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y + TAMANO_CELDA);
            this.ctx.lineTo(x + TAMANO_CELDA, y + TAMANO_CELDA);
            this.ctx.stroke();
          }
          if (columna === 0 || !mapaLaberinto[fila][columna - 1].esTransitable) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x, y + TAMANO_CELDA);
            this.ctx.stroke();
          }
          if (columna === NUMERO_COLUMNAS - 1 || !mapaLaberinto[fila][columna + 1].esTransitable) {
            this.ctx.beginPath();
            this.ctx.moveTo(x + TAMANO_CELDA, y);
            this.ctx.lineTo(x + TAMANO_CELDA, y + TAMANO_CELDA);
            this.ctx.stroke();
          }

          // Dibujar Burbuja
          if (celda.burbuja) {
            this.ctx.strokeStyle = '#87CEEB'; // Azul Celeste
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc((columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2, (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2, TAMANO_CELDA / 2.5, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.fillStyle = 'rgba(135, 206, 235, 0.3)';
            this.ctx.fill();
          }

          // Dibujar Portal
          if (celda.esPortal) {
            this.ctx.fillStyle = 'rgba(0, 0, 255, 0.4)';
            this.ctx.beginPath();
            this.ctx.moveTo((columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2, (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + 5);
            this.ctx.lineTo((columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA - 5, (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2);
            this.ctx.lineTo((columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2, (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA - 5);
            this.ctx.lineTo((columna - colOffset) * TAMANO_CELDA + 5, (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.strokeStyle = '#0000ff';
            this.ctx.stroke();
          }

          // Dibujar Alimento
          if (celda.alimento) {
            this.ctx.font = '16px serif';
            this.ctx.textAlign = 'center';
            let icon = '🍎';
            if (celda.alimento.tipo === 'Plátano') icon = '🍌';
            if (celda.alimento.tipo === 'Kiwi') icon = '🥝';
            if (celda.alimento.tipo === 'Brócoli') icon = '🥦';
            if (celda.alimento.tipo === 'Muslo de pollo') icon = '🍗';
            if (celda.alimento.tipo === 'Chuleta') icon = '🥩';
            if (celda.alimento.tipo === 'Pescado') icon = '🐟';

            this.ctx.fillText(icon, (columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2, (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2 + 6);
          }

          // Dibujar Pico
          if (celda.tienePico) {
            this.ctx.font = '16px serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('⛏️', (columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2, (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2 + 6);
          }
        }
      }
    }

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

  dibujarNiebla(mapaLaberinto: Celda[][], offset: CameraOffset, config: GameConfig) {
    if (config.vistaDebugActivada) return;
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP, CELDAS_VISIBLES_X, CELDAS_VISIBLES_Y, NUMERO_FILAS, NUMERO_COLUMNAS, TIEMPO_DESVANECIMIENTO_NIEBLA } = config;

    const tiempoActual = Date.now();
    const fInicio = Math.floor(filaOffset);
    const fFin = Math.ceil(filaOffset + CELDAS_VISIBLES_Y);
    const cInicio = Math.floor(colOffset);
    const cFin = Math.ceil(colOffset + CELDAS_VISIBLES_X);

    for (let fila = fInicio; fila < fFin; fila++) {
      if (fila < 0 || fila >= NUMERO_FILAS) continue;
      for (let columna = cInicio; columna < cFin; columna++) {
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

  dibujarUI(game: any) {
    const { ALTO_UI_TOP, ALTO_UI_BOTTOM } = game.config;

    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(0, 0, this.canvas.width, ALTO_UI_TOP);
    this.ctx.fillRect(0, this.canvas.height - ALTO_UI_BOTTOM, this.canvas.width, ALTO_UI_BOTTOM);

    this.ctx.strokeStyle = '#555';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, ALTO_UI_TOP); this.ctx.lineTo(this.canvas.width, ALTO_UI_TOP);
    this.ctx.moveTo(0, this.canvas.height - ALTO_UI_BOTTOM); this.ctx.lineTo(this.canvas.width, this.canvas.height - ALTO_UI_BOTTOM);
    this.ctx.stroke();

    this.ctx.fillStyle = '#fff';
    this.ctx.font = 'bold 12px monospace';
    this.ctx.fillText("HÉROE", 20, 20);
    this.ctx.font = '11px monospace';
    this.ctx.fillText(`HP: ${game.protagonista.vidaActual}/${game.protagonista.vidaMaxima}`, 20, 32);
    this.ctx.fillText(`FUE:${game.protagonista.fuerza} AGI:${game.protagonista.agilidad}`, 20, 44);
    this.ctx.fillText(`INT:${game.protagonista.inteligencia} XP:${game.protagonista.puntosExperiencia}`, 20, 56);

    let enemigoVisible = game.obtenerEnemigoAMostrar();
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
    game.colaDeMensajes.forEach((msj: string, i: number) => {
      this.ctx.fillText(msj, 10, this.canvas.height - ALTO_UI_BOTTOM + 20 + (i * 15));
    });

    if (game.juegoTerminado) {
      this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
      this.ctx.fillRect(0, ALTO_UI_TOP, this.canvas.width, this.canvas.height - ALTO_UI_TOP - ALTO_UI_BOTTOM);
      this.ctx.fillStyle = '#fff';
      this.ctx.font = 'bold 16px monospace';
      this.ctx.textAlign = 'center';
      const msjFin = game.protagonista.vidaActual > 0 ? "¡VICTORIA!" : "HAS CAÍDO";
      this.ctx.fillText(msjFin, this.canvas.width / 2, ALTO_UI_TOP + 100);
      this.ctx.textAlign = 'left';
    }
  }

  dibujarProyectil(p: any, offset: CameraOffset, config: GameConfig) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP } = config;

    const curX = p.x + (p.targetX - p.x) * p.pct;
    const curY = p.y + (p.targetY - p.y) * p.pct;

    const screenX = (curX - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const screenY = (curY - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;

    this.ctx.fillStyle = p.color;
    this.ctx.beginPath();
    this.ctx.arc(screenX, screenY, 5, 0, Math.PI * 2);
    this.ctx.fill();

    // Estela
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = p.color;
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
  }

  dibujarMarcadoresMovimiento(config: GameConfig) {
    const { ALTO_UI_TOP, ALTO_UI_BOTTOM } = config;
    const mazeHeight = this.canvas.height - ALTO_UI_TOP - ALTO_UI_BOTTOM;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    const tam = 20;
    const centroX = this.canvas.width / 2;
    const centroY = ALTO_UI_TOP + mazeHeight / 2;
    const gap = 10;

    // Arriba
    this.ctx.beginPath();
    this.ctx.moveTo(centroX, ALTO_UI_TOP + gap);
    this.ctx.lineTo(centroX - tam, ALTO_UI_TOP + gap + tam);
    this.ctx.lineTo(centroX + tam, ALTO_UI_TOP + gap + tam);
    this.ctx.fill();

    // Abajo
    this.ctx.beginPath();
    this.ctx.moveTo(centroX, ALTO_UI_TOP + mazeHeight - gap);
    this.ctx.lineTo(centroX - tam, ALTO_UI_TOP + mazeHeight - gap - tam);
    this.ctx.lineTo(centroX + tam, ALTO_UI_TOP + mazeHeight - gap - tam);
    this.ctx.fill();

    // Izquierda
    this.ctx.beginPath();
    this.ctx.moveTo(gap, centroY);
    this.ctx.lineTo(gap + tam, centroY - tam);
    this.ctx.lineTo(gap + tam, centroY + tam);
    this.ctx.fill();

    // Derecha
    this.ctx.beginPath();
    this.ctx.moveTo(this.canvas.width - gap, centroY);
    this.ctx.lineTo(this.canvas.width - gap - tam, centroY - tam);
    this.ctx.lineTo(this.canvas.width - gap - tam, centroY + tam);
    this.ctx.fill();
  }

  getCtx() { return this.ctx; }
}
