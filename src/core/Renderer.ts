import { Celda } from '../world/Celda';
import { CameraOffset, GameConfig, IEntidadRPG } from '../types';
import { SpriteManager } from './SpriteManager';

/**
 * Clase responsable de toda la lógica de renderizado del juego.
 * Centraliza el dibujo del laberinto, entidades, efectos y UI.
 */
export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public spriteManager: SpriteManager;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.spriteManager = new SpriteManager();
  }

  /**
   * Limpia el canvas para el siguiente frame.
   */
  limpiar() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Aplica la transformación de zoom al contexto de dibujo.
   * @param config Configuración con el nivel de zoom y márgenes de UI.
   */
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

  /**
   * Restaura el contexto de dibujo eliminando el zoom aplicado.
   */
  finalizarZoom() {
    this.ctx.restore();
  }

  /**
   * Calcula el desplazamiento de la cámara para centrarla en el protagonista.
   */
  obtenerOffsetCamara(protagonista: any, config: GameConfig): CameraOffset {
    if (!protagonista) return { colOffset: 0, filaOffset: 0 };

    const { TAMANO_CELDA, ALTO_UI_TOP, ALTO_UI_BOTTOM } = config;
    const mazeWidth = this.canvas.width;
    const mazeHeight = this.canvas.height - ALTO_UI_TOP - ALTO_UI_BOTTOM;

    // Calculamos el offset para que el protagonista esté exactamente en el centro del viewport
    const colOffset = protagonista.columna - (mazeWidth / TAMANO_CELDA / 2) + 0.5;
    const filaOffset = protagonista.fila - (mazeHeight / TAMANO_CELDA / 2) + 0.5;

    return { colOffset, filaOffset };
  }

  /**
   * Dibuja el suelo, muros y objetos estáticos del laberinto.
   */
  dibujarLaberinto(mapaLaberinto: Celda[][], offset: CameraOffset, config: GameConfig) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP, CELDAS_VISIBLES_X, CELDAS_VISIBLES_Y, NUMERO_FILAS, NUMERO_COLUMNAS } = config;

    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, ALTO_UI_TOP, this.canvas.width, CELDAS_VISIBLES_Y * TAMANO_CELDA);

    const fInicio = Math.floor(filaOffset);
    const fFin = Math.ceil(filaOffset + CELDAS_VISIBLES_Y);
    const cInicio = Math.floor(colOffset);
    const cFin = Math.ceil(colOffset + CELDAS_VISIBLES_X);

    for (let fila = fInicio; fila < fFin; fila++) {
      if (fila < 0 || fila >= NUMERO_FILAS) continue;
      for (let columna = cInicio; columna < cFin; columna++) {
        if (columna < 0 || columna >= NUMERO_COLUMNAS) continue;

        const celda = mapaLaberinto[fila][columna];
        const x = (columna - colOffset) * TAMANO_CELDA;
        const y = (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP;

        if (celda.esTransitable) {
          // Intentar dibujar sprite de suelo (Hoja de escenario estático)
          const spriteSuelo = 'static_suelo_cesped';
          if (this.spriteManager.obtenerSprite(spriteSuelo)) {
            this.spriteManager.dibujarSprite(this.ctx, spriteSuelo, x, y, TAMANO_CELDA, TAMANO_CELDA);
          } else if (this.spriteManager.obtenerSprite('floor')) {
            this.spriteManager.dibujarSprite(this.ctx, 'floor', x, y, TAMANO_CELDA, TAMANO_CELDA);
          } else {
            this.ctx.fillStyle = '#FFF';
            this.ctx.fillRect(x, y, TAMANO_CELDA, TAMANO_CELDA);
          }

          // Delinear bordes o dibujar muros con sprites
          this.ctx.strokeStyle = '#800080';
          this.ctx.lineWidth = 2;

          if (fila === 0 || !mapaLaberinto[fila - 1][columna].esTransitable || celda.muros.superior) {
            const spriteMuro = 'static_muro_normal';
            if (this.spriteManager.obtenerSprite(spriteMuro)) {
                this.spriteManager.dibujarSprite(this.ctx, spriteMuro, x, y, TAMANO_CELDA, 4);
            } else if (this.spriteManager.obtenerSprite('wall_top')) {
                this.spriteManager.dibujarSprite(this.ctx, 'wall_top', x, y, TAMANO_CELDA, 4);
            } else {
                this.ctx.beginPath();
                this.ctx.moveTo(x, y);
                this.ctx.lineTo(x + TAMANO_CELDA, y);
                this.ctx.stroke();
            }
          }
          if (fila === NUMERO_FILAS - 1 || !mapaLaberinto[fila + 1][columna].esTransitable || celda.muros.inferior) {
            if (this.spriteManager.obtenerSprite('wall_bottom')) {
                this.spriteManager.dibujarSprite(this.ctx, 'wall_bottom', x, y + TAMANO_CELDA - 4, TAMANO_CELDA, 4);
            } else {
                this.ctx.beginPath();
                this.ctx.moveTo(x, y + TAMANO_CELDA);
                this.ctx.lineTo(x + TAMANO_CELDA, y + TAMANO_CELDA);
                this.ctx.stroke();
            }
          }
          if (columna === 0 || !mapaLaberinto[fila][columna - 1].esTransitable || celda.muros.izquierdo) {
            if (this.spriteManager.obtenerSprite('wall_left')) {
                this.spriteManager.dibujarSprite(this.ctx, 'wall_left', x, y, 4, TAMANO_CELDA);
            } else {
                this.ctx.beginPath();
                this.ctx.moveTo(x, y);
                this.ctx.lineTo(x, y + TAMANO_CELDA);
                this.ctx.stroke();
            }
          }
          if (columna === NUMERO_COLUMNAS - 1 || !mapaLaberinto[fila][columna + 1].esTransitable || celda.muros.derecho) {
            if (this.spriteManager.obtenerSprite('wall_right')) {
                this.spriteManager.dibujarSprite(this.ctx, 'wall_right', x + TAMANO_CELDA - 4, y, 4, TAMANO_CELDA);
            } else {
                this.ctx.beginPath();
                this.ctx.moveTo(x + TAMANO_CELDA, y);
                this.ctx.lineTo(x + TAMANO_CELDA, y + TAMANO_CELDA);
                this.ctx.stroke();
            }
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
            const spriteName = `food_${celda.alimento.tipo.toLowerCase().replace(/ /g, '_')}`;
            if (this.spriteManager.obtenerSprite(spriteName)) {
                this.spriteManager.dibujarSprite(this.ctx, spriteName, x + 4, y + 4, TAMANO_CELDA - 8, TAMANO_CELDA - 8);
            } else {
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
          }

          // Dibujar Pico
          if (celda.tienePico) {
            if (this.spriteManager.obtenerSprite('pickaxe')) {
                this.spriteManager.dibujarSprite(this.ctx, 'pickaxe', x + 4, y + 4, TAMANO_CELDA - 8, TAMANO_CELDA - 8);
            } else {
                this.ctx.font = '16px serif';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('⛏️', (columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2, (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2 + 6);
            }
          }

          // Dibujar Escenario Dinámico (Puertas, Trampas)
          if (celda.tipoEscenario !== 'ninguno') {
              const spriteDyn = `dynamic_${celda.tipoEscenario}_${celda.estadoEscenario}_0`;
              if (this.spriteManager.obtenerSprite(spriteDyn)) {
                  this.spriteManager.dibujarSprite(this.ctx, spriteDyn, x, y, TAMANO_CELDA, TAMANO_CELDA);
              }
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

  /**
   * Dibuja la capa de niebla de guerra basada en el tiempo transcurrido desde el último avistamiento.
   */
  dibujarNiebla(mapaLaberinto: Celda[][], offset: CameraOffset, config: GameConfig, persistenceOverride?: number) {
    if (config.vistaDebugActivada) return;
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP, CELDAS_VISIBLES_X, CELDAS_VISIBLES_Y, NUMERO_FILAS, NUMERO_COLUMNAS, TIEMPO_DESVANECIMIENTO_NIEBLA } = config;
    const fadeTime = persistenceOverride || TIEMPO_DESVANECIMIENTO_NIEBLA;

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
            opacidad = Math.min(1, tiempoDesdeVisto / fadeTime);
          }
        }

        if (opacidad > 0) {
          this.ctx.fillStyle = `rgba(0, 0, 0, ${opacidad})`;
          this.ctx.fillRect((columna - colOffset) * TAMANO_CELDA, (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP, TAMANO_CELDA, TAMANO_CELDA);
        }
      }
    }
  }

  /**
   * Dibuja una entidad RPG (jugador, NPC, etc.) en el canvas.
   * @param entidad La entidad a dibujar.
   * @param offset El desplazamiento de la cámara.
   * @param config Configuración general del juego.
   * @param mapaLaberinto Referencia al mapa para cálculos de visibilidad.
   */
  dibujarEntidad(entidad: IEntidadRPG, offset: CameraOffset, config: GameConfig, mapaLaberinto?: Celda[][]) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP, CELDAS_VISIBLES_X, CELDAS_VISIBLES_Y, TIEMPO_DESVANECIMIENTO_NIEBLA, vistaDebugActivada } = config;

    // Culling: No dibujar si está fuera de la vista
    if (entidad.fila < filaOffset - 1 || entidad.fila >= filaOffset + CELDAS_VISIBLES_Y + 1 ||
        entidad.columna < colOffset - 1 || entidad.columna >= colOffset + CELDAS_VISIBLES_X + 1) return;

    // Niebla de guerra: Verificar si la casilla es visible
    if (!vistaDebugActivada && mapaLaberinto) {
        const celdaActual = mapaLaberinto[entidad.fila]?.[entidad.columna];
        if (celdaActual) {
            const tiempoDesdeVisto = Date.now() - celdaActual.ultimoAvistamiento;
            if (celdaActual.ultimoAvistamiento === 0 || tiempoDesdeVisto > TIEMPO_DESVANECIMIENTO_NIEBLA) {
                return;
            }
        }
    }

    const x = (entidad.columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const y = (entidad.fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;

    this.ctx.save();

    const esNPC = entidad.tipo !== undefined;
    const prefix = esNPC ? 'npc' : 'player';
    const clase = entidad.clase || entidad.tipo?.toLowerCase() || 'guerrero';
    const keyBase = `${prefix}_${clase}_${entidad.estadoActual}`;
    const spriteKey = `${keyBase}_${entidad.frameActual}`;

    // 1. Intentar dibujar Sprite
    if (entidad.estaVivo && (this.spriteManager.obtenerSprite(spriteKey) || this.spriteManager.obtenerSprite(keyBase))) {
        this.spriteManager.dibujarSprite(this.ctx, spriteKey, x - TAMANO_CELDA / 2, y - TAMANO_CELDA / 2, TAMANO_CELDA, TAMANO_CELDA);
    }
    // 2. Si ha caído, dibujar tumba o estado fallen
    else if (!entidad.estaVivo) {
        this.dibujarTumba(x, y, TAMANO_CELDA);
    }
    // 3. Fallback a figuras geométricas (Stick figures / Bloques)
    else {
        if (esNPC) {
            this.dibujarNPCFallback(entidad, x, y, TAMANO_CELDA);
        } else {
            this.dibujarJugadorFallback(entidad, x, y, TAMANO_CELDA);
        }
    }

    this.ctx.restore();

    // Dibujar elementos adicionales
    this.dibujarBarraVida(entidad, offset, config, mapaLaberinto);
    this.dibujarBubbleChat(entidad, offset, config);

    // Dibujar etiqueta de nombre para otros jugadores
    if (!esNPC && prefix === 'player') {
        this.dibujarEtiquetaNombre(entidad, x, y, TAMANO_CELDA);
    }
  }

  /**
   * Dibuja una etiqueta con el nombre de la entidad (principalmente para jugadores remotos).
   */
  private dibujarEtiquetaNombre(entidad: IEntidadRPG, x: number, y: number, tamanoCelda: number) {
      const escala = tamanoCelda * 0.6;
      this.ctx.save();
      this.ctx.fillStyle = entidad.estaVivo ? (entidad.color || '#fff') : '#555';
      this.ctx.font = 'bold 10px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(entidad.nombre, x, y - escala);
      this.ctx.restore();
  }

  /**
   * Dibuja una lápida en la posición indicada.
   */
  private dibujarTumba(x: number, y: number, tamanoCelda: number) {
    this.ctx.fillStyle = '#888';
    this.ctx.strokeStyle = '#444';
    this.ctx.lineWidth = 2;

    const w = tamanoCelda * 0.7;
    const h = tamanoCelda * 0.8;
    this.ctx.beginPath();
    this.ctx.moveTo(x - w/2, y + h/2);
    this.ctx.lineTo(x - w/2, y - h/4);
    this.ctx.arc(x, y - h/4, w/2, Math.PI, 0);
    this.ctx.lineTo(x + w/2, y + h/2);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = '#444';
    this.ctx.font = 'bold 8px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('RIP', x, y + 2);
  }

  /**
   * Dibuja un monigote representativo del jugador cuando no hay sprites disponibles.
   */
  private dibujarJugadorFallback(entidad: IEntidadRPG, x: number, y: number, tamanoCelda: number) {
    const escala = tamanoCelda * 0.6;
    const color = entidad.color || '#007bff';

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';

    // Cabeza
    this.ctx.beginPath();
    this.ctx.arc(x, y - escala / 3, escala / 6, 0, Math.PI * 2);
    this.ctx.stroke();

    // Cuerpo
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - escala / 6);
    this.ctx.lineTo(x, y + escala / 6);
    this.ctx.stroke();

    // Animación de piernas
    let desfasePierna = entidad.estaCaminando ? Math.sin(Date.now() / 100) * (escala / 4) : 0;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y + escala / 6);
    this.ctx.lineTo(x - escala / 6 + desfasePierna, y + escala / 2);
    this.ctx.moveTo(x, y + escala / 6);
    this.ctx.lineTo(x + escala / 6 - desfasePierna, y + escala / 2);
    this.ctx.stroke();

    // Brazos
    this.ctx.beginPath();
    this.ctx.moveTo(x - escala / 4, y);
    this.ctx.lineTo(x + escala / 4, y);
    this.ctx.stroke();

    // Glow de inmunidad
    if (Date.now() < entidad.inmunidadHasta) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, tamanoCelda / 2, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }
  }

  /**
   * Dibuja una figura geométrica representativa del NPC.
   */
  private dibujarNPCFallback(entidad: IEntidadRPG, x: number, y: number, tamanoCelda: number) {
    const escala = tamanoCelda * 0.4;
    const tipo = entidad.tipo;

    this.ctx.strokeStyle = '#000';
    this.ctx.lineWidth = 1;

    if (tipo === "Esqueleto") {
      this.ctx.fillStyle = '#EEE';
      this.ctx.beginPath();
      this.ctx.arc(x, y - escala/2, escala, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    } else if (tipo === "Orco") {
      this.ctx.fillStyle = '#2F4F4F';
      this.ctx.fillRect(x - escala, y - escala, escala * 2, escala * 2);
      this.ctx.strokeRect(x - escala, y - escala, escala * 2, escala * 2);
    } else if (tipo === "Goblin") {
      this.ctx.fillStyle = '#32CD32';
      this.ctx.beginPath();
      this.ctx.ellipse(x, y + 2, escala, escala * 1.2, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    } else {
      this.ctx.fillStyle = '#5C4033';
      this.ctx.fillRect(x - escala, y - escala/2, escala * 2, escala * 1.5);
      this.ctx.strokeRect(x - escala, y - escala/2, escala * 2, escala * 1.5);
    }
  }

  /**
   * Dibuja la barra de vida sobre una entidad.
   */
  dibujarBarraVida(entidad: IEntidadRPG, offset: CameraOffset, config: GameConfig, mapaLaberinto?: Celda[][]) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP, vistaDebugActivada, TIEMPO_DESVANECIMIENTO_NIEBLA } = config;

    // Niebla de guerra para barra de vida
    if (!vistaDebugActivada && mapaLaberinto) {
        const celdaActual = mapaLaberinto[entidad.fila]?.[entidad.columna];
        if (celdaActual) {
            const tiempoDesdeVisto = Date.now() - celdaActual.ultimoAvistamiento;
            if (celdaActual.ultimoAvistamiento === 0 || tiempoDesdeVisto > TIEMPO_DESVANECIMIENTO_NIEBLA) {
                return;
            }
        }
    }

    const x = (entidad.columna - colOffset) * TAMANO_CELDA + 2;
    const y = (entidad.fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + 2;
    const anchoBarra = TAMANO_CELDA - 4;
    const altoBarra = 4;

    const pct = entidad.vidaActual / entidad.vidaMaxima;
    const hue = pct * 120;

    this.ctx.fillStyle = "#333";
    this.ctx.fillRect(x, y, anchoBarra, altoBarra);
    this.ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    this.ctx.fillRect(x, y, anchoBarra * pct, altoBarra);
  }

  /**
   * Dibuja el globo de chat de una entidad si tiene uno activo.
   */
  dibujarBubbleChat(entidad: IEntidadRPG, offset: CameraOffset, config: GameConfig) {
    if (!entidad.bubbleChat || Date.now() > entidad.bubbleChat.expira) {
        return;
    }

    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP } = config;
    const x = (entidad.columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const y = (entidad.fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP - 10;

    this.ctx.save();
    this.ctx.font = '14px Arial';
    const metrics = this.ctx.measureText(entidad.bubbleChat.texto);
    const padding = 6;
    const w = metrics.width + padding * 2;
    const h = 20;

    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    this.ctx.strokeStyle = '#000';
    this.ctx.beginPath();
    // polyfill roundRect if needed or use simple rect
    this.ctx.rect(x - w / 2, y - h, w, h);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = '#000';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(entidad.bubbleChat.texto, x, y - 3);
    this.ctx.restore();
  }

  /**
   * Dibuja la interfaz de usuario superpuesta (HUD).
   */
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

  /**
   * Dibuja un proyectil (flecha o bola de fuego) en tránsito.
   */
  dibujarProyectil(p: any, offset: CameraOffset, config: GameConfig) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP } = config;

    const curX = p.x + (p.targetX - p.x) * p.pct;
    const curY = p.y + (p.targetY - p.y) * p.pct;

    const screenX = (curX - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const screenY = (curY - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;

    this.ctx.save();
    if (p.esFlecha) {
        // Dibujar Flecha
        const angle = Math.atan2(p.targetY - p.y, p.targetX - p.x);
        this.ctx.translate(screenX, screenY);
        this.ctx.rotate(angle);
        this.ctx.strokeStyle = '#555';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(-10, 0);
        this.ctx.lineTo(10, 0);
        this.ctx.stroke();
        this.ctx.fillStyle = '#aaa';
        this.ctx.beginPath();
        this.ctx.moveTo(10, 0);
        this.ctx.lineTo(5, -3);
        this.ctx.lineTo(5, 3);
        this.ctx.fill();
    } else {
        // Dibujar Bola de Fuego
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, 5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = p.color;
        this.ctx.fill();
    }
    this.ctx.restore();
  }

  /**
   * Dibuja el efecto visual de congelación en un área.
   */
  dibujarFreeze(f: any, offset: CameraOffset, config: GameConfig) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP, NUMERO_FILAS, NUMERO_COLUMNAS } = config;

    const ahora = Date.now();
    const transcurrido = ahora - f.inicio;
    const alfa = Math.min(0.3, 1 - (transcurrido / f.duracion));

    if (alfa <= 0) return;

    this.ctx.save();
    this.ctx.fillStyle = `rgba(135, 206, 250, ${alfa})`; // LightSkyBlue

    const r = f.radio;
    for (let fila = Math.max(0, Math.floor(f.y - r)); fila <= Math.min(NUMERO_FILAS - 1, Math.ceil(f.y + r)); fila++) {
        for (let col = Math.max(0, Math.floor(f.x - r)); col <= Math.min(NUMERO_COLUMNAS - 1, Math.ceil(f.x + r)); col++) {
            const dist = Math.sqrt(Math.pow(fila - f.y, 2) + Math.pow(col - f.x, 2));
            if (dist <= r) {
                const sx = (col - colOffset) * TAMANO_CELDA;
                const sy = (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP;
                this.ctx.fillRect(sx, sy, TAMANO_CELDA, TAMANO_CELDA);
            }
        }
    }
    this.ctx.restore();
  }

  /**
   * Dibuja el efecto visual de torbellino (remolino).
   */
  dibujarWhirlwind(w: any, offset: CameraOffset, config: GameConfig) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP } = config;

    const screenX = (w.x - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const screenY = (w.y - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;

    const ahora = Date.now();
    const transcurrido = ahora - w.inicio;
    const progreso = transcurrido / w.duracion;
    const alfa = 1 - progreso;

    if (alfa <= 0) return;

    this.ctx.save();
    this.ctx.strokeStyle = `rgba(255, 255, 255, ${alfa})`;
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    // Dibujamos un arco que progresa
    const startAngle = 0;
    const endAngle = progreso * Math.PI * 4; // Dos vueltas rápidas
    this.ctx.arc(screenX, screenY, TAMANO_CELDA * 0.8, startAngle, endAngle);
    this.ctx.stroke();

    // Añadir rastro de partículas o destello
    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = '#fff';
    this.ctx.stroke();

    this.ctx.restore();
  }

  /**
   * Dibuja el efecto visual del radar y los ecos detectados.
   */
  dibujarRadar(r: any, offset: CameraOffset, config: GameConfig, localId?: string) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP } = config;

    const screenX = (r.x - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const screenY = (r.y - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;

    const ahora = Date.now();
    const transcurrido = ahora - r.inicio;
    const progreso = transcurrido / r.duracion;
    const alfa = 1 - progreso;

    if (alfa <= 0) return;

    this.ctx.save();
    // Dibujamos sobre todo, así que no aplicamos el recorte del zoom si queremos que se vea expandido?
    // No, mejor que siga la cámara pero que no se corte por el viewport si es posible.
    // Pero como estamos dentro del context de zoom (si se llama antes de finalizarZoom), se verá bien.

    this.ctx.strokeStyle = `rgba(0, 255, 255, ${alfa * 0.4})`;
    this.ctx.lineWidth = 1.5;

    // Círculos concéntricos con distancia progresiva
    // r_i = expansion * (i^1.8)
    const expansion = 5 + progreso * 100;
    for (let i = 1; i <= 6; i++) {
        const radio = expansion * Math.pow(i, 1.6);
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, radio, 0, Math.PI * 2);
        this.ctx.stroke();
    }

    // Dibujar respuestas (solo si es el radar del protagonista)
    if (r.respuestas && r.idEmisor === localId) {
        r.respuestas.forEach((resp: any) => {
            const rx = (resp.c - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
            const ry = (resp.f - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;

            this.ctx.fillStyle = resp.npc ? `rgba(255, 0, 0, ${alfa})` : `rgba(0, 255, 0, ${alfa})`;
            this.ctx.beginPath();
            this.ctx.arc(rx, ry, 5 + progreso * 10, 0, Math.PI * 2);
            this.ctx.fill();

            // Círculo de señal
            this.ctx.strokeStyle = resp.npc ? `rgba(255, 0, 0, ${alfa})` : `rgba(0, 255, 0, ${alfa})`;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(rx, ry, 10 + progreso * 20, 0, Math.PI * 2);
            this.ctx.stroke();
        });
    }

    this.ctx.restore();
  }

  /**
   * Dibuja indicadores visuales en los bordes para facilitar el movimiento táctil.
   */
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
