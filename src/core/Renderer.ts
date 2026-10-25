import { Celda } from '../world/Celda';
import { CameraOffset, GameConfig, IEntidadRPG } from '../types';
import { SpriteManager } from './SpriteManager';
import { AvatarCompositor } from './AvatarCompositor';
import { aparienciaEfectiva } from './avatarTintes';
import { carasHaciaSuelo, hashCelda, varianteSuelo } from '../world/autotile';
import type { NivelNodo } from '../world/streaming';

const LOD_TAMANO_CELDA = 8;

interface CacheNodo {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  valido: boolean;
  ambiente: 'dungeon' | 'casa';
  nivel: 'hot' | 'lod';
  tamanoCelda: number;
}

interface NodoRender {
  id: string;
  celdas: Celda[][];
  filas: number;
  columnas: number;
  tipo: string;
}

interface NodoRenderEntry {
  nodo: NodoRender;
  transform: { df: number; dc: number };
  nivel?: NivelNodo;
}

/**
 * Clase responsable de toda la lógica de renderizado del juego.
 * Centraliza el dibujo del laberinto, entidades, efectos y UI.
 */
export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public spriteManager: SpriteManager;
  public avatarCompositor: AvatarCompositor;
  private cacheNodos: Map<string, CacheNodo> = new Map();
  private portalesHousingInactivos: Set<string> = new Set();
  /** Portales de housing (todos: ida y vuelta) para dibujarlos como casita con pulso. */
  private portalesHousing: Set<string> = new Set();
  /** Ambiente del nodo activo: 'casa' cambia el tema de suelos/muros. */
  private ambiente: 'dungeon' | 'casa' = 'dungeon';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.spriteManager = new SpriteManager();
    this.avatarCompositor = new AvatarCompositor(this.spriteManager);
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
    // Usamos las coordenadas visuales para un seguimiento suave
    const colOffset = protagonista.visualColumna - (mazeWidth / TAMANO_CELDA / 2) + 0.5;
    const filaOffset = protagonista.visualFila - (mazeHeight / TAMANO_CELDA / 2) + 0.5;

    return { colOffset, filaOffset };
  }

  /**
   * Offset de cámara en coordenadas de **mundo**: centra la posición visual de
   * mundo del protagonista en el viewport.
   */
  obtenerOffsetCamaraMundo(
    worldVisual: { fila: number; columna: number },
    config: GameConfig,
  ): CameraOffset {
    const { TAMANO_CELDA, ALTO_UI_TOP, ALTO_UI_BOTTOM } = config;
    const mazeWidth = this.canvas.width;
    const mazeHeight = this.canvas.height - ALTO_UI_TOP - ALTO_UI_BOTTOM;
    const colOffset = worldVisual.columna - (mazeWidth / TAMANO_CELDA / 2) + 0.5;
    const filaOffset = worldVisual.fila - (mazeHeight / TAMANO_CELDA / 2) + 0.5;
    return { colOffset, filaOffset };
  }

  /**
   * Dibuja todos los nodos visibles con cámara de mundo. El nodo activo aporta
   * además drops y capas dinámicas; los vecinos se dibujan congelados.
   */
  dibujarMundo(
    nodos: ReadonlyArray<NodoRenderEntry>,
    offsetMundo: CameraOffset,
    config: GameConfig,
    drops?: { f: number; c: number; id: string }[],
    nodoActivoId?: string,
    persistenceOverride?: number,
  ): void {
    const orden: Record<NivelNodo, number> = { cold: 0, lod: 1, hot: 2, activo: 3 };
    const ordenados = [...nodos].sort(
      (a, b) => (orden[a.nivel ?? 'hot'] ?? 2) - (orden[b.nivel ?? 'hot'] ?? 2),
    );
    let offsetActivo: CameraOffset | null = null;
    for (const entry of ordenados) {
      const offset = {
        colOffset: offsetMundo.colOffset - entry.transform.dc,
        filaOffset: offsetMundo.filaOffset - entry.transform.df,
      };
      const nivel = entry.nivel ?? 'hot';
      if (nivel === 'lod') {
        // LOD: miniatura atenuada, sin capas dinámicas ni niebla por celda.
        this.cacheNodoDibujar(entry.nodo, offset, config, 'lod');
        continue;
      }
      this.cacheNodoDibujar(entry.nodo, offset, config, 'hot');
      this.dibujarPulsoHousing(entry.nodo.celdas, offset, config);
      this.dibujarTesoros(entry.nodo.celdas, offset, config);
      this.dibujarSalida(entry.nodo.celdas, offset, config);
      this.dibujarNiebla(entry.nodo.celdas, offset, config, persistenceOverride);
      if (entry.nodo.id === nodoActivoId) offsetActivo = offset;
    }
    if (offsetActivo) this.dibujarDrops(offsetActivo, config, drops);
  }

  /**
   * Wrapper de compatibilidad para el editor (un solo mapa local).
   */
  dibujarLaberinto(mapaLaberinto: Celda[][], offset: CameraOffset, config: GameConfig, drops?: { f: number; c: number; id: string }[]) {
    const nodo = this.nodoSintetico(mapaLaberinto);
    this.cacheNodoDibujar(nodo, offset, config);
    this.dibujarPulsoHousing(mapaLaberinto, offset, config);
    this.dibujarDrops(offset, config, drops);
    this.dibujarTesoros(mapaLaberinto, offset, config);
    this.dibujarSalida(mapaLaberinto, offset, config);
  }

  private nodoSintetico(mapaLaberinto: Celda[][]): NodoRender {
    return {
      id: '__laberinto__',
      celdas: mapaLaberinto,
      filas: mapaLaberinto.length,
      columnas: mapaLaberinto[0]?.length ?? 0,
      tipo: 'mazmorra',
    };
  }

  /** Portal de salida aleatorio (F4): pulso verde sobre la celda marcada. */
  private dibujarSalida(mapaLaberinto: Celda[][], offset: CameraOffset, config: GameConfig) {
    const { TAMANO_CELDA, ALTO_UI_TOP, CELDAS_VISIBLES_X, CELDAS_VISIBLES_Y } = config;
    const { colOffset, filaOffset } = offset;
    const fInicio = Math.max(0, Math.floor(filaOffset));
    const fFin = Math.min(mapaLaberinto.length - 1, Math.ceil(filaOffset + CELDAS_VISIBLES_Y));
    const cInicio = Math.max(0, Math.floor(colOffset));
    const cFin = Math.min((mapaLaberinto[0]?.length ?? 0) - 1, Math.ceil(colOffset + CELDAS_VISIBLES_X));
    const fase = (performance.now() % 1200) / 1200;
    const alpha = 0.3 + 0.35 * (1 - fase);
    for (let fila = fInicio; fila <= fFin; fila++) {
      for (let columna = cInicio; columna <= cFin; columna++) {
        const celda = mapaLaberinto[fila]?.[columna];
        if (!celda?.esSalida) continue;
        const x = (columna - colOffset) * TAMANO_CELDA;
        const y = (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP;
        this.ctx.fillStyle = `rgba(0, 220, 120, ${alpha})`;
        this.ctx.fillRect(x + 2, y + 2, TAMANO_CELDA - 4, TAMANO_CELDA - 4);
        this.ctx.strokeStyle = '#00ff88';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x + 2, y + 2, TAMANO_CELDA - 4, TAMANO_CELDA - 4);
        this.ctx.fillStyle = '#004d26';
        this.ctx.font = 'bold 9px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('SALIDA', x + TAMANO_CELDA / 2, y + TAMANO_CELDA / 2 + 3);
        this.ctx.textAlign = 'left';
      }
    }
  }

  /** Dibuja cofres y llaves visibles (capa dinámica: el estado cambia al abrir/recoger). */
  private dibujarTesoros(mapaLaberinto: Celda[][], offset: CameraOffset, config: GameConfig) {
    const { TAMANO_CELDA, ALTO_UI_TOP, CELDAS_VISIBLES_X, CELDAS_VISIBLES_Y } = config;
    const { colOffset, filaOffset } = offset;
    const emojiCofre: Record<string, string> = { hierro: '📦', acero: '🗃️', titanio: '💎' };
    const emojiLlave: Record<string, string> = { hierro: '🗝️', acero: '🔑', titanio: '💠' };
    const fInicio = Math.max(0, Math.floor(filaOffset));
    const fFin = Math.min(mapaLaberinto.length - 1, Math.ceil(filaOffset + CELDAS_VISIBLES_Y));
    const cInicio = Math.max(0, Math.floor(colOffset));
    const cFin = Math.min((mapaLaberinto[0]?.length ?? 0) - 1, Math.ceil(colOffset + CELDAS_VISIBLES_X));
    for (let fila = fInicio; fila <= fFin; fila++) {
      for (let columna = cInicio; columna <= cFin; columna++) {
        const celda = mapaLaberinto[fila]?.[columna];
        if (!celda) continue;
        const x = (columna - colOffset) * TAMANO_CELDA;
        const y = (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP;
        if (celda.cofre) {
          this.dibujarItemCache(this.ctx, `cofre_${celda.cofre}`, celda.cofre, x, y, TAMANO_CELDA, celda.cofreAbierto ? '📭' : (emojiCofre[celda.cofre] ?? '📦'));
        } else if (celda.llave) {
          this.dibujarItemCache(this.ctx, `llave_${celda.llave}`, celda.llave, x, y, TAMANO_CELDA, emojiLlave[celda.llave] ?? '🔑');
        }
      }
    }
  }

  /** Dibuja el botín caído en el suelo (capa dinámica, fuera de la caché del laberinto). */
  private dibujarDrops(offset: CameraOffset, config: GameConfig, drops?: { f: number; c: number; id: string }[]) {
    if (!drops || drops.length === 0) return;
    const { TAMANO_CELDA, ALTO_UI_TOP } = config;
    const { colOffset, filaOffset } = offset;
    const emoji: Record<string, string> = { pico: '⛏️', comida: '🍎', pocion_vida: '🧪', flecha: '➶', oro: '🪙' };
    for (const d of drops) {
      const x = (d.c - colOffset) * TAMANO_CELDA;
      const y = (d.f - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP;
      this.dibujarItemCache(this.ctx, d.id, d.id, x, y, TAMANO_CELDA, emoji[d.id] ?? '🎁');
    }
  }

  /** Halo pulsante sobre los portalez de housing visibles, para llamar la atención. */
  private dibujarPulsoHousing(mapaLaberinto: Celda[][], offset: CameraOffset, config: GameConfig) {
    if (this.portalesHousing.size === 0) return;
    const { TAMANO_CELDA, ALTO_UI_TOP, CELDAS_VISIBLES_X, CELDAS_VISIBLES_Y } = config;
    const { colOffset, filaOffset } = offset;
    const fase = (performance.now() % 1400) / 1400;
    const alpha = Math.max(0, 0.75 * (1 - fase));
    if (alpha <= 0) return;
    const fInicio = Math.max(0, Math.floor(filaOffset));
    const fFin = Math.min(mapaLaberinto.length, Math.ceil(filaOffset + CELDAS_VISIBLES_Y));
    for (let fila = fInicio; fila < fFin; fila++) {
      const filaCeldas = mapaLaberinto[fila];
      const cInicio = Math.max(0, Math.floor(colOffset));
      const cFin = Math.min(filaCeldas.length, Math.ceil(colOffset + CELDAS_VISIBLES_X));
      for (let columna = cInicio; columna < cFin; columna++) {
        const celda = filaCeldas[columna];
        if (!celda.esPortal || celda.conectorId === null || !this.portalesHousing.has(celda.conectorId)) continue;
        const cx = (columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
        const cy = (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;
        const radio = TAMANO_CELDA * (0.3 + 0.55 * fase);
        this.ctx.strokeStyle = `rgba(255, 210, 80, ${alpha})`;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radio, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }
  }

  /**
   * Dibuja la capa de niebla de guerra basada en el tiempo transcurrido desde el último avistamiento.
   */
  dibujarNiebla(mapaLaberinto: Celda[][], offset: CameraOffset, config: GameConfig, persistenceOverride?: number) {
    if (config.vistaDebugActivada) return;
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP, CELDAS_VISIBLES_X, CELDAS_VISIBLES_Y, TIEMPO_DESVANECIMIENTO_NIEBLA } = config;
    const fadeTime = persistenceOverride || TIEMPO_DESVANECIMIENTO_NIEBLA;
    // Dimensiones reales del nodo activo (la casa contenida es menor que el mundo).
    const filasNodo = mapaLaberinto.length;
    const columnasNodo = filasNodo > 0 ? mapaLaberinto[0].length : 0;

    const tiempoActual = Date.now();
    const fInicio = Math.floor(filaOffset);
    const fFin = Math.ceil(filaOffset + CELDAS_VISIBLES_Y);
    const cInicio = Math.floor(colOffset);
    const cFin = Math.ceil(colOffset + CELDAS_VISIBLES_X);

    for (let fila = fInicio; fila < fFin; fila++) {
      if (fila < 0 || fila >= filasNodo) continue;
      for (let columna = cInicio; columna < cFin; columna++) {
        if (columna < 0 || columna >= columnasNodo) continue;

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
          this.ctx.fillStyle = `rgba(3, 5, 14, ${opacidad})`;
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
    if (entidad.visualFila < filaOffset - 1 || entidad.visualFila >= filaOffset + CELDAS_VISIBLES_Y + 1 ||
        entidad.visualColumna < colOffset - 1 || entidad.visualColumna >= colOffset + CELDAS_VISIBLES_X + 1) return;

    // Niebla de guerra: Verificar si la casilla es visible
    if (!vistaDebugActivada && mapaLaberinto) {
        const gridF = Math.round(entidad.visualFila);
        const gridC = Math.round(entidad.visualColumna);
        const celdaActual = mapaLaberinto[gridF]?.[gridC];
        if (celdaActual) {
            const tiempoDesdeVisto = Date.now() - celdaActual.ultimoAvistamiento;
            if (celdaActual.ultimoAvistamiento === 0 || tiempoDesdeVisto > TIEMPO_DESVANECIMIENTO_NIEBLA) {
                return;
            }
        }
    }

    const x = (entidad.visualColumna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const y = (entidad.visualFila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;
    const tamEntidad = TAMANO_CELDA * (entidad.escalaVisual ?? 1);

    this.ctx.save();

    const esNPC = entidad.tipo !== undefined;
    const clase = entidad.clase || entidad.tipo?.toLowerCase() || 'guerrero';
    const genero = !esNPC && aparienciaEfectiva(clase, entidad.apariencia).genero === 'f' ? 'player_f' : 'player';
    const prefix = esNPC ? 'npc' : genero;
    const keyBase = `${prefix}_${clase}_${entidad.estadoActual}`;
    const spriteKey = `${keyBase}_${entidad.frameActual}`;

    // Cadena de fallback visual: preferir siempre un sprite real sobre figuras geométricas
    let keyADibujar: string | null = null;

    if (entidad.estaVivo) {
        if (this.spriteManager.obtenerSprite(spriteKey)) {
            keyADibujar = spriteKey;
        } else if (this.spriteManager.obtenerSprite(keyBase)) {
            keyADibujar = keyBase;
        } else {
            // Si el estado actual carece de sprite, caer a idle (o idle_0 o alias simplificado)
            const idleKey = `${prefix}_${clase}_idle`;
            if (this.spriteManager.obtenerSprite(idleKey)) {
                keyADibujar = idleKey;
            } else if (this.spriteManager.obtenerSprite(`${idleKey}_0`)) {
                keyADibujar = `${idleKey}_0`;
            } else if (this.spriteManager.obtenerSprite(`${prefix}_${clase}`)) {
                keyADibujar = `${prefix}_${clase}`;
            }
        }
    } else {
        // Entidad muerta: intentar sprite fallen antes de la tumba geométrica
        const fallenKey = `${prefix}_${clase}_fallen`;
        if (this.spriteManager.obtenerSprite(fallenKey)) {
            keyADibujar = fallenKey;
        } else if (this.spriteManager.obtenerSprite(`${fallenKey}_0`)) {
            keyADibujar = `${fallenKey}_0`;
        }
    }

    let dibujado = false;
    if (keyADibujar) {
        // Avatar personalizado: variante tineada si la apariencia no es el defecto
        // (local y remoto por igual; null = ruta actual).
        if (!esNPC) {
            const variante = this.avatarCompositor.obtenerVariante(
                keyADibujar, clase, entidad.estadoActual, aparienciaEfectiva(clase, entidad.apariencia));
            if (variante) keyADibujar = variante;
        }
        dibujado = this.spriteManager.dibujarSprite(this.ctx, keyADibujar, x - tamEntidad / 2, y - tamEntidad / 2, tamEntidad, tamEntidad);
    }

    if (!dibujado) {
        if (!entidad.estaVivo) {
            this.dibujarTumba(x, y, tamEntidad);
        } else {
            if (esNPC) {
                this.dibujarNPCFallback(entidad, x, y, tamEntidad);
            } else {
                this.dibujarJugadorFallback(entidad, x, y, tamEntidad);
            }
        }
    }

    this.ctx.restore();

    // Dibujar elementos adicionales
    this.dibujarBarraVida(entidad, offset, config, mapaLaberinto, x, y, tamEntidad);
    this.dibujarBubbleChat(entidad, offset, config, x, y);

    // Balrog: etiqueta roja visible a distancia
    if (entidad.tipo === 'Balrog' && entidad.estaVivo) {
        this.ctx.save();
        this.ctx.fillStyle = '#ff3b30';
        this.ctx.font = 'bold 12px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('BALROG', x, y - tamEntidad * 0.65);
        this.ctx.restore();
    }

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
      const nombre = (entidad as any).esHost ? `[HOST] ${entidad.nombre}` : entidad.nombre;
      this.ctx.fillText(nombre, x, y - escala);
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
    } else if (tipo === "Balrog") {
      const pulso = 0.8 + 0.2 * Math.sin(performance.now() / 160);
      this.ctx.save();
      this.ctx.shadowColor = '#ff3300';
      this.ctx.shadowBlur = 18 * pulso;
      // Alas
      this.ctx.fillStyle = '#4a0000';
      this.ctx.beginPath();
      this.ctx.moveTo(x - escala * 0.4, y);
      this.ctx.lineTo(x - escala * 1.8, y - escala * 0.9);
      this.ctx.lineTo(x - escala * 1.2, y + escala * 0.8);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.beginPath();
      this.ctx.moveTo(x + escala * 0.4, y);
      this.ctx.lineTo(x + escala * 1.8, y - escala * 0.9);
      this.ctx.lineTo(x + escala * 1.2, y + escala * 0.8);
      this.ctx.closePath();
      this.ctx.fill();
      // Cuerpo
      this.ctx.fillStyle = '#b30000';
      this.ctx.beginPath();
      this.ctx.ellipse(x, y, escala * 1.1, escala * 1.35, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = '#ffcc00';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
      // Cuernos
      this.ctx.strokeStyle = '#1a0000';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(x - escala * 0.6, y - escala * 0.9);
      this.ctx.lineTo(x - escala * 0.9, y - escala * 1.6);
      this.ctx.moveTo(x + escala * 0.6, y - escala * 0.9);
      this.ctx.lineTo(x + escala * 0.9, y - escala * 1.6);
      this.ctx.stroke();
      // Ojos
      this.ctx.fillStyle = '#ffe600';
      this.ctx.beginPath();
      this.ctx.arc(x - escala * 0.35, y - escala * 0.2, escala * 0.14, 0, Math.PI * 2);
      this.ctx.arc(x + escala * 0.35, y - escala * 0.2, escala * 0.14, 0, Math.PI * 2);
      this.ctx.fill();
      // Boca
      this.ctx.strokeStyle = '#1a0000';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(x - escala * 0.3, y + escala * 0.45);
      this.ctx.quadraticCurveTo(x, y + escala * 0.7, x + escala * 0.3, y + escala * 0.45);
      this.ctx.stroke();
      this.ctx.restore();
    } else {
      this.ctx.fillStyle = '#5C4033';
      this.ctx.fillRect(x - escala, y - escala/2, escala * 2, escala * 1.5);
      this.ctx.strokeRect(x - escala, y - escala/2, escala * 2, escala * 1.5);
    }
  }

  /**
   * Dibuja la barra de vida sobre una entidad.
   */
  dibujarBarraVida(entidad: IEntidadRPG, offset: CameraOffset, config: GameConfig, mapaLaberinto?: Celda[][], preCalcX?: number, preCalcY?: number, tamanoEntidad: number = config.TAMANO_CELDA) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP, vistaDebugActivada, TIEMPO_DESVANECIMIENTO_NIEBLA } = config;

    // Niebla de guerra para barra de vida
    if (!vistaDebugActivada && mapaLaberinto) {
        const gridF = Math.round(entidad.visualFila);
        const gridC = Math.round(entidad.visualColumna);
        const celdaActual = mapaLaberinto[gridF]?.[gridC];
        if (celdaActual) {
            const tiempoDesdeVisto = Date.now() - celdaActual.ultimoAvistamiento;
            if (celdaActual.ultimoAvistamiento === 0 || tiempoDesdeVisto > TIEMPO_DESVANECIMIENTO_NIEBLA) {
                return;
            }
        }
    }

    const x = preCalcX ? preCalcX - tamanoEntidad / 2 + 2 : (entidad.visualColumna - colOffset) * TAMANO_CELDA + 2;
    const y = preCalcY ? preCalcY - tamanoEntidad / 2 + 2 : (entidad.visualFila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + 2;
    const anchoBarra = tamanoEntidad - 4;
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
  dibujarBubbleChat(entidad: IEntidadRPG, offset: CameraOffset, config: GameConfig, preCalcX?: number, preCalcY?: number) {
    if (!entidad.bubbleChat || Date.now() > entidad.bubbleChat.expira) {
        return;
    }

    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP } = config;
    const x = preCalcX || (entidad.visualColumna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const y = preCalcY ? preCalcY - TAMANO_CELDA / 2 - 10 : (entidad.visualFila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP - 10;

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
    const stHeroe = game.protagonista.statsEfectivos();
    this.ctx.fillText(`FUE:${stHeroe.fuerza} AGI:${stHeroe.agilidad}`, 20, 44);
    this.ctx.fillText(`INT:${stHeroe.inteligencia} XP:${game.protagonista.puntosExperiencia} ORO:${game.protagonista.inventario.oro ?? 0}`, 20, 56);
    this.ctx.textAlign = 'right';
    this.ctx.fillText(
      `LLAVES:H${game.protagonista.inventario.llave_hierro ?? 0} A${game.protagonista.inventario.llave_acero ?? 0} T${game.protagonista.inventario.llave_titanio ?? 0}`,
      this.canvas.width - 10,
      56,
    );
    this.ctx.textAlign = 'left';

    if (game.mpActivo && game.hostNick) {
      this.ctx.save();
      this.ctx.fillStyle = '#ffd700';
      this.ctx.font = 'bold 11px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`HOST: ${game.esHost ? 'tú' : game.hostNick}`, this.canvas.width / 2, 20);
      this.ctx.restore();
    }

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

    if (!game.juegoTerminado) {
      const celdaActual = game.mapaLaberinto?.[game.protagonista.fila]?.[game.protagonista.columna];
      if (celdaActual?.esSalida) {
        const info = game.esperaInfo;
        const texto = info
          ? `EN LA SALIDA — esperando a ${info.esperando} jugador(es)`
          : 'EN LA SALIDA';
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0, 80, 40, 0.85)';
        this.ctx.fillRect(this.canvas.width / 2 - 170, ALTO_UI_TOP + 10, 340, 24);
        this.ctx.fillStyle = '#7dffb0';
        this.ctx.font = 'bold 12px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(texto, this.canvas.width / 2, ALTO_UI_TOP + 26);
        this.ctx.textAlign = 'left';
        this.ctx.restore();
      } else if (!game.protagonista.estaVivo) {
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0,0,0,0.55)';
        this.ctx.fillRect(this.canvas.width / 2 - 150, ALTO_UI_TOP + 10, 300, 24);
        this.ctx.fillStyle = '#ff6666';
        this.ctx.font = 'bold 12px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('HAS CAÍDO — esperando el final', this.canvas.width / 2, ALTO_UI_TOP + 26);
        this.ctx.textAlign = 'left';
        this.ctx.restore();
      }
    }

    if (game.juegoTerminado) {
      this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
      this.ctx.fillRect(0, ALTO_UI_TOP, this.canvas.width, this.canvas.height - ALTO_UI_TOP - ALTO_UI_BOTTOM);
      this.ctx.fillStyle = '#fff';
      this.ctx.textAlign = 'center';
      const resultados = [...(game.resultados ?? [])].sort((a: any, b: any) => b.puntuacion - a.puntuacion);
      if (resultados.length > 0) {
        this.ctx.font = 'bold 18px monospace';
        this.ctx.fillText('RESULTADOS', this.canvas.width / 2, ALTO_UI_TOP + 60);
        const columnas = [0.15, 0.4, 0.52, 0.62, 0.72, 0.85];
        const cabeceras = ['JUGADOR', 'ORO', 'XP', 'BAJAS', 'TIEMPO', 'PUNTOS'];
        this.ctx.font = 'bold 11px monospace';
        cabeceras.forEach((h, i) => this.ctx.fillText(h, this.canvas.width * columnas[i], ALTO_UI_TOP + 90));
        this.ctx.font = '12px monospace';
        resultados.forEach((r: any, idx: number) => {
          const y = ALTO_UI_TOP + 115 + idx * 20;
          const nombre = r.nombre === game.hostNick ? `[HOST] ${r.nombre}` : r.nombre;
          const valores = [nombre, String(r.oro), String(r.xp), String(r.bajas), `${r.segundos}s`, String(r.puntuacion)];
          valores.forEach((v, i) => this.ctx.fillText(v, this.canvas.width * columnas[i], y));
        });
      } else {
        this.ctx.font = 'bold 16px monospace';
        const msjFin = game.protagonista.vidaActual > 0 ? "¡VICTORIA!" : "HAS CAÍDO";
        this.ctx.fillText(msjFin, this.canvas.width / 2, ALTO_UI_TOP + 100);
      }
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
        if (this.spriteManager.obtenerSprite('vfx_flecha_play')) {
            const angle = Math.atan2(p.targetY - p.y, p.targetX - p.x);
            this.ctx.translate(screenX, screenY);
            this.ctx.rotate(angle);
            this.spriteManager.dibujarSprite(this.ctx, 'vfx_flecha_play', -TAMANO_CELDA/2, -TAMANO_CELDA/2, TAMANO_CELDA, TAMANO_CELDA);
        } else {
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
        }
    } else {
        // Dibujar Bola de Fuego
        if (this.spriteManager.obtenerSprite('vfx_bola_fuego_play')) {
            this.spriteManager.dibujarSprite(this.ctx, 'vfx_bola_fuego_play', screenX - 10, screenY - 10, 20, 20);
        } else {
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(screenX, screenY, 5, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = p.color;
            this.ctx.fill();
        }
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
    const r = f.radio;
    const hasSprite = this.spriteManager.obtenerSprite('vfx_hielo_play');

    if (hasSprite) {
        this.ctx.globalAlpha = alfa;
    } else {
        this.ctx.fillStyle = `rgba(135, 206, 250, ${alfa})`; // LightSkyBlue
    }

    for (let fila = Math.max(0, Math.floor(f.y - r)); fila <= Math.min(NUMERO_FILAS - 1, Math.ceil(f.y + r)); fila++) {
        for (let col = Math.max(0, Math.floor(f.x - r)); col <= Math.min(NUMERO_COLUMNAS - 1, Math.ceil(f.x + r)); col++) {
            const dist = Math.sqrt(Math.pow(fila - f.y, 2) + Math.pow(col - f.x, 2));
            if (dist <= r) {
                const sx = (col - colOffset) * TAMANO_CELDA;
                const sy = (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP;
                if (hasSprite) {
                    this.spriteManager.dibujarSprite(this.ctx, 'vfx_hielo_play', sx, sy, TAMANO_CELDA, TAMANO_CELDA);
                } else {
                    this.ctx.fillRect(sx, sy, TAMANO_CELDA, TAMANO_CELDA);
                }
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
    if (this.spriteManager.obtenerSprite('vfx_remolino_play')) {
        this.ctx.globalAlpha = alfa;
        // Rotación animada
        this.ctx.translate(screenX, screenY);
        this.ctx.rotate(progreso * Math.PI * 8);
        this.spriteManager.dibujarSprite(this.ctx, 'vfx_remolino_play', -TAMANO_CELDA, -TAMANO_CELDA, TAMANO_CELDA * 2, TAMANO_CELDA * 2);
    } else {
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
    }
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

  private inicializarCacheNodo(
    nodo: NodoRender,
    config: GameConfig,
    nivel: 'hot' | 'lod' = 'hot',
  ): CacheNodo {
    const tam = nivel === 'lod' ? LOD_TAMANO_CELDA : config.TAMANO_CELDA;
    const clave = nivel === 'lod' ? `${nodo.id}:lod` : nodo.id;
    const w = Math.max(1, nodo.columnas) * tam;
    const h = Math.max(1, nodo.filas) * tam;
    const ambiente: 'dungeon' | 'casa' =
      nodo.id === '__laberinto__' ? this.ambiente : nodo.tipo === 'personal' ? 'casa' : 'dungeon';

    let entry = this.cacheNodos.get(clave);
    if (!entry || entry.canvas.width !== w || entry.canvas.height !== h || entry.ambiente !== ambiente || entry.nivel !== nivel) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      entry = { canvas, ctx: canvas.getContext('2d')!, valido: false, ambiente, nivel, tamanoCelda: tam };
      this.cacheNodos.set(clave, entry);
    }
    if (entry.valido) return entry;

    const anterior = this.ambiente;
    this.ambiente = ambiente;
    const ctx = entry.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    const mapaLaberinto = nodo.celdas;
    const filasNodo = nodo.filas;
    const columnasNodo = nodo.columnas;

    for (let fila = 0; fila < filasNodo; fila++) {
      const filaCeldas = mapaLaberinto[fila];
      if (!filaCeldas) continue;
      for (let columna = 0; columna < columnasNodo; columna++) {
        const celda = filaCeldas[columna];
        if (!celda) continue;
        const x = columna * tam;
        const y = fila * tam;

        if (!celda.esTransitable) {
          this.pintarBloqueMuro(ctx, mapaLaberinto, fila, columna, x, y, tam, filasNodo, columnasNodo);
          continue;
        }

        this.pintarSuelo(ctx, celda, fila, columna, x, y, tam);

        // Sombra interior en los bordes que dan a muro: profundidad barata (en caché).
        // En una costura abierta (muro false) no se pinta, para que el nodo vecino
        // se lea como continuación y no como borde de mapa.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        const banda = Math.max(3, Math.floor(tam * 0.12));
        const sombraSuperior = celda.muros.superior || (fila > 0 && !mapaLaberinto[fila - 1][columna].esTransitable);
        const sombraInferior = celda.muros.inferior || (fila < filasNodo - 1 && !mapaLaberinto[fila + 1][columna].esTransitable);
        const sombraIzquierda = celda.muros.izquierdo || (columna > 0 && !mapaLaberinto[fila][columna - 1].esTransitable);
        const sombraDerecha = celda.muros.derecho || (columna < columnasNodo - 1 && !mapaLaberinto[fila][columna + 1].esTransitable);
        if (sombraSuperior) ctx.fillRect(x, y, tam, banda);
        if (sombraInferior) ctx.fillRect(x, y + tam - banda, tam, banda);
        if (sombraIzquierda) ctx.fillRect(x, y, banda, tam);
        if (sombraDerecha) ctx.fillRect(x + tam - banda, y, banda, tam);

        if (celda.burbuja) {
          ctx.strokeStyle = '#87CEEB';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x + tam / 2, y + tam / 2, tam / 2.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(135, 206, 235, 0.3)';
          ctx.fill();
        }

        if (celda.esPortal) {
          const esHousing =
            celda.conectorId !== null && this.portalesHousing.has(celda.conectorId);
          const atenuado =
            celda.conectorId !== null && this.portalesHousingInactivos.has(celda.conectorId);
          ctx.globalAlpha = atenuado ? 0.25 : 1;
          if (esHousing && this.spriteManager.obtenerSprite('casa_portal_casita')) {
            // El portal de housing se ve como una casita (el pulso se dibuja en la capa viva).
            this.spriteManager.dibujarSprite(ctx, 'casa_portal_casita', x, y, tam, tam);
          } else {
            ctx.fillStyle = 'rgba(0, 0, 255, 0.4)';
            ctx.beginPath();
            ctx.moveTo(x + tam / 2, y + 5);
            ctx.lineTo(x + tam - 5, y + tam / 2);
            ctx.lineTo(x + tam / 2, y + tam - 5);
            ctx.lineTo(x + 5, y + tam / 2);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#0000ff';
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }

        if (celda.alimento) {
          this.dibujarItemCache(ctx, celda.alimento.tipo, 'food', x, y, tam, '🍎');
        }

        if (celda.tienePico) {
          this.dibujarItemCache(ctx, 'pickaxe', 'pickaxe', x, y, tam, '⛏️');
        }

        if (celda.tipoEscenario !== 'ninguno') {
          const spriteDyn = `dynamic_${celda.tipoEscenario}_${celda.estadoEscenario}_0`;
          if (this.spriteManager.obtenerSprite(spriteDyn)) {
            this.spriteManager.dibujarSprite(ctx, spriteDyn, x, y, tam, tam);
          }
        }
      }
    }
    entry.valido = true;
    this.ambiente = anterior;
    return entry;
  }

  inicializarCacheLaberinto(mapaLaberinto: Celda[][], config: GameConfig) {
    this.inicializarCacheNodo(this.nodoSintetico(mapaLaberinto), config);
  }

  private pintarSuelo(ctx: CanvasRenderingContext2D, celda: Celda, fila: number, columna: number, x: number, y: number, tam: number) {
    // Tema casa: suelo según el material de la habitación (madera/baldosa/alfombra).
    if (this.ambiente === 'casa') {
      const material = celda.sueloDecor ?? 'madera';
      const nombreCasa = `casa_suelo_${material}`;
      if (this.spriteManager.obtenerSprite(nombreCasa)) {
        this.spriteManager.dibujarSprite(ctx, nombreCasa, x, y, tam, tam);
        return;
      }
    }
    const sprite = `static_suelo_${varianteSuelo(fila, columna)}`;
    if (this.spriteManager.obtenerSprite(sprite)) {
      this.spriteManager.dibujarSprite(ctx, sprite, x, y, tam, tam);
    } else if (this.spriteManager.obtenerSprite('floor')) {
      this.spriteManager.dibujarSprite(ctx, 'floor', x, y, tam, tam);
    } else {
      ctx.fillStyle = '#FFF';
      ctx.fillRect(x, y, tam, tam);
    }
    // Motas deterministas para romper la repetición del tile
    const h = hashCelda(fila, columna);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    const mx = x + tam * (0.2 + 0.6 * h);
    const my = y + tam * (0.2 + 0.6 * hashCelda(columna, fila));
    ctx.beginPath();
    ctx.arc(mx, my, Math.max(1, tam * 0.03), 0, Math.PI * 2);
    ctx.fill();
  }

  private pintarBloqueMuro(ctx: CanvasRenderingContext2D, mapa: Celda[][], fila: number, columna: number, x: number, y: number, tam: number, numFilas: number, numColumnas: number) {
    if (this.ambiente === 'casa') {
      const celda = mapa[fila][columna];
      if (celda.mueble && this.spriteManager.obtenerSprite(`casa_mueble_${celda.mueble}`)) {
        const mat = celda.sueloDecor;
        if (mat && this.spriteManager.obtenerSprite(`casa_suelo_${mat}`)) {
          this.spriteManager.dibujarSprite(ctx, `casa_suelo_${mat}`, x, y, tam, tam);
        } else {
          ctx.fillStyle = '#7a4a22';
          ctx.fillRect(x, y, tam, tam);
        }
        this.spriteManager.dibujarSprite(ctx, `casa_mueble_${celda.mueble}`, x, y, tam, tam);
        return;
      }
      // Muro de interior: yeso claro con zócalo (nada de piedra de dungeon).
      ctx.fillStyle = '#cbb894';
      ctx.fillRect(x, y, tam, tam);
      const carasCasa = carasHaciaSuelo({
        superior: fila > 0 && mapa[fila - 1][columna].esTransitable,
        inferior: fila < numFilas - 1 && mapa[fila + 1][columna].esTransitable,
        izquierdo: columna > 0 && mapa[fila][columna - 1].esTransitable,
        derecho: columna < numColumnas - 1 && mapa[fila][columna + 1].esTransitable,
      });
      for (const lado of carasCasa) {
        this.dibujarMuroCache(ctx, fila, columna, x, y, tam, lado, numFilas);
      }
      return;
    }
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(x, y, tam, tam);
    // Vetado determinista de la piedra
    const h = hashCelda(fila + 1000, columna + 1000);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(x, y + tam * h * 0.9, tam, Math.max(1, tam * 0.06));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(x, y + tam * (1 - h) * 0.9, tam, Math.max(1, tam * 0.08));
    // Solo las caras que dan a suelo llevan sprite de muro
    const caras = carasHaciaSuelo({
      superior: fila > 0 && mapa[fila - 1][columna].esTransitable,
      inferior: fila < numFilas - 1 && mapa[fila + 1][columna].esTransitable,
      izquierdo: columna > 0 && mapa[fila][columna - 1].esTransitable,
      derecho: columna < numColumnas - 1 && mapa[fila][columna + 1].esTransitable,
    });
    for (const lado of caras) {
      this.dibujarMuroCache(ctx, fila, columna, x, y, tam, lado, numFilas);
    }
  }

  private dibujarMuroCache(ctx: CanvasRenderingContext2D, _fila: number, _columna: number, x: number, y: number, tam: number, lado: string, _numFilas: number) {
    const spriteNames: Record<string, string[]> = this.ambiente === 'casa'
      ? {
          superior: ['casa_muro_superior', 'casa_muro_normal'],
          inferior: ['casa_muro_inferior', 'casa_muro_normal'],
          izquierdo: ['casa_muro_izquierdo', 'casa_muro_normal'],
          derecho: ['casa_muro_derecho', 'casa_muro_normal'],
        }
      : {
          superior: ['static_muro_superior', 'static_muro_normal', 'wall_top'],
          inferior: ['static_muro_inferior', 'wall_bottom'],
          izquierdo: ['static_muro_izquierdo', 'wall_left'],
          derecho: ['static_muro_derecho', 'wall_right'],
        };
    const names = spriteNames[lado] || [];
    const prof = Math.max(4, Math.floor(tam * 0.3));
    for (const name of names) {
      if (this.spriteManager.obtenerSprite(name)) {
        let dx = x, dy = y, dw = tam, dh = prof;
        if (lado === 'inferior') dy = y + tam - prof;
        if (lado === 'izquierdo') { dw = prof; dh = tam; }
        if (lado === 'derecho') { dx = x + tam - prof; dw = prof; dh = tam; }
        this.spriteManager.dibujarSprite(ctx, name, dx, dy, dw, dh);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.lineWidth = Math.max(1, Math.floor(tam * 0.04));
        ctx.beginPath();
        if (lado === 'superior') { ctx.moveTo(x, y + prof); ctx.lineTo(x + tam, y + prof); }
        else if (lado === 'inferior') { ctx.moveTo(x, y + tam - prof); ctx.lineTo(x + tam, y + tam - prof); }
        else if (lado === 'izquierdo') { ctx.moveTo(x + prof, y); ctx.lineTo(x + prof, y + tam); }
        else if (lado === 'derecho') { ctx.moveTo(x + tam - prof, y); ctx.lineTo(x + tam - prof, y + tam); }
        ctx.stroke();
        return;
      }
    }
    // Fallback sin sprite: cara de piedra clara con borde
    ctx.fillStyle = '#4a5058';
    if (lado === 'superior') ctx.fillRect(x, y, tam, prof);
    else if (lado === 'inferior') ctx.fillRect(x, y + tam - prof, tam, prof);
    else if (lado === 'izquierdo') ctx.fillRect(x, y, prof, tam);
    else if (lado === 'derecho') ctx.fillRect(x + tam - prof, y, prof, tam);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = Math.max(1, Math.floor(tam * 0.04));
    ctx.beginPath();
    if (lado === 'superior') { ctx.moveTo(x, y); ctx.lineTo(x + tam, y); }
    else if (lado === 'inferior') { ctx.moveTo(x, y + tam); ctx.lineTo(x + tam, y + tam); }
    else if (lado === 'izquierdo') { ctx.moveTo(x, y); ctx.lineTo(x, y + tam); }
    else if (lado === 'derecho') { ctx.moveTo(x + tam, y); ctx.lineTo(x + tam, y + tam); }
    ctx.stroke();
  }

  /**
   * Viñeta radial centrada en el jugador + parpadeo sutil de antorcha.
   * Un solo fill por frame, en coordenadas de mundo (dentro del zoom).
   */
  dibujarViñeta(colJugador: number, filaJugador: number, offset: CameraOffset, config: GameConfig) {
    const { TAMANO_CELDA, ALTO_UI_TOP, RADIO_VISION } = config;
    const cx = (colJugador - offset.colOffset + 0.5) * TAMANO_CELDA;
    const cy = (filaJugador - offset.filaOffset + 0.5) * TAMANO_CELDA + ALTO_UI_TOP;
    const radio = RADIO_VISION * TAMANO_CELDA * 1.35;
    const flicker = 0.42 + 0.05 * Math.sin(Date.now() / 320);
    const g = this.ctx.createRadialGradient(cx, cy, radio * 0.45, cx, cy, radio);
    g.addColorStop(0, 'rgba(0, 0, 8, 0)');
    g.addColorStop(1, `rgba(0, 0, 8, ${flicker.toFixed(3)})`);
    this.ctx.fillStyle = g;
    this.ctx.fillRect(cx - radio, cy - radio, radio * 2, radio * 2);
  }

  private dibujarItemCache(ctx: CanvasRenderingContext2D, tipo: string, _iconName: string, x: number, y: number, tam: number, emoji: string) {
    const spriteName = tipo === 'pickaxe' ? 'pickaxe' : `food_${tipo.toLowerCase().replace(/ /g, '_')}`;
    if (this.spriteManager.obtenerSprite(spriteName)) {
      this.spriteManager.dibujarSprite(ctx, spriteName, x + 4, y + 4, tam - 8, tam - 8);
    } else {
      ctx.font = '16px serif';
      ctx.textAlign = 'center';
      ctx.fillText(emoji, x + tam / 2, y + tam / 2 + 6);
    }
  }

  invalidarCacheNodo(nodoId: string): void {
    for (const clave of [nodoId, `${nodoId}:lod`]) {
      const entry = this.cacheNodos.get(clave);
      if (entry) entry.valido = false;
    }
  }

  private eliminarCacheNodo(nodoId: string): void {
    this.cacheNodos.delete(nodoId);
    this.cacheNodos.delete(`${nodoId}:lod`);
  }

  private eliminarCacheCompleta(nodoId: string): void {
    this.cacheNodos.delete(nodoId);
  }

  private eliminarCacheLod(nodoId: string): void {
    this.cacheNodos.delete(`${nodoId}:lod`);
  }

  /** F4b: ajusta las cachés al nivel de streaming (cold se elimina). */
  aplicarNiveles(
    niveles: ReadonlyMap<string, NivelNodo>,
    nodos: ReadonlyArray<{ nodo: NodoRender; transform: { df: number; dc: number } }>,
  ): void {
    for (const { nodo } of nodos) {
      const nivel = niveles.get(nodo.id) ?? 'cold';
      if (nivel === 'cold') {
        this.eliminarCacheNodo(nodo.id);
      } else if (nivel === 'lod') {
        this.eliminarCacheCompleta(nodo.id);
      } else {
        this.eliminarCacheLod(nodo.id);
      }
    }
  }

  invalidarCacheLaberinto() {
    for (const entry of this.cacheNodos.values()) entry.valido = false;
  }

  setPortalesHousingInactivos(ids: ReadonlySet<string>): void {
    let cambia = ids.size !== this.portalesHousingInactivos.size;
    if (!cambia) {
      for (const id of ids) {
        if (!this.portalesHousingInactivos.has(id)) {
          cambia = true;
          break;
        }
      }
    }
    this.portalesHousingInactivos = new Set(ids);
    if (cambia) this.invalidarCacheLaberinto();
  }

  /** Portales de housing (ida y vuelta): se dibujan como casita con pulso. */
  setPortalesHousing(ids: ReadonlySet<string>): void {
    let cambia = ids.size !== this.portalesHousing.size;
    if (!cambia) {
      for (const id of ids) {
        if (!this.portalesHousing.has(id)) { cambia = true; break; }
      }
    }
    this.portalesHousing = new Set(ids);
    if (cambia) this.invalidarCacheLaberinto();
  }

  /** Cambia el tema de render (dungeon vs casa). Invalida las cachés al cambiar. */
  setAmbiente(ambiente: 'dungeon' | 'casa'): void {
    if (this.ambiente !== ambiente) {
      this.ambiente = ambiente;
      this.invalidarCacheLaberinto();
    }
  }

  private cacheNodoDibujar(
    nodo: NodoRender,
    offset: CameraOffset,
    config: GameConfig,
    nivel: 'hot' | 'lod' = 'hot',
  ) {
    const { TAMANO_CELDA, ALTO_UI_TOP } = config;
    const entry = this.inicializarCacheNodo(nodo, config, nivel);
    const dx = -offset.colOffset * TAMANO_CELDA;
    const dy = -offset.filaOffset * TAMANO_CELDA + ALTO_UI_TOP;
    this.ctx.imageSmoothingEnabled = false;
    if (nivel === 'lod') {
      const ancho = Math.max(1, nodo.columnas) * TAMANO_CELDA;
      const alto = Math.max(1, nodo.filas) * TAMANO_CELDA;
      this.ctx.globalAlpha = 0.55;
      this.ctx.drawImage(entry.canvas, dx, dy, ancho, alto);
      this.ctx.globalAlpha = 1;
    } else {
      this.ctx.drawImage(entry.canvas, dx, dy);
    }
    this.ctx.imageSmoothingEnabled = true;
  }
}
