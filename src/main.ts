import './style.css';
import { Celda } from './world/Celda';
import { Jugador } from './entities/Jugador';
import { JugadorRemoto } from './entities/JugadorRemoto';
import { EnemigoNPC } from './entities/EnemigoNPC';
import { Renderer } from './core/Renderer';
import { UIManager } from './ui/UIManager';
import { LobbyManager, type LobbyMode } from './ui/LobbyManager';
import { MapamundiUI, type EntradaMapaUI } from './ui/MapamundiUI';
import { FirebaseManager } from './network/FirebaseManager';
import { NetworkManager } from './network/NetworkManager';
import { NetworkManagerHttp } from './network/NetworkManagerHttp';
import { SignalingClient, crearSignalingClient, getSignalingUrl } from './network/SignalingClient';
import { crearIdConexion, obtenerPlayerId } from './network/identidad';
import { CoordinadorFirebase, CoordinadorHttp, type CoordinadorSala, type MetadatosPartida, type ProgresoJugador } from './network/coordinadorSala';
import {
  ESPERA_ELECCION_MS,
  INTERVALO_LATIDO_HOST_MS,
  INTERVALO_PRESENCIA_MS,
  INTERVALO_VIGILANCIA_MS,
  hostVivo,
  resolverHost,
} from './network/migracionHost';
import { eliminarMurosEntre } from './world/generation';
import { elegirCeldaLejos, elegirCeldaParaLlave } from './world/spawn';
import { serializarMapa, deserializarMapa } from './world/serialization';
import { generarNodo } from './world/generadores';
import { generateSessionName } from './utils/session';
import { aparienciaEfectiva, aplicarAparienciaRemota, sanearApariencia, fichaJugador } from './core/avatarTintes';
import { bonosEquipo } from './core/equipo';
import { LLAVE_POR_COFRE, oroDeCofre, puedeAbrirCofre } from './core/tesoros';
import { reensamblarPartes as reensamblarPartesQr } from './core/qrPartes';
import { calcularPuntuacion, type ResultadoPartida } from './core/puntuacion';
import { sanearEquipoGuardado } from './core/inventario';
import { GestorTrueques, clavePar } from './core/gestorTrueques';
import { aplicarIntercambio, sanearCesta, type EstadoParte } from './core/intercambio';
import type { CestaTrade } from './core/intercambio';
import type { InventarioGuardado } from './core/inventario';
import { TruequeUI } from './ui/TruequeUI';
import { anadirLinea } from './ui/truequeModelo';
import { ITEMS } from './config/items';
import { elegirBotin, sortearOro } from './config/botin';
import { inicializarSpritesheets, SpriteConfig } from './core/SpriteConfig';
import { GameConfig, IEntidadRPG, IGame } from './types';
import { cargarKeybinds, guardarKeybinds, asignarTecla, accionParaTecla, KEYBINDS_DEFECTO, ACCIONES_VALIDAS, type IdAccion } from './ui/keybinds';
import { NUMERO_FILAS, NUMERO_COLUMNAS, ENEMIGOS_BASE, TAMANO_CELDA,
    ALTO_UI_TOP, ALTO_UI_BOTTOM, RADIO_VISION,
    TIEMPO_DESVANECIMIENTO_NIEBLA
} from './world/constants';
import { dentroDeBurbuja, radioSimPorDefecto } from './world/burbuja';
import { calcularRadiosInteres, RADIO_SIM_AUTORIDAD, type Dispositivo, type EstadoInteres } from './world/interes';
import { PersistenciaMundo } from './world/PersistenciaMundo';
import { HousingLocal } from './world/housing';
import { EspejoLocal, type DocNodoLocal } from './world/espejoLocal';
import { GestorMundo } from './world/GestorMundo';
import { arrancarMundoGestor, aplicarDeltaConPersistencia, celdasCompatibilidad, rehidratarNodoTrasCruce, sembrarCadenaZonas, sembrarMundoBase, esLadoAutoritativo } from './world/integracion';
import { ArbitroDeltas } from './world/ArbitroDeltas';
import { abrirCeldaCostura, celdaDestinoEnCostura } from './world/costura';
import { consolidarDeltasNodo, costurasDeNodo, type NodoRemoto } from './world/mundoRemoto';
import { calcularStreaming, type NivelNodo, type SeleccionStreaming } from './world/streaming';
import { aplicarDelta, conTickAutor, consolidarCeldasLWW, FMT_DELTA, leerSnapshotNodo, rehidratarHistoria, restaurarEnemigos, type ConectorMundo, type DeltaMundo, type EnemigoFoto, type GenSpec, type NodoMundo, type SnapshotNodo } from './world/mundo';

declare global {
    interface Window {
        SIGNALING_SERVER_URL: string;
    }
}

class Game implements IGame {
  private _mapaLaberinto: Celda[][] = [];
  /** Botín en el suelo (drops de mobs): se recoge al pisar la celda. */
  dropsSuelo: { f: number; c: number; id: string; cantidad: number }[] = [];
  public gestorMundo: GestorMundo = new GestorMundo();
  public protagonista: Jugador = new Jugador();
  public listaDeEnemigos: EnemigoNPC[] = [];
  public jugadoresRemotos: Map<string, any> = new Map();
  public renderer: Renderer;
  public ui: UIManager = new UIManager();
  public firebase: FirebaseManager = new FirebaseManager();
  public network: NetworkManager;
  /** Identidad estable de la persona (localStorage). */
  public playerId: string;
  /** Identidad de esta pestaña (sessionStorage); es el `idLocal` de red. */
  public connId: string;
  public housing: HousingLocal;
  public signaling: SignalingClient | null = null;
  public networkHttp: NetworkManagerHttp | null = null;
  private modoMultijugador: 'firebase' | 'http' | 'manual' = 'firebase';
  public config: GameConfig = {
    NUMERO_FILAS, NUMERO_COLUMNAS, TAMANO_CELDA,
    ALTO_UI_TOP, ALTO_UI_BOTTOM, RADIO_VISION,
    radioSim: radioSimPorDefecto(RADIO_VISION),
    radioVis: RADIO_VISION,
    TIEMPO_DESVANECIMIENTO_NIEBLA,
    CELDAS_VISIBLES_X: 10,
    CELDAS_VISIBLES_Y: 10,
    vistaDebugActivada: false,
    dificultad: 'dificil',
    zoom: 2,
    targetZoom: 2,
    autoZoom: false,
    tickRate: 16
  };
  public juegoTerminado: boolean = false;
  /** Resultados finales (solo o fin de partida MP). */
  public resultados: ResultadoPartida[] = [];
  /** Estado de espera en la salida (MP). */
  public esperaInfo: { total: number; esperando: number } | null = null;
  public inicioPartida: number = Date.now();
  private roster: Set<string> | null = null;
  /** Roster por `playerId` (sobrevive a reconexiones con otro connId). */
  private rosterJugadores: Set<string> | null = null;
  /** Nick del host vigente (corona en lobby/HUD/tabla). */
  public hostNick: string = '';
  /** Epoch de host que este cliente considera vigente. */
  public hostEpoch: number = 1;
  /** Coordinador de sala (Firebase o HTTP). */
  private coordinador: CoordinadorSala | null = null;
  /** Id de conexión del host al que estamos unidos como invitados. */
  private hostConocidoId: string | null = null;
  private presenciaInterval: number | null = null;
  private vigilanciaHostInterval: number | null = null;
  private migracionEnCurso: boolean = false;
  private reconectando: boolean = false;
  /** Progreso conocido por playerId, para cerrar una tabla justa tras migrar. */
  private progresoSala: Record<string, ProgresoJugador & { playerId: string }> = {};
  private ultimoPublicadoMeta: number = 0;
  /** Inicio de partida que debe sobrevivir a `iniciarMotorJuego` tras una migración. */
  private inicioPartidaPreservado: number | null = null;
  private ultimoChequeoFin: number = 0;
  private ultimoProgreso: number = 0;
  /** Mapa de teclas por acción (predeterminado 1-6 / 'e', remapeable persistente). */
  public keybinds: Record<IdAccion, string> = { ...KEYBINDS_DEFECTO };
  /** true mientras el panel ASIGNAR TECLAS espera la siguiente pulsación. */
  public capturandoTecla: boolean = false;
  public mundoSincronizado: boolean = false;
  /** true cuando el invitado ya recibió un mundo/mapa del host (puede promocionar). */
  private mundoDelHostRecibido: boolean = false;
  public esHost: boolean = false;
  public motorIniciado: boolean = false;
  public colaDeMensajes: string[] = [];
  public bolasDeFuego: any[] = [];
  public radares: any[] = [];
  public whirlwinds: any[] = [];
  public freezes: any[] = [];
  public ultimoTick: number = 0;
  public colaAcciones: any[] = [];
  private heartbeatInterval: number | null = null;
  private npcSyncInterval: number | null = null;
  private guestPollingInterval: number | null = null;
  /** Timer de auto-admisión (check "ADMITIR JUGADORES", cada 10 s). */
  private autoAdmisionTimer: number | null = null;
  private persistenciaMundo: PersistenciaMundo | null = null;
  private housingDecision: 'usar' | 'nueva' | null = null;
  /** Espejo local (mazerpg.mundo.*) de la casa: SU persistencia cuando no hay Firebase. */
  private readonly espejo: EspejoLocal = new EspejoLocal();
  private idCasaEspejo: string | null = null;
  private deltasCasaPendientes: DeltaMundo[] = [];
  private timerEspejoCasa: number | null = null;
  private firebaseHeartbeatInterval: number | null = null;
  private firebaseNpcSyncInterval: number | null = null;
  public lobbyManager!: LobbyManager;
  private gameLoopId: number | null = null;
  private juegoPausado: boolean = false;
  private ultimoFrameTime: number = 0;
  private fpsBajoContador: number = 0;
  private readonly FPS_MINIMO: number = 15;
  /** F4a: estado del interés adaptativo (expuesto para debug/smoke). */
  public interesActual: EstadoInteres | null = null;
  /** F4b: clasificación hot/lod/cold del último frame (debug/smoke). */
  public streamingActual: SeleccionStreaming | null = null;
  /** F4b.3: mundo compacto recibido del host (gen+deltas). */
  public mundoRemotoCompacto: boolean = false;
  /** F4b.3: deltas de la sesión por nodo (host) para el invitado. */
  private deltasMundo: Map<string, DeltaMundo[]> = new Map();
  /** Mapamundi: descubrimiento por jugador y overlay. */
  public nodosDescubiertos: Set<string> = new Set();
  public mapaAbierto: boolean = false;
  private mapamundi: MapamundiUI | null = null;
  private ultimoRefrescoMapa: number = 0;
  private fpsEma: number = 60;
  private fpsBajoMs: number = 0;
  private fpsAltoMs: number = 0;
  private ultimaActualizacionInteres: number = 0;
  private readonly FPS_UMBRAL_SEGUNDOS: number = 3;
  private diagTimer: number | null = null;
  private diagFrameCount: number = 0;
  private diagLastLog: number = 0;
  private fundidoInicio: number = Number.NEGATIVE_INFINITY;
  private readonly fundidoDuracion: number = 400;
  /** Interpolación de cámara al cambiar de nodo en el invitado (F3.3). */
  private transicionCamara: { desde: { colOffset: number; filaOffset: number }; inicio: number; duracion: number } | null = null;
  private tickMundo: number = 0;
  private mundoCargado: boolean = false;
  private readonly arbitroDeltas: ArbitroDeltas = new ArbitroDeltas();
  private portalesInactivosCache: Set<string> = new Set();
  private portalesInactivosRecalculadoEn: number = Number.NEGATIVE_INFINITY;
  /** Tema de render del nodo que el host tiene activo; el invitado no tiene árbol propio. */
  private ambienteRemoto: 'casa' | 'dungeon' | null = null;
  private readonly INTERVALO_PORTALES_MS: number = 250;
  /** Debounce del guardado del espejo de la casa (solo sin Firebase). */
  private static readonly DEBOUNCE_ESPEJO_CASA_MS = 1500;
  /** Límite de deltas acumulados en el doc del espejo antes de plegarlos en el snapshot. */
  private static readonly LIMITE_DELTAS_ESPEJO = 100;

  constructor() {
    (window as any).game = this;
    // Versión de juego: badge discreto en el lobby + log de arranque (¿qué está desplegado?).
    const badgeVersion = document.getElementById('lobbyVersion');
    if (badgeVersion) badgeVersion.textContent = `v${__VERSION__}`;
    console.log(`mazerpg v${__VERSION__}`);
    // Identidad: playerId estable (persona) + connId de pestaña (red/buzón).
    this.playerId = obtenerPlayerId(window.localStorage);
    this.connId = crearIdConexion(this.playerId, window.sessionStorage);
    this.network = new NetworkManager(this.connId, this.playerId);
    // Keybinds de usuario (mazerpg.ui.keybinds); JSON corrupto o ausente → defaults.
    this.keybinds = cargarKeybinds(() => localStorage.getItem('mazerpg.ui.keybinds'));
    this.capturandoTecla = false;
    const canvas = document.getElementById('mazeCanvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    const worldMapCanvas = document.getElementById('worldMapCanvas') as HTMLCanvasElement | null;
    if (worldMapCanvas) this.mapamundi = new MapamundiUI(worldMapCanvas);
    this.housing = new HousingLocal(this.idLocalActivo);
    this.inicializarAssets();
    this.setupEntity(this.protagonista);
    this.initMap();
    this.ajustarDimensiones();
    window.addEventListener('resize', () => {
      // Solo se recalculan dimensiones: aplicar el esquema de UI de partida aquí
      // encendía el dock de acciones en el lobby (en móvil `resize` se dispara
      // al moverse la barra de direcciones) y tapaba los botones de inicio.
      this.ajustarDimensiones();
    });
    this.setupEventListeners();
    this.verificarUrlParams();
    this.lobbyManager = new LobbyManager(this);
    // Los errores de Firebase se muestran en el front (log + banner), no solo en consola.
    this.firebase.setErrorReporter((contexto, e) => {
      const msg = (e as any)?.message ?? String(e);
      this.registrarEventoLog(`⚠ Firebase (${contexto}): ${msg}`);
      this.mostrarAvisoFirebase(`⚠ Firebase (${contexto}): ${msg}`);
    });

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const toque = e.touches[0];
        this.manejarTap(toque.clientX, toque.clientY);
    }, { passive: false });

    canvas.addEventListener('mousedown', (e) => {
        this.manejarTap(e.clientX, e.clientY);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.motorIniciado && !this.mpActivo) {
        this.pausarJuego();
      } else if (!document.hidden && this.juegoPausado && !this.mpActivo) {
        this.reanudarJuego();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'Q') {
        e.preventDefault();
        if (confirm('¿Forzar recarga de emergencia?')) {
          window.location.reload();
        }
      }
    });

    const panicToggle = document.getElementById('panicBtnToggle') as HTMLInputElement;
    if (panicToggle) {
      panicToggle.addEventListener('change', () => {
        const panicBtn = document.getElementById('panicButton');
        if (panicBtn) {
          panicBtn.style.display = panicToggle.checked ? 'block' : 'none';
        }
      });
    }

    const panicBtn = document.getElementById('panicButton');
    if (panicBtn) {
      panicBtn.addEventListener('click', () => {
        if (confirm('¿Forzar recarga de emergencia?')) {
          window.location.reload();
        }
      });
    }
  }

  get mapaLaberinto(): Celda[][] {
    return celdasCompatibilidad(this.gestorMundo, this._mapaLaberinto);
  }

  get nodoActivo(): NodoMundo | null {
    return this.gestorMundo.mundo.get(this.gestorMundo.nodoActivoId) ?? null;
  }

  /** Convierte una celda local del nodo activo a coordenadas de mundo. */
  worldDesdeCeldaActiva(fila: number, columna: number): { fila: number; columna: number } {
    if (!this.gestorMundo.nodoActivoId) return { fila, columna };
    const t = this.gestorMundo.transformAbsoluto(this.gestorMundo.nodoActivoId);
    return { fila: t.df + fila, columna: t.dc + columna };
  }

  /** Interpola la cámara hacia el objetivo vivo durante 400 ms (invitado). */
  private aplicarTransicionCamara(objetivo: { colOffset: number; filaOffset: number }): {
    colOffset: number;
    filaOffset: number;
  } {
    const transicion = this.transicionCamara;
    if (!transicion) return objetivo;
    const t = Math.min(1, (performance.now() - transicion.inicio) / transicion.duracion);
    const suave = t * t * (3 - 2 * t);
    const offset = {
      colOffset: transicion.desde.colOffset + (objetivo.colOffset - transicion.desde.colOffset) * suave,
      filaOffset: transicion.desde.filaOffset + (objetivo.filaOffset - transicion.desde.filaOffset) * suave,
    };
    if (t >= 1) this.transicionCamara = null;
    return offset;
  }

  /** Nodos visibles para el renderer (con transform absoluto). */
  /**
   * F4b: clasifica los nodos cargados en activo/hot/lod/cold y devuelve las
   * entradas que se dibujan (todo menos cold), la lista completa (para evictar
   * caches) y la selección para debug/smoke.
   */
  private nodosStreaming(offsetMundo: { colOffset: number; filaOffset: number }): {
    entradas: Array<{ nodo: NodoMundo; transform: { df: number; dc: number }; nivel: NivelNodo }>;
    candidatos: Array<{ nodo: NodoMundo; transform: { df: number; dc: number } }>;
    seleccion: SeleccionStreaming;
  } {
    let candidatos: Array<{ nodo: NodoMundo; transform: { df: number; dc: number } }>;
    if (this.gestorMundo.mundo.size === 0 || !this.gestorMundo.nodoActivoId) {
      const nodo: NodoMundo = {
        id: '__activo__',
        padreId: null,
        transform: { df: 0, dc: 0 },
        filas: this.mapaLaberinto.length,
        columnas: this.mapaLaberinto[0]?.length ?? 0,
        tipo: this.ambienteRemoto === 'casa' ? 'personal' : 'mazmorra',
        gen: { nombre: 'mazmorra', version: 1, seed: 0, params: {} },
        celdas: this.mapaLaberinto,
        ownerId: null,
      };
      candidatos = [{ nodo, transform: { df: 0, dc: 0 } }];
    } else {
      const activo = this.nodoActivo;
      if (activo?.tipo === 'personal') {
        candidatos = [{ nodo: activo, transform: this.gestorMundo.transformAbsoluto(activo.id) }];
      } else {
        const entries = Array.from(this.gestorMundo.mundo.values()).map((nodo) => ({
          nodo,
          transform: this.gestorMundo.transformAbsoluto(nodo.id),
        }));
        candidatos = entries.filter((e) => {
          if (e.nodo.id === this.gestorMundo.nodoActivoId) return true;
          // Los portales (casa) y nodos sin colocar no se cosen al mundo.
          if (e.nodo.tipo === 'personal') return false;
          if (e.nodo.padreId === null) return true;
          return e.transform.df !== 0 || e.transform.dc !== 0;
        });
      }
    }

    const vista = {
      minFila: offsetMundo.filaOffset,
      maxFila: offsetMundo.filaOffset + this.config.CELDAS_VISIBLES_Y,
      minColumna: offsetMundo.colOffset,
      maxColumna: offsetMundo.colOffset + this.config.CELDAS_VISIBLES_X,
    };
    const activoId = this.gestorMundo.nodoActivoId || '__activo__';
    const seleccion = calcularStreaming(
      candidatos.map((e) => ({
        id: e.nodo.id,
        transform: e.transform,
        filas: e.nodo.filas,
        columnas: e.nodo.columnas,
      })),
      activoId,
      vista,
    );
    const entradas = candidatos
      .filter((e) => seleccion.niveles.get(e.nodo.id) !== 'cold')
      .map((e) => ({ ...e, nivel: seleccion.niveles.get(e.nodo.id) ?? 'cold' }));
    return { entradas, candidatos, seleccion };
  }

  /** Mapamundi: marca un nodo como descubierto para este jugador. */
  private marcarNodoDescubierto(nodoId: string): void {
    if (nodoId) this.nodosDescubiertos.add(nodoId);
  }

  /** Estado actual para el overlay del mapamundi. */
  private entradaMapa(): EntradaMapaUI {
    const nodos = Array.from(this.gestorMundo.mundo.values()).map((nodo) => ({
      ...nodo,
      transform: this.gestorMundo.transformAbsoluto(nodo.id),
    }));
    return {
      nodos,
      descubiertos: this.nodosDescubiertos,
      activoId: this.gestorMundo.nodoActivoId,
      jugador: this.worldDesdeCeldaActiva(this.protagonista.fila, this.protagonista.columna),
      casaActiva: this.nodoActivo?.tipo === 'personal',
    };
  }

  toggleMapamundi(): void {
    if (this.mapaAbierto) this.cerrarMapamundi();
    else this.abrirMapamundi();
  }

  private abrirMapamundi(): void {
    if (!this.motorIniciado || this.juegoTerminado || !this.mapamundi) return;
    this.mapaAbierto = true;
    this.ultimoRefrescoMapa = performance.now();
    this.mapamundi.abrir(this.entradaMapa());
  }

  private cerrarMapamundi(): void {
    this.mapaAbierto = false;
    this.mapamundi?.cerrar();
  }

  initMap() {
    this._mapaLaberinto = [];
    for (let fila = 0; fila < this.config.NUMERO_FILAS; fila++) {
      let filaCeldas = [];
      for (let columna = 0; columna < this.config.NUMERO_COLUMNAS; columna++) {
        filaCeldas.push(new Celda(fila, columna));
      }
      this._mapaLaberinto.push(filaCeldas);
    }
  }

  ajustarDimensiones() {
    const canvas = document.getElementById('mazeCanvas') as HTMLCanvasElement;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    this.config.CELDAS_VISIBLES_X = Math.ceil(canvas.width / this.config.TAMANO_CELDA) + 4;
    this.config.CELDAS_VISIBLES_Y = Math.ceil((canvas.height - this.config.ALTO_UI_TOP - this.config.ALTO_UI_BOTTOM) / this.config.TAMANO_CELDA) + 4;
    this.medirBandaInferior();
  }

  /**
   * Banda inferior dinámica (spec-2 §6): mide el alto real del UI de acciones
   * activo (dock o acordeón móvil) y lo aplica a ALTO_UI_BOTTOM. En PC el
   * acordeón es un overlay flotante y conserva el alto por defecto.
   */
  private medirBandaInferior(): void {
    const body = document.body;
    const enDock = body.classList.contains('esquema-dock');
    const enMovil = body.classList.contains('esquema-acordeon-movil');
    if (!enDock && !enMovil) return;
    const contenido = document.querySelector('.actions-content') as HTMLElement | null;
    if (!contenido) return;
    const contenedor = contenido.closest('#actionDock, #actionsMenu') as HTMLElement | null;
    if (!contenedor) return;
    const visible = contenedor.id === 'actionDock'
      ? getComputedStyle(contenedor).display !== 'none'
      : contenedor.classList.contains('visible');
    if (!visible) return;
    // Con el dock colapsado el contenido está display:none → alto 0 → queda el mínimo (100).
    const alto = Math.round(contenido.getBoundingClientRect().height);
    this.config.ALTO_UI_BOTTOM = Math.max(100, alto);
  }

  private verificarUrlParams() {
    // Primero verificar si viene de la URL como parámetro
    const params = new URLSearchParams(window.location.search);
    const partidaIdFromUrl = params.get('id');
    
    // Si no hay en URL, verificar si fue inyectado por el servidor
    const partidaIdFromServer = (window as any).PARTIDA_ID;
    
    const partidaId = partidaIdFromUrl || partidaIdFromServer;
    
    if (partidaId) {
      console.log('Partida ID:', partidaId, '(from:', partidaIdFromUrl ? 'URL' : 'server', ')');
      this._partidaIdDesdeUrl = partidaId;
      this.registrarEventoLog(`Partida detectada: ${partidaId}`);
    }
  }

  private _partidaIdDesdeUrl: string | null = null;

  get partidaIdDesdeUrl(): string | null {
    return this._partidaIdDesdeUrl;
  }

  setupEventListeners() {
    document.getElementById('menuToggle')?.addEventListener('click', () => {
      document.getElementById('topMenu')?.classList.toggle('visible');
    });

    document.getElementById('actionsToggle')?.addEventListener('click', () => {
        const menu = document.getElementById('actionsMenu');
        const toggle = document.getElementById('actionsToggle');
        if (menu && toggle) {
            menu.classList.toggle('visible');
            toggle.textContent = menu.classList.contains('visible') ? 'ACCIONES ▼' : 'ACCIONES ▲';
        }
    });

    document.getElementById('btnDebug')?.addEventListener('click', () => {
      this.config.vistaDebugActivada = !this.config.vistaDebugActivada;
      this.registrarEventoLog(`Modo Desarrollo ${this.config.vistaDebugActivada ? 'ACTIVADO' : 'DESACTIVADO'}`);
      this.actualizarPanelAcciones();
    });

    document.getElementById('btnChat')?.addEventListener('click', () => this.ui.toggleChat(this));
    document.getElementById('chkAdmitir')?.addEventListener('change', () => this.iniciarAutoAdmision());

    document.getElementById('btnKeybindsPanel')?.addEventListener('click', () => this.abrirPanelKeybinds());
    document.getElementById('btnCerrarKeybinds')?.addEventListener('click', () => {
      document.getElementById('keybindsModal')!.style.display = 'none';
    });

    document.getElementById('dockToggle')?.addEventListener('click', () => {
      const colapsado = document.body.classList.toggle('dock-collapsed');
      localStorage.setItem('mazerpg.ui.dockCollapsed', String(colapsado));
      const tirador = document.getElementById('dockToggle');
      if (tirador) tirador.textContent = colapsado ? '▲' : '▼';
    });
    // Colapso persistido (saneado: no-'true' → desplegado)
    if (localStorage.getItem('mazerpg.ui.dockCollapsed') === 'true') {
      document.body.classList.add('dock-collapsed');
      const tirador = document.getElementById('dockToggle');
      if (tirador) tirador.textContent = '▲';
    }

    document.getElementById('btnLogPanel')?.addEventListener('click', () => {
      document.getElementById('logPanel')?.classList.toggle('visible');
    });



    document.getElementById('btnRespawn')?.addEventListener('click', () => this.respawnPlayer());
    document.getElementById('btnEmpezar')?.addEventListener('click', () => this.respawnPlayer());
    document.getElementById('btnSalir')?.addEventListener('click', () => {
      this.vaciarEspejoCasa();
      window.location.reload();
    });
    document.getElementById('btnAbandonar')?.addEventListener('click', () => this.abandonarPartida());



    document.getElementById('btnProcesarResp')?.addEventListener('click', async () => {
        const input = document.getElementById('manualAnswerIn') as HTMLTextAreaElement;
        const sdp = this.reensamblarPartes(input.value);
        if (!sdp) return;
        input.value = sdp;
        const tokenOferta = document.getElementById('manualOfferToken')?.textContent?.trim();
        const tokenRespuesta = this.tokenDeSdp(sdp);
        this.actualizarTokenManual('manualAnswerTokenHost', sdp);
        if (tokenOferta && tokenOferta !== '—' && tokenRespuesta && tokenOferta !== tokenRespuesta) {
            this.registrarEventoLog(`⚠ Token de respuesta (${tokenRespuesta}) ≠ oferta actual (${tokenOferta}); se usará el de la respuesta.`);
        }
        const resultado = await this.network.procesarRespuestaManual(sdp);
        if (resultado.ok) {
            input.value = '';
            this.actualizarTokenManual('manualAnswerTokenHost', '');
            this.registrarEventoLog('Respuesta manual procesada; esperando DataChannel...');
        } else {
            const msg = resultado.error ?? 'No se pudo procesar la respuesta.';
            this.registrarEventoLog(`❌ ${msg}`);
            alert(msg);
        }
    });

    document.getElementById('btnProcesarOferta')?.addEventListener('click', async () => {
        const ofertaInput = document.getElementById('manualOfferIn') as HTMLTextAreaElement;
        const offer = this.reensamblarPartes(ofertaInput.value);
        if (offer) {
            try {
                ofertaInput.value = offer;
                const answer = await this.network.aceptarOfertaManual(offer, this);
                (document.getElementById('manualAnswerOut') as HTMLTextAreaElement).value = answer;
                this.actualizarTokenManual('manualOfferTokenGuest', offer);
                this.actualizarTokenManual('manualAnswerToken', answer);
                this.registrarEventoLog("Respuesta manual generada.");
                this.esHost = false;
                this.network.esHost = false;
                this.modoMultijugador = 'manual';
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                this.registrarEventoLog(`❌ ${msg}`);
                alert(msg);
            }
        }
    });

    document.getElementById('btnInvitarCoop')?.addEventListener('click', () => {
        if (this.modoMultijugador !== 'manual' || !this.esHost) {
            this.registrarEventoLog('Activa COOPERATIVO como host para invitar por WebRTC.');
            return;
        }
        this.lobbyManager.showManualMode('host');
        this.registrarEventoLog('Panel de invitación WebRTC abierto. Pulsa NUEVA OFERTA para otro invitado.');
    });

    document.getElementById('btnCopyOffer')?.addEventListener('click', () => {
        this.copiarTexto((document.getElementById('manualOfferOut') as HTMLTextAreaElement).value);
    });
    document.getElementById('btnCopyAnswer')?.addEventListener('click', () => {
        this.copiarTexto((document.getElementById('manualAnswerOut') as HTMLTextAreaElement).value);
    });
    const manualOfferIn = document.getElementById('manualOfferIn') as HTMLTextAreaElement | null;
    if (manualOfferIn) {
        manualOfferIn.addEventListener('input', () => {
            const normalizado = this.reensamblarPartes(manualOfferIn.value);
            if (normalizado !== manualOfferIn.value) manualOfferIn.value = normalizado;
            this.actualizarTokenManual('manualOfferTokenGuest', manualOfferIn.value);
        });
    }
    const manualAnswerIn = document.getElementById('manualAnswerIn') as HTMLTextAreaElement | null;
    if (manualAnswerIn) {
        manualAnswerIn.addEventListener('input', () => {
            const normalizado = this.reensamblarPartes(manualAnswerIn.value);
            if (normalizado !== manualAnswerIn.value) manualAnswerIn.value = normalizado;
            this.actualizarTokenManual('manualAnswerTokenHost', manualAnswerIn.value);
        });
    }

    document.getElementById('btnFireball')?.addEventListener('click', () => this.lanzarBolaDeFuego(this.protagonista, true));
    document.getElementById('btnFireballAction')?.addEventListener('click', () => this.lanzarBolaDeFuego(this.protagonista, true));
    document.getElementById('btnWhirlwindAction')?.addEventListener('click', () => this.lanzarWhirlwind(this.protagonista, true));
    document.getElementById('btnFreezeAction')?.addEventListener('click', () => this.lanzarCongelar(this.protagonista, true));
    document.getElementById('btnBowAction')?.addEventListener('click', () => this.lanzarArco(this.protagonista, true));
    document.getElementById('btnCreateFoodAction')?.addEventListener('click', () => this.crearComidaHabilidad(this.protagonista, true));
    document.getElementById('btnGuardAction')?.addEventListener('click', () => this.teletransportarAliados(this.protagonista, true));
    document.getElementById('btnRadarAction')?.addEventListener('click', () => this.lanzarRadar(this.protagonista, true));
    document.getElementById('btnRestartAction')?.addEventListener('click', () => window.location.reload());
    document.getElementById('btnTeleportHousing')?.addEventListener('click', () => this.teleportHousing());
    document.getElementById('btnTeleportCostura')?.addEventListener('click', () => this.teleportCosturaDebug());
    document.getElementById('btnWorldMap')?.addEventListener('click', () => this.toggleMapamundi());
    document.getElementById('btnCloseWorldMap')?.addEventListener('click', () => this.cerrarMapamundi());
    document.getElementById('btnEquipoAction')?.addEventListener('click', () => this.abrirEquipo());
    document.getElementById('btnBotinAction')?.addEventListener('click', () => this.soltarBotin(this.protagonista.fila, this.protagonista.columna));

    document.getElementById('zoomSlider')?.addEventListener('input', (e) => {
        this.config.targetZoom = parseFloat((e.target as HTMLInputElement).value);
    });

    document.getElementById('autoZoomCheck')?.addEventListener('change', (e) => {
        this.config.autoZoom = (e.target as HTMLInputElement).checked;
    });

    const trSelect = document.getElementById('tickRateSelect') as HTMLSelectElement;

    trSelect?.addEventListener('change', (e) => {
        const val = parseInt((e.target as HTMLSelectElement).value);
        this.config.tickRate = val;
        this.registrarEventoLog(`Velocidad de turno ajustada a ${val}ms`);
    });

    window.addEventListener('keydown', (e) => {
      if (this.capturandoTecla) return; // el panel ASIGNAR TECLAS consume la pulsación

      if (e.key === 'Enter') {
        this.ui.toggleChat(this);
        return;
      }
      if (document.getElementById('chatModal')?.style.display === 'flex') return;

      const tecla = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      // Mapamundi: con el overlay abierto se bloquea el input; M/Esc lo cierran.
      if (this.mapaAbierto) {
        if (e.key === 'Escape' || tecla === 'm') this.cerrarMapamundi();
        return;
      }

      const accion = accionParaTecla(this.keybinds, tecla);

      const panelEquipo = document.getElementById('equipoModal');
      if (accion === 'equipo') {
        if (panelEquipo?.style.display === 'flex') this.lobbyManager.closeEquipoModal();
        else this.abrirEquipo();
        return;
      }
      // Con el panel de equipo abierto, no se mueve ni se lanzan habilidades.
      if (panelEquipo?.style.display === 'flex') return;

      if (this.juegoTerminado) return;

      if (tecla === 'm') {
        this.abrirMapamundi();
        return;
      }

      let haMovido = false;
      if (e.key === 'ArrowUp' || tecla === 'w') haMovido = this.protagonista.intentarMover(-1, 0, this);
      if (e.key === 'ArrowDown' || tecla === 's') haMovido = this.protagonista.intentarMover(1, 0, this);
      if (e.key === 'ArrowLeft' || tecla === 'a') haMovido = this.protagonista.intentarMover(0, -1, this);
      if (e.key === 'ArrowRight' || tecla === 'd') haMovido = this.protagonista.intentarMover(0, 1, this);

      if (tecla === 'F9') {
        this.config.vistaDebugActivada = !this.config.vistaDebugActivada;
        this.registrarEventoLog(`Modo Desarrollo ${this.config.vistaDebugActivada ? 'ACTIVADO' : 'DESACTIVADO'}`);
        this.actualizarPanelAcciones();
      }

      if (accion === 'whirlwind') this.lanzarWhirlwind(this.protagonista, true);
      if (accion === 'fireball') this.lanzarBolaDeFuego(this.protagonista, true);
      if (accion === 'freeze') this.lanzarCongelar(this.protagonista, true);
      if (accion === 'bow') this.lanzarArco(this.protagonista, true);
      if (accion === 'create_food') this.crearComidaHabilidad(this.protagonista, true);
      if (accion === 'radar') this.lanzarRadar(this.protagonista, true);

      if (haMovido) {
        this.comprobarSalida();
      }
    });

    window.addEventListener('keyup', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
            this.protagonista.estaCaminando = false;
            if (this.mpActivo) {
                if (this.esHost) {
                    // El host ya actualiza a su protagonista localmente
                } else {
                    this.enviarMultiplayer({ tipo: 'action', accion: { tipo: 'stop_walking' } });
                }
            }
        }
    });
    this.refrescarBadgesTeclado();

    document.getElementById('btnComerciar')?.addEventListener('click', () => {
      const cont = document.getElementById('truequeSocios');
      const abrir = cont ? cont.style.display === 'none' : false;
      this.truequeSociosToggle(abrir);
      if (abrir) this.truequeSociosRender();
    });
    this.conectarTruequeUI();
  }

  onStartSolo(dificultad: string): void {
    this.config.dificultad = dificultad as GameConfig['dificultad'];
    this.mundoSincronizado = true;
    this.guardarSesion('solo');
    this.ui.ocultarLobby();
    this.iniciarMotorJuego();
  }

  onHostGame(modo: 'firebase' | 'http' | 'manual', dificultad: string): void {
    this.config.dificultad = dificultad as GameConfig['dificultad'];
    if (modo === 'http') {
      this.iniciarComoHostHttp();
    } else if (modo === 'manual') {
      this.iniciarComoHostManual();
    } else {
      this.iniciarComoHostFirebase();
    }
  }

  onSaveCharacter(nombre: string, color: string, clase: string, apariencia: import('./core/avatarTintes').AparienciaAvatar): void {
    this.protagonista.nombre = nombre;
    this.protagonista.color = color;
    this.protagonista.clase = clase;
    this.protagonista.apariencia = sanearApariencia(apariencia, clase);
    this.protagonista.aplicarEquipo();
    this.protagonista.personajeCreado = true;
    (document.getElementById('nickInput') as HTMLInputElement).value = nombre;
    this.registrarEventoLog(`Personaje guardado: ${nombre} (${clase})`);
    this.actualizarPanelAcciones();

    // Si hay partida activa, la nueva apariencia se difunde (todos los
    // transportes activos) y se publica la ficha (solo partida Firebase).
    this.difundirApariencia();
    this.publicarFichaEnPartida();

    if (this.partidaIdDesdeUrl) {
      this.registrarEventoLog(`Conectando a partida ${this.partidaIdDesdeUrl}...`);
      this.cambiarModoServidor('http');
      this.ui.ocultarLobby();
      try {
        this.unirseAPartidaHttp(this.partidaIdDesdeUrl);
      } catch (e) {
        this.registrarEventoLog(`Error al conectar: ${e}`);
      }
    }
  }

  onRerollStats(clase: string): void {
    this.protagonista.generarStats(clase);
    this.registrarEventoLog("Estadísticas recalculadas.");
  }

  async onJoinGame(partidaId: string, modo: 'firebase' | 'http'): Promise<void> {
    this.lobbyManager.showConnecting('Conectando a la partida...');
    try {
      if (modo === 'http') {
        this.iniciarModoHttp();
        await this.unirseAPartidaHttp(partidaId);
      } else {
        await this.unirseAPartidaFirestore(partidaId);
      }
    } catch (e) {
      console.error('Fallo al unirse a la partida:', e);
      this.registrarEventoLog(`No se pudo unir a la partida ${partidaId}.`);
      this.lobbyManager.hideConnecting();
      this.lobbyManager.showGameBrowser();
    }
  }

  onResumeSession(): void {
    this.reanudarPartida();
  }

  onSelectMode(modo: LobbyMode): void {
    if (modo === 'firebase') {
      this.modoMultijugador = 'firebase';
    } else if (modo === 'http') {
      this.modoMultijugador = 'http';
      this.iniciarModoHttp();
    } else if (modo === 'cooperativo') {
      this.modoMultijugador = 'manual';
      // El coop manual no usa signaling/HTTP: cerrar restos de una partida
      // HTTP evita que `remotosActivos` resuelva contra el transporte viejo.
      this.networkHttp?.desconectar();
      this.networkHttp = null;
      this.signaling?.desconectar();
      this.signaling = null;
    } else if (modo === 'solo') {
      this.modoMultijugador = 'manual';
      this.signaling?.desconectar();
      this.networkHttp?.desconectar();
      this.networkHttp = null;
    }
  }

  onCancelConnect(): void {
    this.lobbyManager.showGameBrowser();
  }

  getCharacterData(): import('./ui/LobbyManager').CharacterData {
    return {
      nombre: this.protagonista.nombre,
      color: this.protagonista.color,
      clase: this.protagonista.clase,
      fuerza: this.protagonista.fuerza,
      agilidad: this.protagonista.agilidad,
      inteligencia: this.protagonista.inteligencia,
      personajeCreado: this.protagonista.personajeCreado,
      apariencia: aparienciaEfectiva(this.protagonista.clase, this.protagonista.apariencia)
    };
  }

  // --- Panel de equipo/inventario (piloto): opera sobre el protagonista ---

  getEstadoEquipo(): import('./ui/LobbyManager').EstadoEquipo {
    const p = this.protagonista;
    const bonos = bonosEquipo(p.equipo);
    // Copias libres: el bulto contiene TODAS las copias (incluida la equipada);
    // hay que ocultar solo la copia en uso, no todas las del mismo id.
    const libres = this.bultoLibre();
    const disponibles = libres;
    return {
      equipo: { ...p.equipo },
      inventario: { ...p.inventario },
      disponibles,
      base: { fuerza: p.fuerza, agilidad: p.agilidad, inteligencia: p.inteligencia },
      total: {
        fuerza: p.fuerza + bonos.fuerza,
        agilidad: p.agilidad + bonos.agilidad,
        inteligencia: p.inteligencia + bonos.inteligencia,
        vida: bonos.vida,
      },
      peso: p.peso(),
      capacidad: p.capacidadMaxima(),
      sobrecarga: p.penalizacion(),
      clase: p.clase,
      apariencia: aparienciaEfectiva(p.clase, p.apariencia),
    };
  }

  equiparItem(id: string): void {
    this.protagonista.equiparItem(id);
    this.lobbyManager.renderEquipo();
    this.guardarSesionActual();
    this.registrarEventoLog(`Equipado: ${id}`);
  }

  desequiparRanura(ranura: import('./core/equipo').RanuraEquipo): void {
    this.protagonista.desequiparRanura(ranura);
    this.lobbyManager.renderEquipo();
    this.guardarSesionActual();
  }

  consumirItem(id: string): void {
    this.protagonista.consumirItem(id);
    this.lobbyManager.renderEquipo();
  }

  /** Abre/cierra el panel de equipo desde la partida (botón 🎒 o tecla E). */
  abrirEquipo(): void {
    this.lobbyManager.openEquipoModal();
  }

  /** Usa un consumible (cura) y refresca el panel. */
  usarItem(id: string): void {
    const antes = this.protagonista.vidaActual;
    this.protagonista.usarItem(id);
    const curado = this.protagonista.vidaActual - antes;
    this.registrarEventoLog(curado > 0 ? `Usado ${id}: +${curado} vida` : `Usado ${id}`);
    this.lobbyManager.renderEquipo();
    this.guardarSesionActual();
  }

  /** Difunde la apariencia actual por todos los transportes activos (cambio en caliente). */
  difundirApariencia(): void {
    const ef = aparienciaEfectiva(this.protagonista.clase, this.protagonista.apariencia);
    const inventario = this.protagonista.exportarInventario();
    this.enviarMultiplayer({ tipo: 'avatar', id: this.idLocalActivo, apariencia: ef, inventario });
  }

  /**
   * Publica la ficha en partidas/{pid}/jugadores/{idLocal} (solo Firebase;
   * en modo HTTP el pid no es partida Firestore y se omite — el handshake cubre).
   */
  publicarFichaEnPartida(): void {
    const net = this.network;
    const pid = net ? net.idPartidaActual : null;
    if (!pid || !net || !this.firebase.isInitialized()) return;
    const ef = aparienciaEfectiva(this.protagonista.clase, this.protagonista.apariencia);
    this.firebase.guardarAparienciaJugador(
      pid, net.idLocal,
      { ...fichaJugador(this.protagonista.nombre, this.protagonista.clase, ef), inventario: this.protagonista.exportarInventario() });
  }

  /** Pinta el sprite tineado (frame idle) en el canvas del modal: lo que ves es lo que viaja. */
  pintarPreviewAvatar(canvas: HTMLCanvasElement, clase: string, apariencia: import('./core/avatarTintes').AparienciaAvatar): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sm = this.renderer.spriteManager;
    const ef = aparienciaEfectiva(clase, apariencia);
    const pref = ef.genero === 'f' ? 'player_f' : 'player';
    const base = `${pref}_${clase}_idle`;
    const nombreBase = sm.obtenerSprite(base) ? base : `${base}_0`;
    if (!sm.obtenerSprite(nombreBase)) return;
    const variante = this.renderer.avatarCompositor.obtenerVariante(nombreBase, clase, 'idle', ef) || nombreBase;
    const info = sm.obtenerSprite(variante);
    if (!info || !info.image) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(info.image, info.sx, info.sy, info.sw, info.sh, 0, 0, canvas.width, canvas.height);
  }

  hasSavedSession(): boolean {
    return localStorage.getItem('mazeRPG_lastSession') !== null;
  }

  getSignalingUrlLabel(): string {
    return getSignalingUrl();
  }

  isFirebaseConfigured(): boolean {
    return this.firebase.isInitialized();
  }

  async getGameList(modo: 'firebase' | 'http'): Promise<any[]> {
    if (modo === 'http') {
      return await this.listarPartidasHttp();
    }
    return await this.listarPartidasFirestore();
  }

  empezarSolo() {
    this.mundoSincronizado = true;
    this.progresoSala = {};
    this.rosterJugadores = null;
    this.mundoDelHostRecibido = false;
    this.guardarSesion('solo');
    this.ui.ocultarLobby();
    this.iniciarMotorJuego();
  }

  iniciarComoHostFirebase() {
    this.esHost = true;
    this.network.esHost = true;
    this.modoMultijugador = 'firebase';
    this.iniciarAutoAdmision();
    const hc = document.getElementById('hostControls');
    if (hc) hc.style.display = 'flex';
    this.crearPartidaFirestore();
  }

  iniciarComoHostHttp() {
    this.esHost = true;
    this.modoMultijugador = 'http';
    this.signaling?.desconectar();
    this.networkHttp?.desconectar();
    this.signaling = crearSignalingClient();
    this.networkHttp = new NetworkManagerHttp(this.connId, this.playerId);
    this.networkHttp.setSignaling(this.signaling);
    this.iniciarAutoAdmision();
    const hc = document.getElementById('hostControls');
    if (hc) hc.style.display = 'flex';
    this.crearPartidaHttp();
  }

  async crearPartidaHttp() {
    this.progresoSala = {};
    this.rosterJugadores = null;
    this.mundoDelHostRecibido = false;
    const nombrePartida = `Partida de ${this.protagonista.nombre}`;
    const resultado = await this.signaling!.crearPartida(
      '', this.networkHttp!.idLocal, this.protagonista.nombre, nombrePartida, this.playerId,
    );
    
    if (!resultado) {
        this.registrarEventoLog("Error: No se pudo crear la partida en el servidor HTTP.");
        alert(`No se pudo conectar al servidor local (${getSignalingUrl()}). Arranca el servidor de signaling y reintenta.`);
        return;
    }

    const partidaId = resultado.id;
    this.networkHttp!.idPartidaActual = partidaId;
    this.networkHttp!.esHost = true;
    this.networkHttp!.multiplayerActivo = true;
    this.networkHttp!.hostEpoch = 1;
    this.esHost = true;
    this.hostEpoch = 1;
    this.hostNick = this.protagonista.nombre;
    this.hostConocidoId = this.connId;
    this.crearCoordinadorHttp(partidaId);
    await this.coordinador?.registrarJugador(this.connId, this.playerId, this.protagonista.nombre);
    this.iniciarPresencia();
    this.iniciarVigilanciaHost();
    this.actualizarIndicadorHost();
    this.guardarSesion('host', partidaId);

    const roomDisp = document.getElementById('roomDisplay');
    const roomIdVal = document.getElementById('roomIdVal');
    if (roomDisp && roomIdVal) {
        roomDisp.style.display = 'block';
        roomIdVal.textContent = partidaId;
    }

    this.ui.registrarLogConexion(`Partida creada: ${resultado.id} (HTTP Server)`);
    this.ui.registrarLogConexion(`Servidor: ${getSignalingUrl()}`);
    this.ui.ocultarLobby();
    this.iniciarMotorJuego();
    this.configurarIntervalosHostHttp();
  }

  async unirseAPartidaHttp(id: string) {
    if (!this.motorIniciado) {
      this.progresoSala = {};
      this.rosterJugadores = null;
      this.mundoDelHostRecibido = false;
    }
    if (!this.signaling) {
      this.iniciarModoHttp();
    }
    this.networkHttp!.idPartidaActual = id;
    this.networkHttp!.esHost = false;
    this.networkHttp!.multiplayerActivo = true;
    this.guardarSesion('guest', id);
    this.esHost = false;
    this.crearCoordinadorHttp(id);
    const estado = await this.coordinador?.leerEstado();
    if (estado) {
      this.hostEpoch = estado.hostEpoch;
      this.hostNick = estado.hostNick;
      this.hostConocidoId = estado.hostId === this.connId ? null : estado.hostId;
    } else {
      this.hostConocidoId = null;
    }
    await this.coordinador?.registrarJugador(this.connId, this.playerId, this.protagonista.nombre);
    this.iniciarPresencia();
    this.iniciarVigilanciaHost();
    this.actualizarIndicadorHost();
    
    const roomDisp = document.getElementById('roomDisplay');
    const roomIdVal = document.getElementById('roomIdVal');
    if (roomDisp && roomIdVal) {
        roomDisp.style.display = 'block';
        roomIdVal.textContent = id;
    }
    
    this.registrarEventoLog(`Registrando en la partida ${id}...`);
    
    // Drena el buzón viejo ANTES de anunciarse, para no perder una oferta nueva.
    await this.signaling!.descartarSenales(id, this.networkHttp!.idLocal);
    // Registrar guest en el servidor
    await this.signaling!.registrarGuest(id, this.networkHttp!.idLocal, this.protagonista.nombre);
    
    this.registrarEventoLog(`Esperando que el Host te acepte...`);
    await this.networkHttp!.setupWebRTCGuest(id, this);
    
    // NO iniciar motor aquí - esperar a que el canal P2P se abra
    // El Guest recibirá el mapa del Host via P2P
  }

  configurarIntervalosHostHttp() {
    this.detenerIntervalosHttp();
    // El host necesita escuchar su buzón para recibir answer/ICE de los invitados,
    // independientemente del check de auto-admisión.
    if (this.signaling && this.networkHttp) {
      this.signaling.iniciarPolling(this.networkHttp.idLocal);
    }
    this.heartbeatInterval = window.setInterval(() => {
        if (!this.esHost || !this.networkHttp?.idPartidaActual) return;
        this.signaling!.updateHeartbeat(this.networkHttp.idPartidaActual, this.networkHttp.jugadoresRemotos.size + 1);
        void this.coordinador?.latirHost(this.connId, this.hostEpoch).then((ok) => {
            if (!ok && this.esHost) this.degradarHost('lease rechazado');
        });
    }, INTERVALO_LATIDO_HOST_MS);

    this.npcSyncInterval = window.setInterval(() => {
        if (this.esHost && this.networkHttp?.multiplayerActivo) {
            const listaNpcs = this.listaDeEnemigos.map(e => ({
                id: (e as any).id, f: e.fila, c: e.columna, v: e.vidaActual, vm: e.vidaMaxima
            }));
            this.networkHttp.enviarMensaje({ tipo: 'npc_sync_all', lista: listaNpcs });

            const objetos: any[] = [];
            const dimsSync = this.dimsActivo();
            for (let f = 0; f < dimsSync.filas; f++) {
                for (let c = 0; c < dimsSync.columnas; c++) {
                    const celda = this.mapaLaberinto[f][c];
                    if (celda.alimento || celda.burbuja || celda.tienePico || celda.esPortal) {
                        objetos.push({ f, c, a: celda.alimento, b: celda.burbuja, p: celda.tienePico, pr: celda.esPortal });
                    }
                }
            }
            this.networkHttp.enviarMensaje({ tipo: 'objetos', lista: objetos, is_update: true });
            this.publicarMetadatosHost();
        }
    }, 5000);
  }

  private detenerIntervalosHttp() {
    if (this.heartbeatInterval !== null) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.npcSyncInterval !== null) {
      window.clearInterval(this.npcSyncInterval);
      this.npcSyncInterval = null;
    }
    if (this.guestPollingInterval !== null) {
      window.clearInterval(this.guestPollingInterval);
      this.guestPollingInterval = null;
    }
  }

  async crearPartidaFirestore() {
    this.progresoSala = {};
    this.rosterJugadores = null;
    this.mundoDelHostRecibido = false;
    const id = generateSessionName();
    // Primero creamos; si Firebase falla (reglas/permisos), NO se crea sala ni se arranca.
    const ok = await this.firebase.crearPartida(id, this.idLocalActivo, this.protagonista.nombre, this.playerId);
    if (!ok) {
      this.ui.registrarLogConexion('No se pudo crear la partida en Firebase (reglas/permisos).');
      this.mostrarAvisoFirebase('⚠ No se pudo crear la partida en Firebase. Prueba el modo SERVIDOR LOCAL.');
      return;
    }
    this.network.idPartidaActual = id;
    this.network.hostEpoch = 1;
    this.persistenciaMundo = this.firebase.crearPersistenciaMundo(id);
    this.esHost = true;
    this.hostEpoch = 1;
    this.hostNick = this.protagonista.nombre;
    this.hostConocidoId = this.connId;
    this.crearCoordinadorFirebase(id);
    await this.coordinador?.registrarJugador(this.connId, this.playerId, this.protagonista.nombre);
    this.iniciarPresencia();
    this.iniciarVigilanciaHost();
    this.actualizarIndicadorHost();
    this.guardarSesion('host', id);

    const roomDisp = document.getElementById('roomDisplay');
    const roomIdVal = document.getElementById('roomIdVal');
    if (roomDisp && roomIdVal) {
        roomDisp.style.display = 'block';
        roomIdVal.textContent = id;
    }

    this.publicarFichaEnPartida();
    this.configurarIntervalosHost();
    this.ui.registrarLogConexion(`Partida creada: ${id}`);
    this.ui.ocultarLobby();
    await this.prepararMundo();
    this.iniciarMotorJuego();
  }

  async listarPartidasFirestore(): Promise<any[]> {
    return await this.firebase.getPartidasActivas();
  }

  async listarPartidasHttp(): Promise<any[]> {
    if (!this.signaling) {
      this.signaling = crearSignalingClient();
    }
    return await this.signaling.getPartidasActivas();
  }

  private iniciarModoHttp() {
    if (this.networkHttp) return;
    this.esHost = false;
    this.modoMultijugador = 'http';
    this.signaling?.desconectar();
    this.signaling = crearSignalingClient();
    this.networkHttp = new NetworkManagerHttp(this.connId, this.playerId);
    this.networkHttp.setSignaling(this.signaling);
  }

  cambiarModoServidor(modo: 'firebase' | 'http') {
    this.modoMultijugador = modo;
    this.mundoCargado = false;
    if (modo === 'http') {
      this.iniciarModoHttp();
    }
  }

  async iniciarComoHostManual() {
      this.esHost = true;
      this.network.esHost = true;
      this.modoMultijugador = 'manual';
      await this.generarOfertaManual();
      if (!this.motorIniciado) this.iniciarMotorJuego();
      // El motor oculta el lobby; el panel manual debe seguir visible para
      // copiar la oferta y conectar invitados (multi-invitado).
      this.lobbyManager.showManualMode('host');
      this.actualizarPanelAcciones();
  }

  /** Genera una oferta manual nueva sin reiniciar la partida (multi-invitado). */
  async generarOfertaManual(): Promise<void> {
      const sdp = await this.network.crearOfertaManual(this);
      (document.getElementById('manualOfferOut') as HTMLTextAreaElement).value = sdp;
      this.actualizarTokenManual('manualOfferToken', sdp);
      const btnGen = document.getElementById('btnGenOferta');
      if (btnGen) btnGen.style.display = 'none';
      const btnNueva = document.getElementById('btnNuevaOferta');
      if (btnNueva) btnNueva.style.display = '';
      this.registrarEventoLog(`Oferta manual generada (Dificultad: ${this.config.dificultad}).`);
  }

  /** Entrada del botón NUEVA OFERTA del panel manual. */
  onNewManualOffer(): void {
      void this.generarOfertaManual();
  }

  /** Token opaco de una oferta/respuesta manual (base64 de `{token,sdp}`). */
  private tokenDeSdp(sdpB64: string): string | null {
      try {
          const payload = JSON.parse(atob(sdpB64));
          return typeof payload.token === 'string' ? payload.token : null;
      } catch {
          return null;
      }
  }

  private actualizarTokenManual(id: string, sdpB64: string): void {
      const span = document.getElementById(id);
      if (!span) return;
      const token = this.tokenDeSdp(sdpB64);
      span.textContent = token ?? '—';
  }

  /** Reensambla las 3 partes `MZ3/i/n|` del QR; si no hay cabeceras, deja el texto tal cual. */
  private reensamblarPartes(texto: string): string {
      return reensamblarPartesQr(texto);
  }

  /** Copia texto al portapapeles con fallback para navegadores sin Clipboard API. */
  private copiarTexto(valor: string): void {
      if (!valor) return;
      const fallback = (): void => {
          const ta = document.createElement('textarea');
          ta.value = valor;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } finally { ta.remove(); }
      };
      if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(valor)
              .then(() => this.registrarEventoLog('Copiado al portapapeles.'))
              .catch(() => { fallback(); this.registrarEventoLog('Copiado al portapapeles (fallback).'); });
      } else {
          fallback();
          this.registrarEventoLog('Copiado al portapapeles (fallback).');
      }
  }

  private crearCoordinadorFirebase(partidaId: string): void {
    const db = this.firebase.getDb();
    this.coordinador = db ? new CoordinadorFirebase(db, partidaId) : null;
  }

  private crearCoordinadorHttp(partidaId: string): void {
    this.coordinador = this.signaling ? new CoordinadorHttp(this.signaling, partidaId) : null;
  }

  private iniciarPresencia(): void {
    this.detenerPresencia();
    if (!this.coordinador) return;
    const latir = (): void => {
      if (!this.coordinador || !this.mpActivo) return;
      void this.coordinador.latirPresencia(this.connId, this.playerId, this.protagonista.nombre);
    };
    latir();
    this.presenciaInterval = window.setInterval(latir, INTERVALO_PRESENCIA_MS);
  }

  private detenerPresencia(): void {
    if (this.presenciaInterval !== null) {
      window.clearInterval(this.presenciaInterval);
      this.presenciaInterval = null;
    }
  }

  private iniciarVigilanciaHost(): void {
    this.detenerVigilanciaHost();
    this.vigilanciaHostInterval = window.setInterval(() => { void this.vigilarHost(); }, INTERVALO_VIGILANCIA_MS);
  }

  private detenerVigilanciaHost(): void {
    if (this.vigilanciaHostInterval !== null) {
      window.clearInterval(this.vigilanciaHostInterval);
      this.vigilanciaHostInterval = null;
    }
  }

  private async vigilarHost(): Promise<void> {
    if (!this.coordinador || !this.mpActivo || this.migracionEnCurso || this.reconectando) return;
    const estado = await this.coordinador.leerEstado();
    if (!estado) return;
    this.hostEpoch = Math.max(this.hostEpoch, estado.hostEpoch);

    if (estado.hostId === this.connId) {
      if (!this.esHost) await this.recuperarRolHost(estado.hostEpoch);
      return;
    }

    if (this.esHost) {
      this.degradarHost('la sala eligió otro host');
      return;
    }

    if (!hostVivo(estado, Date.now())) {
      await this.ejecutarEleccionHost(false);
      return;
    }

    if (this.hostConocidoId && estado.hostId !== this.hostConocidoId) {
      await this.reconectarANuevoHost(estado.hostId);
      return;
    }

    if (!this.hostConocidoId) {
      this.hostConocidoId = estado.hostId;
      this.hostNick = estado.hostNick || this.hostNick;
      this.actualizarIndicadorHost();
    }
  }

  async unirseAPartidaFirestore(id: string) {
    if (!this.motorIniciado) {
      this.progresoSala = {};
      this.rosterJugadores = null;
      this.mundoDelHostRecibido = false;
    }
    if (!this.firebase.isInitialized()) {
      this.ui.registrarLogConexion('Firebase no configurado: no se puede unir. Prueba el modo SERVIDOR LOCAL.');
      this.mostrarAvisoFirebase('⚠ Firebase no configurado. Usa el modo SERVIDOR LOCAL.');
      return;
    }
    this.network.idPartidaActual = id;
    this.guardarSesion('guest', id);
    const roomDisp = document.getElementById('roomDisplay');
    const roomIdVal = document.getElementById('roomIdVal');
    if (roomDisp && roomIdVal) {
        roomDisp.style.display = 'block';
        roomIdVal.textContent = id;
    }
    this.esHost = false;
    this.network.esHost = false;
    this.network.multiplayerActivo = true;
    this.crearCoordinadorFirebase(id);
    const estado = await this.coordinador?.leerEstado();
    if (estado) {
      this.hostEpoch = estado.hostEpoch;
      this.network.hostEpoch = estado.hostEpoch;
      this.hostNick = estado.hostNick;
      this.hostConocidoId = estado.hostId === this.connId ? null : estado.hostId;
    } else {
      this.hostConocidoId = null;
    }
    await this.coordinador?.registrarJugador(this.connId, this.playerId, this.protagonista.nombre);
    this.iniciarPresencia();
    this.iniciarVigilanciaHost();
    this.actualizarIndicadorHost();
    this.registrarEventoLog(`Uniéndote a la partida ${id}...`);
    this.network.setupWebRTCGuest(id, this);
    this.publicarFichaEnPartida();
  }

  async admitirCandidatos() {
    if (this.modoMultijugador === 'firebase') {
        this.ui.registrarLogConexion("Buscando candidatos...");
        const snapshot = await this.firebase.getDb()!.collection('partidas').doc(this.network.idPartidaActual!).collection('conexiones').get();
        snapshot.forEach((doc: any) => {
            if (doc.id !== this.idLocalActivo) {
                this.network.setupWebRTCHost(doc.id, this);
            }
        });
    } else if (this.modoMultijugador === 'http' && this.networkHttp) {
        // Obtener lista de Guests esperando y conectar cada uno
        const guests = await this.signaling!.getGuests(this.networkHttp.idPartidaActual!);
        for (const guest of guests) {
            if (guest.guestId !== this.connId) {
                if (!this.networkHttp.jugadoresRemotos.has(guest.guestId)) {
                    this.ui.registrarLogConexion(`Conectando con ${guest.nick}...`);
                }
                await this.networkHttp.setupWebRTCHost(guest.guestId, this);
            }
        }
    }
  }

  /** Auto-admisión: si el check está marcado, revisa candidatos cada 10 s (reemplaza al botón). */
  private iniciarAutoAdmision(): void {
    this.detenerAutoAdmision();
    const chk = document.getElementById('chkAdmitir') as HTMLInputElement | null;
    if (!chk?.checked || !this.esHost) return;
    // Host HTTP: arranca el polling de su buzón para recibir answer/ice
    if (this.modoMultijugador === 'http' && this.networkHttp) {
      this.signaling!.iniciarPolling(this.networkHttp.idLocal);
    }
    this.admitirCandidatos();
    this.autoAdmisionTimer = window.setInterval(() => {
      if (this.esHost) this.admitirCandidatos();
    }, 10000);
  }

  private detenerAutoAdmision(): void {
    if (this.autoAdmisionTimer !== null) {
      window.clearInterval(this.autoAdmisionTimer);
      this.autoAdmisionTimer = null;
    }
  }

  private esperarMs(ms: number): Promise<void> {
    return new Promise((resolver) => window.setTimeout(resolver, ms));
  }

  /**
   * `hostCaidoPorCierre` = true cuando el cierre del DataChannel o el trigger
   * del host ya demuestran que murió; no esperamos al lease para elegir.
   */
  public iniciarEleccionHost(hostCaidoPorCierre: boolean = true): void {
    void this.ejecutarEleccionHost(hostCaidoPorCierre);
  }

  private async ejecutarEleccionHost(hostCaidoPorCierre: boolean = false): Promise<void> {
    if (this.esHost || this.juegoTerminado || this.migracionEnCurso || this.reconectando) return;
    this.migracionEnCurso = true;
    try {
      if (!this.coordinador) {
        this.cerrarSinHost('sin coordinador de sala');
        return;
      }
      let estado = await this.coordinador.leerEstado();
      if (!estado) {
        this.cerrarSinHost('sala no disponible');
        return;
      }
      // Host cuyo canal acabamos de perder: solo ÉL se marca como caído. Si la
      // sala ya eligió a otro (hostId distinto y vivo), se reconecta a él.
      const hostMuertoId = this.hostConocidoId;
      if (hostCaidoPorCierre
        && estado.hostId !== this.connId
        && (hostMuertoId === null || estado.hostId === hostMuertoId)) {
        // El lease puede seguir fresco unos segundos: lo forzamos a 0 para no
        // reconectar al host que acabamos de ver morir.
        estado = { ...estado, lastSeen: 0 };
      }
      this.hostEpoch = Math.max(this.hostEpoch, estado.hostEpoch);
      const decision = resolverHost(estado, this.connId, Date.now());
      this.registrarEventoLog(`Migración de host: ${decision.accion}.`);

      if (decision.accion === 'ninguna') {
        await this.recuperarRolHost(estado.hostEpoch);
        return;
      }
      if (decision.accion === 'reconectar' && decision.hostId) {
        await this.reconectarANuevoHost(decision.hostId);
        return;
      }
      if (decision.accion === 'cerrar') {
        this.cerrarSinHost('sin jugadores con presencia');
        return;
      }
      if (decision.accion === 'reclamar') {
        this.registrarEventoLog('Reclamando el host con CAS...');
        const res = await this.coordinador.reclamarHost(
          this.connId, this.protagonista.nombre, this.playerId, estado.hostEpoch,
        );
        if (res?.ok) {
          await this.promocionarAHost(res.epoch);
          return;
        }
        const epochEsperado = res?.epoch ?? estado.hostEpoch;
        await this.esperarNuevoHost(epochEsperado, hostMuertoId);
        return;
      }
      await this.esperarNuevoHost(estado.hostEpoch, hostMuertoId);
    } finally {
      this.migracionEnCurso = false;
    }
  }

  /**
   * Espera a que la sala tenga un host que no sea el que murió. El epoch solo
   * es pista: la reclamación puede ocurrir ANTES de nuestra primera lectura, así
   * que la condición real es `hostId` vivo y distinto del host muerto.
   */
  private async esperarNuevoHost(epochEsperado: number, hostMuertoId: string | null): Promise<void> {
    if (!this.coordinador) {
      this.cerrarSinHost('sin coordinador de sala');
      return;
    }
    const inicio = Date.now();
    while (Date.now() - inicio < ESPERA_ELECCION_MS) {
      await this.esperarMs(500);
      const estado = await this.coordinador.leerEstado();
      if (!estado) continue;
      if (estado.hostId === this.connId) {
        await this.recuperarRolHost(estado.hostEpoch);
        return;
      }
      const hayNuevoHost = estado.hostId !== hostMuertoId
        && estado.hostId !== ''
        && (hostVivo(estado, Date.now()) || estado.hostEpoch > epochEsperado);
      if (hayNuevoHost) {
        await this.reconectarANuevoHost(estado.hostId);
        return;
      }
    }
    this.cerrarSinHost('la elección no convergió');
  }

  private async recuperarRolHost(epoch: number): Promise<void> {
    if (this.esHost) return;
    await this.promocionarAHost(epoch, true);
  }

  private async promocionarAHost(epoch: number = this.hostEpoch + 1, recuperado: boolean = false): Promise<void> {
    const salaId = this.modoMultijugador === 'http'
      ? this.networkHttp?.idPartidaActual ?? null
      : this.network.idPartidaActual;
    if (!salaId) {
      this.cerrarSinHost('sin partida activa');
      return;
    }
    // Un invitado sin mundo compartido no puede ser autoridad: cerrar limpio.
    if (!this.esHost && !this.mundoDelHostRecibido && !recuperado) {
      this.cerrarSinHost('sin mundo compartido');
      return;
    }

    // El invitado solo tenía el canal con el host difunto: se desmonta antes de
    // asumir autoridad para no arrastrar entidades/channels fantasma al roster.
    this.migracionEnCurso = true;
    this.reconectando = true;
    if (this.modoMultijugador === 'http' && this.networkHttp) {
      this.networkHttp.reconectando = true;
      this.networkHttp.reiniciarPeers();
    } else {
      this.network.reconectando = true;
      this.network.desconectarPeers();
    }
    window.setTimeout(() => {
      if (this.networkHttp) this.networkHttp.reconectando = false;
      this.network.reconectando = false;
    }, 1500);

    this.esHost = true;
    this.hostEpoch = epoch;
    this.hostConocidoId = this.connId;
    this.hostNick = this.protagonista.nombre;
    this.network.esHost = true;
    this.network.hostEpoch = epoch;
    this.network.multiplayerActivo = true;
    if (this.networkHttp) {
      this.networkHttp.esHost = true;
      this.networkHttp.hostEpoch = epoch;
      this.networkHttp.multiplayerActivo = true;
    }
    this.reconectando = false;
    this.migracionEnCurso = false;
    const hc = document.getElementById('hostControls');
    if (hc) hc.style.display = 'flex';

    if (this.modoMultijugador === 'http') {
      this.configurarIntervalosHostHttp();
    } else {
      this.persistenciaMundo ??= this.firebase.crearPersistenciaMundo(salaId);
      this.configurarIntervalosHost();
    }
    this.iniciarPresencia();
    this.iniciarAutoAdmision();
    this.iniciarVigilanciaHost();
    await this.adoptarMetadatosHost();
    this.publicarMetadatosHost(true);
    if (!this.motorIniciado) this.iniciarMotorJuego();
    this.guardarSesion('host', salaId);
    this.actualizarIndicadorHost();
    this.registrarEventoLog(recuperado ? 'Sincronizado como Host.' : 'Ahora eres el Host de la partida.');
    await this.admitirCandidatos();
    // Los supervivientes tardan un instante en re-registrarse como invitados.
    for (const ms of [1000, 3000, 6000]) {
      window.setTimeout(() => {
        if (this.esHost) void this.admitirCandidatos();
      }, ms);
    }
  }

  private degradarHost(motivo: string): void {
    if (!this.esHost) return;
    this.esHost = false;
    this.network.esHost = false;
    if (this.networkHttp) this.networkHttp.esHost = false;
    this.detenerIntervalosFirebase();
    this.detenerIntervalosHttp();
    this.detenerAutoAdmision();
    const hc = document.getElementById('hostControls');
    if (hc) hc.style.display = 'none';
    this.registrarEventoLog(`Has dejado de ser Host (${motivo}).`);
    this.actualizarIndicadorHost();
  }

  private async reconectarANuevoHost(hostId: string): Promise<void> {
    if (this.esHost || this.reconectando) return;
    if (this.hostConocidoId === hostId && this.mpActivo && this.remotosActivos.size > 0) return;
    this.reconectando = true;
    this.migracionEnCurso = true;
    this.registrarEventoLog('Host perdido. Reconectando al nuevo Host...');

    let salaId: string | null = null;
    try {
      if (this.modoMultijugador === 'http' && this.networkHttp) {
        salaId = this.networkHttp.idPartidaActual;
        this.networkHttp.reconectando = true;
        this.networkHttp.reiniciarPeers();
        this.networkHttp.esHost = false;
        this.networkHttp.multiplayerActivo = true;
        this.crearCoordinadorHttp(salaId!);
        await this.signaling?.registrarGuest(salaId!, this.connId, this.protagonista.nombre);
        await this.coordinador?.registrarJugador(this.connId, this.playerId, this.protagonista.nombre);
        // Sin drenar: la primera oferta del nuevo host puede estar ya en el buzón.
        // El filtro `hostEsperado` descarta ofertas del host difunto.
        void this.networkHttp.setupWebRTCGuest(salaId!, this, hostId);
      } else if (this.network.idPartidaActual) {
        salaId = this.network.idPartidaActual;
        this.network.reconectando = true;
        this.network.desconectarPeers();
        this.network.esHost = false;
        this.network.multiplayerActivo = true;
        this.crearCoordinadorFirebase(salaId);
        await this.firebase.limpiarSignaling(salaId, this.connId);
        await this.coordinador?.registrarJugador(this.connId, this.playerId, this.protagonista.nombre);
        void this.network.setupWebRTCGuest(salaId, this);
      }
      this.hostConocidoId = hostId;
      this.hostNick = '';
      this.esHost = false;
      if (salaId) this.guardarSesion('guest', salaId);
      this.iniciarPresencia();
      this.iniciarVigilanciaHost();
      this.actualizarIndicadorHost();
    } finally {
      window.setTimeout(() => {
        this.reconectando = false;
        this.migracionEnCurso = false;
        if (this.networkHttp) this.networkHttp.reconectando = false;
        this.network.reconectando = false;
      }, 5000);
      let intentos = 0;
      const reintentar = (): void => {
        if (this.esHost || !this.mpActivo || this.remotosActivos.size > 0) return;
        intentos++;
        this.registrarEventoLog(`No llegó el canal con el nuevo Host; reintentando (${intentos}/5).`);
        this.reconectando = false;
        this.migracionEnCurso = false;
        if (this.networkHttp) this.networkHttp.reconectando = false;
        this.network.reconectando = false;
        if (intentos >= 5) {
          this.cerrarSinHost('sin canal con el nuevo host');
          return;
        }
        void this.ejecutarEleccionHost(false);
        window.setTimeout(reintentar, 8000);
      };
      window.setTimeout(reintentar, 8000);
    }
  }

  private cerrarSinHost(motivo: string): void {
    if (this.juegoTerminado) return;
    this.registrarEventoLog(`No se pudo migrar el host (${motivo}). Cerrando con resultados parciales.`);
    this.resultados = this.resultadosParciales();
    this.esperaInfo = null;
    this.juegoTerminado = true;
    this.detenerIntervalosFirebase();
    this.detenerIntervalosHttp();
    this.detenerAutoAdmision();
    this.detenerPresencia();
    this.detenerVigilanciaHost();
    this.mostrarAvisoFirebase('Partida finalizada: no se pudo migrar el host.');
  }

  private playerIdDeConexion(id: string): string {
    if (id === this.idLocalActivo) return this.playerId;
    const entidad = this.remotosActivos.get(id)?.entidad;
    return entidad?.playerId || id;
  }

  private entidadDeJugador(playerId: string): any | null {
    if (playerId === this.playerId) return this.protagonista;
    for (const j of this.remotosActivos.values()) {
      if (j.entidad?.playerId === playerId) return j.entidad;
    }
    return null;
  }

  private resultadoDeJugador(playerId: string): ResultadoPartida {
    const e = this.entidadDeJugador(playerId);
    if (e) {
      const oro = e === this.protagonista
        ? (this.protagonista.inventario.oro ?? 0)
        : ((e as any).oro ?? 0);
      return this.resultadoDeEntidad(e.nombre, oro, e.puntosExperiencia ?? 0, e.bajas ?? 0);
    }
    const p = this.progresoSala[playerId];
    if (p) return this.resultadoDeEntidad(p.nick, p.oro, p.xp, p.bajas);
    return this.resultadoDeEntidad(playerId, 0, 0, 0);
  }

  /**
   * Resultado por conexión (no por playerId): dos pestañas del mismo navegador
   * comparten `playerId` pero deben aparecer como jugadores distintos.
   */
  private resultadoDeConexion(id: string): ResultadoPartida {
    const e = this.obtenerEntidadPorId(id);
    if (e) {
      const oro = e === this.protagonista
        ? (this.protagonista.inventario.oro ?? 0)
        : ((e as any).oro ?? 0);
      return this.resultadoDeEntidad(e.nombre, oro, e.puntosExperiencia ?? 0, e.bajas ?? 0);
    }
    return this.resultadoDeJugador(this.playerIdDeConexion(id));
  }

  private resultadosParciales(): ResultadoPartida[] {
    const resultados: ResultadoPartida[] = [];
    const cubiertos = new Set<string>();

    for (const id of this.roster ?? []) {
      resultados.push(this.resultadoDeConexion(id));
      cubiertos.add(this.playerIdDeConexion(id));
    }
    for (const [id] of this.remotosActivos) {
      if (cubiertos.has(this.playerIdDeConexion(id))) continue;
      resultados.push(this.resultadoDeConexion(id));
      cubiertos.add(this.playerIdDeConexion(id));
    }
    if (!cubiertos.has(this.playerId)) {
      resultados.push(this.resultadoDeConexion(this.idLocalActivo));
      cubiertos.add(this.playerId);
    }
    for (const p of Object.values(this.progresoSala)) {
      if (cubiertos.has(p.playerId)) continue;
      resultados.push(this.resultadoDeJugador(p.playerId));
      cubiertos.add(p.playerId);
    }
    return resultados.sort((a, b) => b.puntuacion - a.puntuacion);
  }

  private async adoptarMetadatosHost(): Promise<void> {
    const meta = await this.coordinador?.leerMetadatos();
    if (!meta) return;
    if (typeof meta.inicioPartida === 'number' && meta.inicioPartida > 0) {
      this.inicioPartida = meta.inicioPartida;
      if (!this.motorIniciado) this.inicioPartidaPreservado = meta.inicioPartida;
    }
    if (typeof meta.dificultad === 'string') {
      this.config.dificultad = meta.dificultad as GameConfig['dificultad'];
    }
    if (Array.isArray(meta.roster)) {
      this.rosterJugadores = new Set(meta.roster);
    }
    if (meta.jugadores) {
      for (const [pid, p] of Object.entries(meta.jugadores)) {
        if (!p || typeof p !== 'object') continue;
        this.progresoSala[pid] = {
          playerId: pid,
          nick: p.nick,
          oro: p.oro ?? 0,
          xp: p.xp ?? 0,
          bajas: p.bajas ?? 0,
        };
      }
    }
  }

  private publicarMetadatosHost(forzar: boolean = false): void {
    if (!this.esHost || !this.coordinador) return;
    const ahora = Date.now();
    if (!forzar && ahora - this.ultimoPublicadoMeta < 4500) return;
    this.ultimoPublicadoMeta = ahora;

    const capturar = (playerId: string, e: any): void => {
      if (!e) return;
      const oro = e === this.protagonista
        ? (this.protagonista.inventario.oro ?? 0)
        : ((e as any).oro ?? 0);
      this.progresoSala[playerId] = {
        playerId,
        nick: e.nombre ?? playerId,
        oro,
        xp: e.puntosExperiencia ?? 0,
        bajas: e.bajas ?? 0,
      };
    };
    capturar(this.playerId, this.protagonista);
    this.remotosActivos.forEach((j, id) => {
      if (j.entidad) capturar(j.entidad.playerId || id, j.entidad);
    });

    const jugadores: Record<string, ProgresoJugador> = {};
    for (const p of Object.values(this.progresoSala)) {
      jugadores[p.playerId] = { nick: p.nick, oro: p.oro, xp: p.xp, bajas: p.bajas };
    }
    const meta: MetadatosPartida = {
      inicioPartida: this.inicioPartida,
      dificultad: this.config.dificultad,
      hostNick: this.protagonista.nombre,
      hostEpoch: this.hostEpoch,
      roster: this.rosterJugadores ? [...this.rosterJugadores] : null,
      jugadores,
    };
    void this.coordinador.guardarMetadatos(meta);
  }

  /** Actualiza la corona/badge de host en la barra superior. */
  public actualizarIndicadorHost(): void {
    const badge = document.getElementById('hostBadge');
    if (!badge) return;
    if (!this.mpActivo) {
      badge.style.display = 'none';
      return;
    }
    badge.style.display = 'inline-flex';
    badge.textContent = this.esHost
      ? `HOST: tú (${this.protagonista.nombre})`
      : `HOST: ${this.hostNick || '…'}`;
  }

  configurarIntervalosHost() {
    this.detenerIntervalosFirebase();
    this.firebaseHeartbeatInterval = window.setInterval(() => {
        if (!this.esHost || !this.network.idPartidaActual) return;
        this.firebase.updateHeartbeat(this.network.idPartidaActual, this.remotosActivos.size + 1);
        void this.coordinador?.latirHost(this.connId, this.hostEpoch).then((ok) => {
            if (!ok && this.esHost) this.degradarHost('lease rechazado');
        });
    }, INTERVALO_LATIDO_HOST_MS);

    this.firebaseNpcSyncInterval = window.setInterval(() => {
        if (this.esHost && this.mpActivo) {
            // Sincronizar NPCs
            const listaNpcs = this.listaDeEnemigos.map(e => ({
                id: (e as any).id, f: e.fila, c: e.columna, v: e.vidaActual, vm: e.vidaMaxima
            }));
            this.enviarMultiplayer({ tipo: 'npc_sync_all', lista: listaNpcs });

            // Sincronizar objetos del mundo (fuente de verdad absoluta)
            const objetos: any[] = [];
            const dimsSync = this.dimsActivo();
            for (let f = 0; f < dimsSync.filas; f++) {
                for (let c = 0; c < dimsSync.columnas; c++) {
                    const celda = this.mapaLaberinto[f][c];
                    if (celda.alimento || celda.burbuja || celda.tienePico || celda.esPortal) {
                        objetos.push({ f, c, a: celda.alimento, b: celda.burbuja, p: celda.tienePico, pr: celda.esPortal });
                    }
                }
            }
            this.enviarMultiplayer({ tipo: 'objetos', lista: objetos, is_update: true });
            this.publicarMetadatosHost();
        }
    }, 5000);
  }

  private detenerIntervalosFirebase() {
    if (this.firebaseHeartbeatInterval !== null) {
      window.clearInterval(this.firebaseHeartbeatInterval);
      this.firebaseHeartbeatInterval = null;
    }
    if (this.firebaseNpcSyncInterval !== null) {
      window.clearInterval(this.firebaseNpcSyncInterval);
      this.firebaseNpcSyncInterval = null;
    }
  }

  async inicializarAssets() {
      const sm = this.renderer.spriteManager;
      const resources = SpriteConfig.recursos || {};
      const promises: Promise<any>[] = [];

      for (const [nombre, url] of Object.entries(resources)) {
          promises.push(
              sm.cargarImagen(nombre, url).catch(() => {
                  this.notificarErrorCarga(nombre);
              })
          );
      }

      await Promise.all(promises);

      // Inicializar todos los mapeos desde la configuración
      inicializarSpritesheets(sm);
  }

  notificarErrorCarga(recurso: string) {
      this.registrarEventoLog(`⚠️ Error cargando: ${recurso}. Usando modo geométrico.`);

      // Mostrar un pequeño mensaje visual discreto en la UI
      let aviso = document.getElementById('asset-warning');
      if (!aviso) {
          aviso = document.createElement('div');
          aviso.id = 'asset-warning';
          aviso.style.cssText = 'position: fixed; bottom: 110px; right: 10px; background: rgba(255,165,0,0.7); color: #000; padding: 5px 10px; font-size: 10px; border-radius: 3px; z-index: 100; pointer-events: none; font-family: monospace;';
          document.body.appendChild(aviso);
      }
      aviso.textContent = `Modo geométrico activo (Sprites faltantes)`;
  }



  abandonarPartida() {
    if (confirm("¿Seguro que quieres abandonar la partida?")) {
        if (this.esHost && this.mpActivo) {
            this.enviarMultiplayer({ tipo: 'host_migration_trigger', reason: 'host_abandoned' });
        }
        this.detenerMotorJuego();
        this.detenerIntervalosHttp();
        this.detenerIntervalosFirebase();
        this.detenerAutoAdmision();
        this.detenerPresencia();
        this.detenerVigilanciaHost();
        void this.coordinador?.salirJugador(this.connId);
        this.network.desconectarPeers();
        if (this.networkHttp) this.networkHttp.desconectar();
        this.signaling?.desconectar();
        this.vaciarEspejoCasa();
        // El ex-host vuelve como invitado: si reanuda, no crea una segunda autoridad.
        if (this.esHost && this.mpActivo) this.marcarSesionComoInvitado();
        window.location.reload();
    }
  }

  actualizarPanelAcciones() {
      const btnWhirlwind = document.getElementById('btnWhirlwindAction');
      const btnBow = document.getElementById('btnBowAction');
      const btnFood = document.getElementById('btnCreateFoodAction');
      const btnRadar = document.getElementById('btnRadarAction');
      const btnFreeze = document.getElementById('btnFreezeAction');
      const btnFireball = document.getElementById('btnFireballAction');
      const btnGuard = document.getElementById('btnGuardAction');
      const btnRestart = document.getElementById('btnRestartAction');
      const btnTeleportHousing = document.getElementById('btnTeleportHousing');
      const btnTeleportCostura = document.getElementById('btnTeleportCostura');
      const btnInvitarCoop = document.getElementById('btnInvitarCoop');
      const btnBotin = document.getElementById('btnBotinAction');

      if (btnWhirlwind) btnWhirlwind.style.display = this.protagonista.clase === 'guerrero' ? 'block' : 'none';
      if (btnFireball) btnFireball.style.display = (this.protagonista.clase === 'mago' || this.protagonista.clase === 'guerrero') ? 'block' : 'none';
      if (btnFreeze) btnFreeze.style.display = this.protagonista.clase === 'mago' ? 'block' : 'none';
      if (btnBow) btnBow.style.display = this.protagonista.clase === 'explorador' ? 'block' : 'none';
      if (btnFood) btnFood.style.display = this.protagonista.clase === 'mago' ? 'block' : 'none';
      if (btnRadar) btnRadar.style.display = this.protagonista.clase === 'explorador' ? 'block' : 'none';
      if (btnGuard) btnGuard.style.display = this.config.vistaDebugActivada ? 'block' : 'none';
      if (btnBotin) btnBotin.style.display = this.config.vistaDebugActivada ? 'block' : 'none';
      if (btnRestart) btnRestart.style.display = this.config.vistaDebugActivada ? 'block' : 'none';
      if (btnTeleportHousing) {
        const enCasa = this.nodoActivo?.tipo === 'personal';
        btnTeleportHousing.style.display = this.config.vistaDebugActivada ? 'block' : 'none';
        btnTeleportHousing.innerHTML = enCasa
          ? '🏠 AL MAPA<div class="cooldown-overlay"></div>'
          : '🏠 A MI CASA<div class="cooldown-overlay"></div>';
      }
      if (btnInvitarCoop) {
        btnInvitarCoop.style.display = this.esHost && this.modoMultijugador === 'manual' ? 'block' : 'none';
      }
      if (btnTeleportCostura) {
        const costura = this.costuraDelNodoActivo();
        const visible = this.config.vistaDebugActivada && this.esLadoAutoritativo() && costura !== null;
        btnTeleportCostura.style.display = visible ? 'block' : 'none';
        btnTeleportCostura.innerHTML = costura
          ? `🧵 ${costura.lado === 'este' ? '→' : costura.lado === 'oeste' ? '←' : costura.lado === 'sur' ? '↓' : '↑'}<div class="cooldown-overlay"></div>`
          : '🧵 COSTURA<div class="cooldown-overlay"></div>';
      }
  }

  /** Costura continua con origen en el nodo activo (para el botón DEBUG). */
  private costuraDelNodoActivo(): ConectorMundo | null {
    const activoId = this.gestorMundo.nodoActivoId;
    if (!activoId) return null;
    let primera: ConectorMundo | null = null;
    for (const conector of this.gestorMundo.conectores.values()) {
      if (!conector.lado || conector.nodoOrigenId !== activoId) continue;
      // En una cadena hay ida (este) y vuelta (oeste); el atajo debe avanzar.
      if (conector.lado === 'este') return conector;
      if (!primera) primera = conector;
    }
    return primera;
  }

  /** DEBUG: coloca al protagonista en la celda de la costura para probar el cruce. */
  teleportCosturaDebug(): void {
    if (!this.esLadoAutoritativo()) {
      this.registrarEventoLog('La costura solo se puede probar en host/solo.');
      return;
    }
    const conector = this.costuraDelNodoActivo();
    if (!conector) {
      this.registrarEventoLog('No hay costura continua desde este nodo.');
      return;
    }
    this.protagonista.fila = conector.filaO;
    this.protagonista.columna = conector.columnaO;
    this.protagonista.visualFila = conector.filaO;
    this.protagonista.visualColumna = conector.columnaO;
    const tecla = conector.lado === 'este'
      ? '→ / D'
      : conector.lado === 'oeste'
        ? '← / A'
        : conector.lado === 'sur'
          ? '↓ / S'
          : '↑ / W';
    this.registrarEventoLog(`Costura ${conector.lado}: en (${conector.filaO},${conector.columnaO}). Pulsa ${tecla} para cruzar.`);
  }

  generarQR() {
    const baseUrl = window.location.origin + window.location.pathname;
    const roomId = this.network.idPartidaActual;
    const url = roomId ? `${baseUrl}?room=${roomId}` : baseUrl;

    const qrImage = document.getElementById('qrImage') as HTMLImageElement;
    const qrContainer = document.getElementById('qrContainer');

    if (qrImage && qrContainer) {
        // Usar API pública de QR
        qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`;
        qrContainer.style.display = 'block';
        this.registrarEventoLog("QR Generado para la sesión.");
    }
  }

  registrarEventoLog(mensaje: string) {
    const texto = `[${new Date().toLocaleTimeString()}] ${mensaje}`;
    this.colaDeMensajes.unshift(texto);
    if (this.colaDeMensajes.length > 5) this.colaDeMensajes.pop();
    console.log(mensaje);
  }

  /** Muestra un aviso visible en el front (banner superior). */
  mostrarAvisoFirebase(texto: string): void {
    const el = document.getElementById('firebaseError');
    if (!el) return;
    el.textContent = texto;
    el.style.display = 'block';
    window.setTimeout(() => { el.style.display = 'none'; }, 8000);
  }

  guardarSesion(rol: string, roomId: string | null = null) {
    localStorage.setItem('mazeRPG_lastSession', JSON.stringify({
        roomId,
        rol,
        modo: this.modoMultijugador,
        playerId: this.playerId,
        name: this.protagonista.nombre,
        class: this.protagonista.clase,
        color: this.protagonista.color,
        avatar: this.protagonista.apariencia,
        inventario: this.protagonista.exportarInventario(),
        diff: this.config.dificultad
    }));
  }

  /** Cambia el rol guardado a invitado antes de recargar (ex-host que abandona). */
  private marcarSesionComoInvitado(): void {
    const dataStr = localStorage.getItem('mazeRPG_lastSession');
    if (!dataStr) return;
    try {
      const data = JSON.parse(dataStr);
      if (!data?.roomId) return;
      data.rol = 'guest';
      localStorage.setItem('mazeRPG_lastSession', JSON.stringify(data));
    } catch { /* sesión corrupta: no se toca */ }
  }

  /** Re-guarda la sesión actual (si existe) preservando rol/roomId — al cambiar equipo/mochila. */
  private guardarSesionActual(): void {
    const dataStr = localStorage.getItem('mazeRPG_lastSession');
    if (!dataStr) return;
    try {
      const d = JSON.parse(dataStr);
      this.guardarSesion(d.rol, d.roomId ?? null);
    } catch { /* sesión corrupta: no re-guarda */ }
  }

  async reanudarPartida() {
    const dataStr = localStorage.getItem('mazeRPG_lastSession');
    if (!dataStr) return;
    const data = JSON.parse(dataStr);

    this.protagonista.nombre = data.name;
    this.protagonista.clase = data.class;
    this.protagonista.color = data.color;
    this.protagonista.apariencia = sanearApariencia(data.avatar, data.class || 'guerrero');
    this.protagonista.importarInventario(data.inventario);
    this.config.dificultad = data.diff || 'medio';
    this.protagonista.personajeCreado = true;
    (document.getElementById('nickInput') as HTMLInputElement).value = this.protagonista.nombre;

    const modo: 'firebase' | 'http' = data.modo === 'http' ? 'http' : 'firebase';
    this.modoMultijugador = modo;
    if (modo === 'http') this.iniciarModoHttp();

    if (data.rol === 'solo') {
        this.empezarSolo();
    } else if (data.rol === 'host' && data.roomId) {
        await this.reanudarComoHost(data.roomId, modo);
    } else if (data.rol === 'host') {
        // roomId inválido o vacío: caer a modo solo
        this.registrarEventoLog('Sesión host guardada sin roomId válido; iniciando en modo solo.');
        this.empezarSolo();
    } else if (data.rol === 'guest' && data.roomId) {
        if (modo === 'http') await this.unirseAPartidaHttp(data.roomId);
        else await this.unirseAPartidaFirestore(data.roomId);
    }
  }

  /**
   * Reanudación del ex-host: si otro host sigue vivo entra como invitado; si no
   * hay host, intenta reclamar el CAS. Nunca crea una segunda autoridad.
   */
  private async reanudarComoHost(roomId: string, modo: 'firebase' | 'http'): Promise<void> {
    let epoch = 1;
    if (modo === 'http' && this.networkHttp) {
      this.networkHttp.idPartidaActual = roomId;
      this.crearCoordinadorHttp(roomId);
    } else {
      this.network.idPartidaActual = roomId;
      this.crearCoordinadorFirebase(roomId);
    }

    const estado = await this.coordinador?.leerEstado();
    if (estado) {
      epoch = estado.hostEpoch;
      if (estado.hostId !== this.connId) {
        const esMiHostAnterior = !!estado.hostPlayerId && estado.hostPlayerId === this.playerId;
        if (!esMiHostAnterior && hostVivo(estado, Date.now())) {
          this.registrarEventoLog('La partida ya tiene Host; entrando como invitado.');
          this.guardarSesion('guest', roomId);
          if (modo === 'http') await this.unirseAPartidaHttp(roomId);
          else await this.unirseAPartidaFirestore(roomId);
          return;
        }
        const res = await this.coordinador?.reclamarHost(
          this.connId, this.protagonista.nombre, this.playerId, estado.hostEpoch,
        );
        if (!res?.ok) {
          this.registrarEventoLog('Otro jugador reclamó el host; entrando como invitado.');
          this.guardarSesion('guest', roomId);
          if (modo === 'http') await this.unirseAPartidaHttp(roomId);
          else await this.unirseAPartidaFirestore(roomId);
          return;
        }
        epoch = res.epoch;
      }
    } else {
      this.registrarEventoLog('No hay estado de sala; reanudando como Host (compatibilidad).');
    }

    await this.resumirComoHost(roomId, modo, epoch);
  }

  private async resumirComoHost(roomId: string, modo: 'firebase' | 'http', epoch: number): Promise<void> {
    this.esHost = true;
    this.hostEpoch = epoch;
    this.hostNick = this.protagonista.nombre;
    this.hostConocidoId = this.connId;
    this.network.esHost = true;
    this.network.hostEpoch = epoch;
    this.network.idPartidaActual = modo === 'firebase' ? roomId : this.network.idPartidaActual;

    const hc = document.getElementById('hostControls');
    if (hc) hc.style.display = 'flex';

    if (modo === 'http' && this.networkHttp) {
      this.networkHttp.esHost = true;
      this.networkHttp.hostEpoch = epoch;
      this.networkHttp.multiplayerActivo = true;
      this.networkHttp.idPartidaActual = roomId;
      this.configurarIntervalosHostHttp();
    } else {
      this.persistenciaMundo = this.firebase.crearPersistenciaMundo(roomId);
      this.configurarIntervalosHost();
    }

    await this.adoptarMetadatosHost();
    this.iniciarPresencia();
    this.iniciarVigilanciaHost();
    this.iniciarAutoAdmision();
    this.actualizarIndicadorHost();
    this.guardarSesion('host', roomId);

    const roomDisp = document.getElementById('roomDisplay');
    const roomIdVal = document.getElementById('roomIdVal');
    if (roomDisp && roomIdVal) {
        roomDisp.style.display = 'block';
        roomIdVal.textContent = roomId;
    }

    this.ui.ocultarLobby();
    await this.prepararMundo();
    this.iniciarMotorJuego();
  }

  private iniciarDiagnostico() {
    if (this.diagTimer !== null) return;
    this.diagLastLog = Date.now();
    this.diagFrameCount = 0;
    this.diagTimer = window.setInterval(() => {
      const ahora = Date.now();
      const fps = this.diagFrameCount / ((ahora - this.diagLastLog) / 1000);
      console.log(`[DIAG] FPS:${fps.toFixed(1)} ` +
        `cola:${this.colaAcciones.length} bolas:${this.bolasDeFuego.length} ` +
        `radar:${this.radares.length} whirl:${this.whirlwinds.length} ` +
        `freeze:${this.freezes.length} enem:${this.listaDeEnemigos.filter((e:any) => e.estaVivo).length}/${this.listaDeEnemigos.length} ` +
        `rem:${this.remotosActivos.size} ` +
        `pause:${this.juegoPausado} host:${this.esHost} mp:${(this.network?.multiplayerActivo || this.networkHttp?.multiplayerActivo) ?? false} ` +
        `mpHttp:${this.networkHttp?.multiplayerActivo ?? false} idLocal:${this.idLocalActivo}`);
      this.diagFrameCount = 0;
      this.diagLastLog = ahora;
    }, 10000);
  }

  private esLadoAutoritativo(): boolean {
    return esLadoAutoritativo({
      modo: this.modoMultijugador,
      esHost: this.esHost,
      firebaseMpActivo: this.network?.multiplayerActivo ?? false,
      httpMpActivo: this.networkHttp?.multiplayerActivo ?? false,
    });
  }

  /** Dimensiones reales del nodo activo (puede ser menor que el mundo, p.ej. la casa). */
  private dimsActivo(): { filas: number; columnas: number } {
    const celdas = this.mapaLaberinto;
    return { filas: celdas.length, columnas: celdas.length > 0 ? celdas[0].length : 0 };
  }

  /** Defensa de rejilla activa: ¿la celda (f,c) existe en el nodo renderizado? Cubre fuera de rango y negativos. */
  private fueraDeRejillaActiva(f: number, c: number): boolean {
    const fila = this.mapaLaberinto[f];
    return fila === undefined || fila[c] === undefined;
  }

  /** True si hay una casa guardada y el arranque debe preguntar al usuario. */
  hayHousingPrevio(): boolean {
    return this.esLadoAutoritativo() && this.housing.hayCasaGuardada();
  }

  /** Registra la decisión del modal de housing (usar la casa o crear una nueva). */
  resolverHousingPrevio(usar: boolean): void {
    this.housingDecision = usar ? 'usar' : 'nueva';
  }

  iniciarMotorJuego() {
    if (this.motorIniciado) return;
    this.motorIniciado = true;
    if (this.inicioPartidaPreservado !== null) {
      this.inicioPartida = this.inicioPartidaPreservado;
      this.inicioPartidaPreservado = null;
    } else {
      this.inicioPartida = Date.now();
    }
    this.resultados = [];
    this.esperaInfo = null;
    this.roster = null;
    this.juegoTerminado = false;
    // Quita el overlay de "conectando" (p. ej. el invitado ya tiene el canal P2P).
    this.lobbyManager.hideConnecting();
    this.ui.ocultarLobby();
    this.iniciarDiagnostico();

    // Mostrar menús
    document.getElementById('topMenu')!.style.display = 'block';
    document.getElementById('actionsMenu')!.style.display = 'block';
    this.aplicarEsquemaUI();
    this.actualizarIndicadorHost();
    // F4a: fijar los radios base (dispositivo/clase) antes de asustar monstruos
    // y del primer render; el game loop los reajustará cada segundo.
    this.actualizarInteres(performance.now());

    if (this.esLadoAutoritativo()) {
        if (!this.gestorMundo.nodoActivoId) {
            this.gestorMundo.crearMundoInicial(this.crearGenRaiz(), this.config.NUMERO_FILAS, this.config.NUMERO_COLUMNAS);
        }
        const pos = this.obtenerPosicionInicioAleatoria();
        this.protagonista.fila = pos.f;
        this.protagonista.columna = pos.c;
        this.asustarMonstruosCercanos(pos.f, pos.c);
        this.sembrarMundoBase();
        if (this.nodoActivo?.tipo === 'mazmorra') {
            const salida = elegirCeldaLejos(
                this.mapaLaberinto,
                { fila: this.protagonista.fila, columna: this.protagonista.columna },
                15,
            ) ?? elegirCeldaLejos(
                this.mapaLaberinto,
                { fila: this.protagonista.fila, columna: this.protagonista.columna },
                0,
            );
            if (salida) this.mapaLaberinto[salida.fila][salida.columna].esSalida = true;
        }
        this.generarEnemigos();
        if (!this.mundoCargado) {
            this.generarEscenarioDinamicoDemo();
        }
    }
    this.marcarNodoDescubierto(this.gestorMundo.nodoActivoId);
    this.ultimoFrameTime = performance.now();
    this.fpsBajoContador = 0;
    this.cicloDeJuego();
  }

  /**
   * Dock de acciones uniforme en todos los dispositivos (decisión 2026-10-21):
   * se abandona el acordeón inferior; el mismo nodo se monta siempre en el dock.
   */
  aplicarEsquemaUI(): void {
    const body = document.body;
    body.classList.remove('esquema-acordeon', 'esquema-acordeon-movil', 'dock-collapsed');
    body.classList.add('esquema-dock');

    const contenido = document.querySelector('.actions-content');
    const actionsMenu = document.getElementById('actionsMenu');
    const dock = document.getElementById('actionDock');
    if (contenido && dock && contenido.parentElement !== dock) {
      dock.appendChild(contenido);
    }
    if (dock) dock.style.display = 'flex';
    if (actionsMenu) {
      actionsMenu.classList.remove('visible');
      actionsMenu.style.display = 'none';
    }
    this.ajustarDimensiones();
  }

  /** Pinta/actualiza el badge de tecla en cada botón de acción (spec-2 §5). */
  refrescarBadgesTeclado(): void {
    const botones: Record<IdAccion, string> = {
      whirlwind: 'btnWhirlwindAction',
      fireball: 'btnFireballAction',
      freeze: 'btnFreezeAction',
      bow: 'btnBowAction',
      create_food: 'btnCreateFoodAction',
      radar: 'btnRadarAction',
      equipo: 'btnEquipoAction',
    };
    for (const [accion, id] of Object.entries(botones) as [IdAccion, string][]) {
      const btn = document.getElementById(id);
      if (!btn) continue;
      let badge = btn.querySelector<HTMLElement>('.key-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'key-badge';
        btn.appendChild(badge);
      }
      badge.textContent = this.keybinds[accion];
    }
  }

  private etiquetaAccion(accion: IdAccion): string {
    const etiquetas: Record<IdAccion, string> = {
      whirlwind: 'GOLPE GIRO',
      fireball: 'BOLA FUEGO',
      freeze: 'CONGELAR',
      bow: 'DISPARO ARCO',
      create_food: 'CREAR COMIDA',
      radar: 'RADAR',
      equipo: 'EQUIPO',
    };
    return etiquetas[accion];
  }

  /** Abre el panel ASIGNAR TECLAS (una fila por acción, spec-2 §4). */
  abrirPanelKeybinds(): void {
    const contenido = document.getElementById('keybindsContent');
    if (!contenido) return;
    contenido.innerHTML = '';
    for (const accion of ACCIONES_VALIDAS) {
      const fila = document.createElement('div');
      fila.className = 'keybind-row';
      const nombre = document.createElement('span');
      nombre.className = 'keybind-nombre';
      nombre.textContent = this.etiquetaAccion(accion);
      const tecla = document.createElement('span');
      tecla.className = 'keybind-tecla';
      tecla.id = `keybind-tecla-${accion}`;
      tecla.textContent = this.keybinds[accion];
      const btn = document.createElement('button');
      btn.className = 'keybind-cambiar';
      btn.textContent = 'CAMBIAR';
      btn.addEventListener('click', () => this.iniciarCapturaTecla(accion, tecla));
      fila.appendChild(nombre);
      fila.appendChild(tecla);
      fila.appendChild(btn);
      contenido.appendChild(fila);
    }
    document.getElementById('keybindsModal')!.style.display = 'flex';
  }

  /** Espera la siguiente pulsación y la asigna a la acción (Escape cancela). */
  private iniciarCapturaTecla(accion: IdAccion, teclaEl: HTMLElement): void {
    if (this.capturandoTecla) return;
    this.capturandoTecla = true;
    teclaEl.textContent = '...';
    const escucharCaptura = (ev: KeyboardEvent) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      window.removeEventListener('keydown', escucharCaptura, true);
      this.capturandoTecla = false;
      if (ev.key === 'Escape') {
        teclaEl.textContent = this.keybinds[accion];
        return;
      }
      const tecla = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
      const r = asignarTecla(this.keybinds, accion, tecla);
      if (!r.ok) {
        teclaEl.textContent = this.keybinds[accion];
        const causa = r.motivo === 'en-uso' ? `ya la usa ${r.conflicto}` : 'está reservada';
        this.registrarEventoLog(`Tecla '${tecla}' ${causa}`);
        this.mostrarAvisoFirebase(`Tecla '${tecla}' ${causa}`);
        return;
      }
      this.keybinds = r.mapa;
      guardarKeybinds(this.keybinds, (valor) => localStorage.setItem('mazerpg.ui.keybinds', valor));
      teclaEl.textContent = tecla;
      this.refrescarBadgesTeclado();
      this.registrarEventoLog(`Tecla de ${this.etiquetaAccion(accion)} ahora es '${tecla}'`);
    };
    window.addEventListener('keydown', escucharCaptura, true);
  }

  private sembrarMundoBase(): void {
    // Solo el lado autoritativo (host/solo/manual) crea el árbol y el housing;
    // los guests reciben el mapa serializado del host y usan el portal clásico.
    if (!this.esLadoAutoritativo()) return;
    if (!this.gestorMundo.nodoActivoId) return;
    if (this.gestorMundo.conectores.size > 0) {
      // Mundo ya sembrado (reapertura): asegurar la cadena F4b si falta.
      this.asegurarCadenaZonas();
      return;
    }

    // Decisión del modal "Housing encontrado": reutilizar la casa guardada o descartarla.
    let casaPrevia: NodoMundo | null = null;
    if (this.housingDecision === 'usar') {
      casaPrevia = this.housing.cargarCasaPrevia();
    } else if (this.housingDecision === 'nueva') {
      // CREAR UNA NUEVA: la casa descartada también suelta su historia en el espejo local.
      const previa = this.housing.cargarCasaPrevia();
      if (previa) this.espejo.borrarDoc(previa.id);
      this.housing.descartarCasasGuardadas();
    }
    this.housingDecision = null;

    const sembrado = sembrarMundoBase({
      gestor: this.gestorMundo,
      housing: this.housing,
      idLocal: this.idLocalActivo,
      filas: this.config.NUMERO_FILAS,
      columnas: this.config.NUMERO_COLUMNAS,
      casaPrevia,
    });
    if (sembrado) {
      // Casa duradera (Solo): si el espejo local guarda historia de esta casa, la
      // cava/el muebles/el escenario se rehidratan sobre la casa adoptada (sin
      // regenerar); las celdas del nodo son las mismas que renderiza al entrar.
      this.idCasaEspejo = sembrado.casa.id;
      const doc = this.espejo.cargarDoc(sembrado.casa.id);
      if (doc) rehidratarHistoria(sembrado.casa.celdas, doc);
      this.registrarEventoLog(
        'Mundo conectado: salida a zona y portal de casa personal registrados.',
      );
      this.asegurarCadenaZonas(sembrado.nodoHijo);
    }
  }

  /** F4b: completa la cadena de zonas east (zona-abierto-2..4) si falta. */
  private asegurarCadenaZonas(zona1?: NodoMundo): void {
    const inicio = zona1 ?? this.gestorMundo.mundo.get('zona-abierto-1');
    if (!inicio) return;
    const creadas = sembrarCadenaZonas(this.gestorMundo, inicio, 3, { filas: 40, columnas: 40 });
    if (creadas.length > 0) {
      this.registrarEventoLog(`Cadena de zonas: ${creadas.map((n) => n.id).join(', ')}.`);
    }
  }

  private crearGenRaiz(): GenSpec {
    return { nombre: 'mazmorra', version: 1, seed: Date.now() >>> 0, params: {} };
  }

  private async prepararMundo(): Promise<void> {
    try {
      const resultado = await arrancarMundoGestor({
        gestor: this.gestorMundo,
        persistencia: this.persistenciaMundo,
        filas: this.config.NUMERO_FILAS,
        columnas: this.config.NUMERO_COLUMNAS,
        genPorDefecto: this.crearGenRaiz(),
      });
      this.mundoCargado = resultado.cargado;
    } catch (e) {
      console.warn('No se pudo cargar el mundo persistido; se genera uno nuevo.', e);
      this.mundoCargado = false;
      if (!this.gestorMundo.nodoActivoId) {
        this.gestorMundo.crearMundoInicial(this.crearGenRaiz(), this.config.NUMERO_FILAS, this.config.NUMERO_COLUMNAS);
      }
    }
  }

  setupEntity(entity: any) {
    entity.onDamageReceived = (amount: number, e: any) => {
        const color = (e instanceof EnemigoNPC) ? "#00ff00" : "#ff0000";
        this.ui.crearTextoFlotanteEnCelda(e.fila, e.columna, `-${amount}`, color, this);

        if (e instanceof EnemigoNPC && this.mpActivo) {
            if (this.esHost) {
                this.enviarMultiplayer({
                    tipo: 'npc_update',
                    id: e.id,
                    f: e.fila,
                    c: e.columna,
                    v: e.vidaActual
                });
            } else {
                this.enviarMultiplayer({
                    tipo: 'npc_damaged_by_guest',
                    id: e.id,
                    dano: amount
                });
            }
        }

        if (e instanceof JugadorRemoto && this.esHost && this.mpActivo) {
            this.enviarMultiplayer({
                tipo: 'hp_loss',
                id: e.id,
                amount: amount
            });
        }
    };
  }

  manejarTap(clientX: number, clientY: number) {
    if (this.juegoTerminado || !this.protagonista) return;
    const canvas = document.getElementById('mazeCanvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const centroX = canvas.width / 2;
    const centroY = this.config.ALTO_UI_TOP + (this.config.CELDAS_VISIBLES_Y * this.config.TAMANO_CELDA) / 2;

    const dx = x - centroX;
    const dy = y - centroY;

    let deltaFila = 0;
    let deltaColumna = 0;

    if (Math.abs(dx) > Math.abs(dy)) {
        deltaColumna = dx > 0 ? 1 : -1;
    } else {
        deltaFila = dy > 0 ? 1 : -1;
    }

    const haMovido = this.protagonista.intentarMover(deltaFila, deltaColumna, this);
    if (haMovido) {
        this.comprobarSalida();
        setTimeout(() => {
            if (this.protagonista) this.protagonista.estaCaminando = false;
        }, 150);
    }
  }

  generarEnemigos() {
    const tipos = ["Esqueleto", "Orco", "Goblin", "Minotauro"];
    let cantidad = ENEMIGOS_BASE;
    if (this.config.dificultad === 'facil' || this.config.dificultad === 'medio') {
        cantidad = Math.floor(cantidad * 0.75);
    } else if (this.config.dificultad === 'locura') {
        cantidad = Math.floor(cantidad * 1.75);
    }

    for (let i = 0; i < cantidad; i++) {
        let f, c;
        let s = 0;
        const dims = this.dimsActivo();
        do {
            f = Math.floor(Math.random() * dims.filas);
            c = Math.floor(Math.random() * dims.columnas);
            s++;
        } while (((f < 5 && c < 5) || !this.mapaLaberinto[f][c].esTransitable || this.mapaLaberinto[f][c].esSalida) && s < 1000);
        const t = tipos[i % tipos.length];
        const e = new EnemigoNPC(f, c, t, t, i, this.config.dificultad);
        this.setupEntity(e);
        this.listaDeEnemigos.push(e);
    }

    // F3: un Balrog por mazmorra, lejos del punto de entrada.
    if (this.nodoActivo?.tipo === 'mazmorra') {
        const pos = elegirCeldaLejos(
            this.mapaLaberinto,
            { fila: this.protagonista.fila, columna: this.protagonista.columna },
            20,
        );
        if (pos) {
            const boss = new EnemigoNPC(pos.fila, pos.columna, 'Balrog', 'Balrog', 1000, this.config.dificultad);
            this.setupEntity(boss);
            this.listaDeEnemigos.push(boss);
        }
    }
  }

  obtenerPosicionInicioAleatoria(): {f: number, c: number} {
    const dims = this.dimsActivo();
    if (dims.filas === 0 || dims.columnas === 0) return { f: 0, c: 0 };
    let f = 0, c = 0;
    let valid = false;
    let attempts = 0;
    // Preferir una celda transitable lejos del extremo inferior-derecho del nodo.
    while (!valid && attempts < 1000) {
        f = Math.floor(Math.random() * dims.filas);
        c = Math.floor(Math.random() * dims.columnas);
        const dist = Math.abs(f - (dims.filas - 1)) + Math.abs(c - (dims.columnas - 1));
        if (this.mapaLaberinto[f][c].esTransitable && dist > Math.max(15, Math.floor((dims.filas + dims.columnas) / 4))) {
            valid = true;
        }
        attempts++;
    }
    if (!valid) {
        // Nodo pequeño (p.ej. la casa): caer a la primera celda transitable disponible.
        for (let ff = 0; ff < dims.filas && !valid; ff++) {
            for (let cc = 0; cc < dims.columnas; cc++) {
                if (this.mapaLaberinto[ff][cc].esTransitable) {
                    f = ff; c = cc; valid = true; break;
                }
            }
        }
    }
    return { f, c };
  }

  respawnPlayer() {
    const pos = this.obtenerPosicionInicioAleatoria();
    this.protagonista.fila = pos.f;
    this.protagonista.columna = pos.c;
    this.asustarMonstruosCercanos(pos.f, pos.c);
    this.protagonista.vidaActual = this.protagonista.vidaMaxima;
    this.protagonista.estaVivo = true;
    this.protagonista.estadoActual = 'idle';
    this.protagonista.frameActual = 0;
    this.protagonista.ultimaActualizacionFrame = 0;
    this.protagonista.estadoExpira = 0;
    this.protagonista.estaCaminando = false;
    this.protagonista.enCombateCon = null;
    this.protagonista.puntosExperiencia = 0;
    this.juegoTerminado = false;
    document.getElementById('endGameUI')!.style.display = 'none';
    const xpVal = document.getElementById('xpVal');
    if (xpVal) xpVal.textContent = "0";
    this.registrarEventoLog("Has renacido en el inicio.");

    this.enviarMultiplayer({
        tipo: 'posicion',
        f: this.protagonista.fila,
        c: this.protagonista.columna,
        cam: false,
        id: this.idLocalActivo,
        nick: this.protagonista.nombre,
        hp: this.protagonista.vidaActual,
        maxHp: this.protagonista.vidaMaxima,
        est: this.protagonista.estadoActual,
        fr: this.protagonista.frameActual,
        oro: this.protagonista.inventario.oro ?? 0,
        xp: this.protagonista.puntosExperiencia,
        bajas: this.protagonista.bajas,
    });
  }

  /** F4a: detecta el dispositivo por viewport/pointer (la clase esquema-* ya no distingue móvil). */
  private dispositivoActual(): Dispositivo {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'pc';
    if (window.matchMedia('(max-width: 600px)').matches) return 'movil';
    if (window.matchMedia('(max-width: 1024px)').matches || window.matchMedia('(pointer: coarse)').matches) return 'tablet';
    return 'pc';
  }

  /** F4a: EMA de FPS y temporizadores para la histéresis del interés. */
  private actualizarMetricasInteres(delta: number, fps: number): void {
    if (!Number.isFinite(delta) || delta <= 0 || delta > 1000) {
      this.fpsBajoMs = 0;
      this.fpsAltoMs = 0;
      return;
    }
    if (Number.isFinite(fps) && fps > 0) {
      this.fpsEma = this.fpsEma * 0.9 + fps * 0.1;
    }
    if (fps < 30) {
      this.fpsBajoMs += delta;
      this.fpsAltoMs = 0;
    } else if (fps >= 50) {
      this.fpsAltoMs += delta;
      this.fpsBajoMs = 0;
    } else {
      this.fpsBajoMs = 0;
      this.fpsAltoMs = 0;
    }
  }

  /** F4a: recalcula radioSim/radioVis como máximo una vez por segundo. */
  private actualizarInteres(ahora: number): void {
    if (ahora - this.ultimaActualizacionInteres < 1000) return;
    this.ultimaActualizacionInteres = ahora;

    const dispositivo = this.dispositivoActual();
    const jugadores = 1 + this.remotosActivos.size;
    const anterior = this.interesActual
      ? { radioSim: this.interesActual.radioSim, radioVis: this.interesActual.radioVis }
      : null;
    const radios = calcularRadiosInteres({
      dispositivo,
      clase: this.protagonista.clase,
      jugadores,
      fps: this.fpsEma,
      fpsBajoMs: this.fpsBajoMs,
      fpsAltoMs: this.fpsAltoMs,
      anterior,
    });
    const cambio = !anterior || radios.radioSim !== anterior.radioSim || radios.radioVis !== anterior.radioVis;
    if (cambio) {
      if (anterior) {
        if (this.fpsBajoMs >= 2000 && (radios.radioSim < anterior.radioSim || radios.radioVis < anterior.radioVis)) {
          this.fpsBajoMs = 0;
        }
        if (this.fpsAltoMs >= 5000 && (radios.radioSim > anterior.radioSim || radios.radioVis > anterior.radioVis)) {
          this.fpsAltoMs = 0;
        }
        this.registrarEventoLog(`[interés] ${dispositivo} vis ${anterior.radioVis}→${radios.radioVis} sim ${anterior.radioSim}→${radios.radioSim} (fps ${this.fpsEma.toFixed(0)}, jugadores ${jugadores})`);
      }
      this.config.radioSim = radios.radioSim;
      this.config.radioVis = radios.radioVis;
    }
    this.interesActual = { ...radios, dispositivo, fps: this.fpsEma, jugadores };
  }

  cicloDeJuego() {
    this.diagFrameCount++;
    const ahora = performance.now();
    if (this.ultimoFrameTime > 0) {
      const delta = ahora - this.ultimoFrameTime;
      const fps = 1000 / delta;
      this.actualizarMetricasInteres(delta, fps);
      
      if (this.config.vistaDebugActivada) {
        const fpsDisplay = document.getElementById('fpsDisplay');
        if (fpsDisplay) {
          fpsDisplay.style.display = 'block';
          fpsDisplay.textContent = `FPS: ${fps.toFixed(1)}`;
          fpsDisplay.style.color = fps < this.FPS_MINIMO ? '#ff4444' : '#0f0';
        }
      } else {
        const fpsDisplay = document.getElementById('fpsDisplay');
        if (fpsDisplay) fpsDisplay.style.display = 'none';
      }
      
      if (fps < this.FPS_MINIMO) {
        if (delta > 1000) {
          this.fpsBajoContador = 0;
        } else {
          this.fpsBajoContador += delta / 1000;
        }
        if (this.fpsBajoContador >= this.FPS_UMBRAL_SEGUNDOS && !this.mpActivo) {
          this.registrarEventoLog(`⚠️ FPS bajo detectado (${fps.toFixed(1)}). Pausando automáticamente.`);
          this.pausarJuego();
          return;
        }
      } else {
        this.fpsBajoContador = Math.max(0, this.fpsBajoContador - delta / 1000);
      }
    }
    this.ultimoFrameTime = ahora;
    this.actualizarInteres(ahora);

    this.actualizar();
    if (this.mapaAbierto && this.mapamundi && ahora - this.ultimoRefrescoMapa >= 500) {
      this.ultimoRefrescoMapa = ahora;
      this.mapamundi.actualizar(this.entradaMapa());
    }
    this.renderer.limpiar();
    const worldVisual = this.worldDesdeCeldaActiva(
      this.protagonista.visualFila,
      this.protagonista.visualColumna,
    );
    const offsetMundoObjetivo = this.renderer.obtenerOffsetCamaraMundo(worldVisual, this.config);
    const offsetMundo = this.aplicarTransicionCamara(offsetMundoObjetivo);
    const transformActivo = this.gestorMundo.nodoActivoId
      ? this.gestorMundo.transformAbsoluto(this.gestorMundo.nodoActivoId)
      : { df: 0, dc: 0 };
    // Offset local del nodo activo: entidades, niebla y UI flotante siguen
    // trabajando en coordenadas locales.
    const offset = {
      colOffset: offsetMundo.colOffset - transformActivo.dc,
      filaOffset: offsetMundo.filaOffset - transformActivo.df,
    };

    this.renderer.aplicarZoom(this.config);
    this.renderer.setPortalesHousingInactivos(this.portalesHousingInactivos());
    this.renderer.setPortalesHousing(this.idsPortalesHousing());
    // El invitado no tiene nodo propio en su gestor: el tema lo dicta el host
    // en el mensaje 'mapa' (si no, la casa se pintaba como mazmorra).
    const ambiente = !this.esHost && this.mpActivo && this.ambienteRemoto !== null
      ? this.ambienteRemoto
      : (this.nodoActivo?.tipo === 'personal' ? 'casa' : 'dungeon');
    this.renderer.setAmbiente(ambiente);

    let persistence = this.config.TIEMPO_DESVANECIMIENTO_NIEBLA;
    if (this.protagonista.clase === 'explorador') {
        persistence *= 1.5;
    }
    const mundoStreaming = this.nodosStreaming(offsetMundo);
    this.streamingActual = mundoStreaming.seleccion;
    this.renderer.aplicarNiveles(mundoStreaming.seleccion.niveles, mundoStreaming.candidatos);
    this.renderer.dibujarMundo(
      mundoStreaming.entradas,
      offsetMundo,
      this.config,
      this.dropsSuelo,
      this.gestorMundo.nodoActivoId || '__activo__',
      persistence,
    );
    this.renderer.dibujarViñeta(worldVisual.columna, worldVisual.fila, offsetMundo, this.config);

    // Actualizar estados de animación antes de dibujar
    this.protagonista.actualizarEstado();
    this.remotosActivos.forEach(j => { if (j.entidad) j.entidad.actualizarEstado(); });
    this.listaDeEnemigos.forEach(e => { if (e.estaVivo) e.actualizarEstado(); });

    // Renderizado de Entidades
    this.renderer.dibujarEntidad(this.protagonista, offset, this.config, this.mapaLaberinto);

    this.remotosActivos.forEach(j => {
        if (j.entidad) {
            this.renderer.dibujarEntidad(j.entidad, offset, this.config, this.mapaLaberinto);
        }
    });

    this.listaDeEnemigos.forEach(e => {
        if (e.estaVivo) {
            this.renderer.dibujarEntidad(e, offset, this.config, this.mapaLaberinto);
        }
    });

    this.ui.actualizarTextosFlotantes();
    this.ui.dibujarTextosFlotantes(this.renderer.getCtx());

    // Actualizar y dibujar bolas de fuego / proyectiles
    for (let i = this.bolasDeFuego.length - 1; i >= 0; i--) {
        const b = this.bolasDeFuego[i];
        b.pct += b.speed || 0.02;

        const curX = b.x + (b.targetX - b.x) * b.pct;
        const curY = b.y + (b.targetY - b.y) * b.pct;
        const f = Math.floor(curY);
        const c = Math.floor(curX);

        if (f >= 0 && f < this.mapaLaberinto.length && c >= 0 && c < (this.mapaLaberinto[f]?.length ?? 0)) {
            if (!this.mapaLaberinto[f][c].esTransitable) {
                this.registrarEventoLog("La bola de fuego impacta contra un muro.");
                this.bolasDeFuego.splice(i, 1);
                continue;
            }
        }

        if (b.pct >= 1) {
            if (b.targetRef && b.targetRef.estaVivo && b.aplicarDano) {
                let dmg = 0;
                for(let j=0; j<5; j++) dmg += Math.floor(Math.random()*10)+1;
                b.targetRef.recibirDano(dmg);
                this.registrarEventoLog(`¡Impacto de bola de fuego! -${dmg} HP`);
            }
            this.bolasDeFuego.splice(i, 1);
        } else {
            this.renderer.dibujarProyectil(b, offset, this.config);
        }
    }

    // Actualizar y dibujar radares
    const ahoraR = Date.now();
    for (let i = this.radares.length - 1; i >= 0; i--) {
        const r = this.radares[i];
        if (ahoraR - r.inicio > r.duracion) {
            this.radares.splice(i, 1);
        } else {
            this.renderer.dibujarRadar(r, offset, this.config, this.idLocalActivo);
        }
    }

    // Actualizar y dibujar whirlwinds
    for (let i = this.whirlwinds.length - 1; i >= 0; i--) {
        const w = this.whirlwinds[i];
        if (ahoraR - w.inicio > w.duracion) {
            this.whirlwinds.splice(i, 1);
        } else {
            this.renderer.dibujarWhirlwind(w, offset, this.config);
        }
    }

    // Actualizar y dibujar freezes
    for (let i = this.freezes.length - 1; i >= 0; i--) {
        const f = this.freezes[i];
        if (ahoraR - f.inicio > f.duracion) {
            this.freezes.splice(i, 1);
        } else {
            this.renderer.dibujarFreeze(f, offset, this.config);
        }
    }

    this.renderer.finalizarZoom();

    this.dibujarFundido();
    this.renderer.dibujarMarcadoresMovimiento(this.config);
    this.renderer.dibujarUI(this);

    this.gameLoopId = requestAnimationFrame(() => {
      try { this.cicloDeJuego(); }
      catch (e) { console.error('[CICLO] Error en game loop:', e, (e as Error).stack); this.gameLoopId = requestAnimationFrame(() => this.cicloDeJuego()); }
    });
  }

  private iniciarFundido(): void {
    this.fundidoInicio = performance.now();
  }

  private dibujarFundido(): void {
    const transcurrido = performance.now() - this.fundidoInicio;
    if (transcurrido < 0 || transcurrido > this.fundidoDuracion) return;
    const t = transcurrido / this.fundidoDuracion;
    const alpha = t < 0.5 ? t * 2 : (1 - t) * 2;
    const ctx = this.renderer.getCtx();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  detenerMotorJuego() {
    if (this.gameLoopId !== null) {
      cancelAnimationFrame(this.gameLoopId);
      this.gameLoopId = null;
    }
    this.motorIniciado = false;
  }

  pausarJuego() {
    if (this.juegoPausado || !this.motorIniciado) return;
    this.juegoPausado = true;
    if (this.gameLoopId !== null) {
      cancelAnimationFrame(this.gameLoopId);
      this.gameLoopId = null;
    }
    this.registrarEventoLog('⏸️ Juego pausado (pestaña en background)');
  }

  reanudarJuego() {
    if (!this.juegoPausado) return;
    this.juegoPausado = false;
    this.ultimoFrameTime = performance.now();
    this.fpsBajoContador = 0;
    this.cicloDeJuego();
    this.registrarEventoLog('▶️ Juego reanudado');
  }

  procesarTick() {
    while (this.colaAcciones.length > 0) {
        const item = this.colaAcciones.shift();
        this.resolverAccion(item.id, item.accion);
    }

    if (this.esHost) {
      this.listaDeEnemigos.forEach(e => (e as any).actualizarIA(this));
      this.enviarSnapshot();
      this.verificarFinPartida();
    } else if (this.mpActivo) {
      const ahora = Date.now();
      if (ahora - this.ultimoProgreso >= 1000) {
        this.ultimoProgreso = ahora;
        this.enviarMultiplayer({
          tipo: 'progreso',
          id: this.idLocalActivo,
          oro: this.protagonista.inventario.oro ?? 0,
          xp: this.protagonista.puntosExperiencia,
          bajas: this.protagonista.bajas,
        });
      }
    }
  }

  enviarSnapshot() {
    const snapshot: any = {
        tipo: 'snapshot',
        entities: []
    };

    snapshot.entities.push({
        id: this.idLocalActivo,
        f: this.protagonista.fila,
        c: this.protagonista.columna,
        v: this.protagonista.vidaActual,
        vm: this.protagonista.vidaMaxima,
        cam: this.protagonista.estaCaminando,
        viva: this.protagonista.estaVivo,
        nick: this.protagonista.nombre,
        clase: this.protagonista.clase,
        est: this.protagonista.estadoActual,
        fr: this.protagonista.frameActual
    });

    this.remotosActivos.forEach((j: any, id: string) => {
        if (j.entidad && id !== 'host') {
            snapshot.entities.push({
                id: id,
                f: j.entidad.fila,
                c: j.entidad.columna,
                v: j.entidad.vidaActual,
                vm: j.entidad.vidaMaxima,
                cam: j.entidad.estaCaminando,
                viva: j.entidad.estaVivo,
                nick: j.entidad.nombre,
                clase: j.entidad.clase,
                est: j.entidad.estadoActual,
                fr: j.entidad.frameActual
            });
        }
    });

    snapshot.entities.push(...this.listaDeEnemigos.map(e => ({
        id: (e as any).id,
        f: e.fila,
        c: e.columna,
        v: e.vidaActual,
        vm: e.vidaMaxima,
        viva: e.estaVivo,
        isNpc: true,
        est: e.estadoActual,
        fr: e.frameActual
    })));

    this.enviarMultiplayer(snapshot);
  }

  actualizar() {
    if (!this.protagonista) return;

    // Actualizar UI de estadísticas en el menú superior
    const hpStat = document.getElementById('hpStat');
    const fueStat = document.getElementById('fueStat');
    const agiStat = document.getElementById('agiStat');
    const intStat = document.getElementById('intStat');
    const xpStat = document.getElementById('xpStat');
    const oroStat = document.getElementById('oroStat');

    if (hpStat) hpStat.textContent = `${Math.floor(this.protagonista.vidaActual)}/${this.protagonista.vidaMaxima}`;
    if (fueStat) fueStat.textContent = this.protagonista.fuerza.toString();
    if (agiStat) agiStat.textContent = this.protagonista.agilidad.toString();
    if (intStat) intStat.textContent = this.protagonista.inteligencia.toString();
    if (xpStat) xpStat.textContent = this.protagonista.puntosExperiencia.toString();
    if (oroStat) oroStat.textContent = (this.protagonista.inventario.oro ?? 0).toString();

    const ahoraTick = Date.now();
        if (ahoraTick - this.ultimoTick >= this.config.tickRate) {
            this.procesarTick();
            this.ultimoTick = ahoraTick;
        }

    this.actualizarCooldownsUI();

    // Zoom progresivo
    if (this.config.zoom !== this.config.targetZoom) {
        const diff = this.config.targetZoom - this.config.zoom;
        if (Math.abs(diff) < 0.01) {
            this.config.zoom = this.config.targetZoom;
        } else {
            this.config.zoom += diff * 0.05;
        }
        this.ajustarDimensiones();
    }

    // Autozoom combate
    if (this.config.autoZoom) {
        if (this.protagonista.enCombateCon) {
            this.config.targetZoom = 3;
        } else {
            this.config.targetZoom = 1;
        }
        // Actualizar slider UI
        const slider = document.getElementById('zoomSlider') as HTMLInputElement;
        if (slider) slider.value = this.config.targetZoom.toString();
    }

    // Verificar UI de fin de juego
    const btnEmpezar = document.getElementById('btnEmpezar') as HTMLButtonElement;
    if (!this.protagonista.estaVivo || this.juegoTerminado) {
        if (document.getElementById('endGameUI')!.style.display !== 'flex') {
            const ui = document.getElementById('endGameUI')!;
            const title = document.getElementById('endGameTitle')!;
            const msg = document.getElementById('endGameMsg')!;
            const achievements = document.getElementById('achievements')!;

            ui.style.display = 'flex';
            if (!this.protagonista.estaVivo) {
                title.textContent = "HAS CAÍDO";
                title.style.color = "#ff4444";
                msg.textContent = "¿Quieres volver a intentarlo?";
                if (this.esHost && this.mpActivo) {
                    this.enviarMultiplayer({ tipo: 'host_migration_trigger', reason: 'death' });
                    this.iniciarEleccionHost();
                }
            } else {
                title.textContent = "¡VICTORIA!";
                title.style.color = "#28a745";
                msg.textContent = "¡Has escapado del laberinto!";
            }
            achievements.textContent = `Experiencia total: ${this.protagonista.puntosExperiencia} XP`;
        }
        if (btnEmpezar) btnEmpezar.disabled = false;
    } else {
        if (btnEmpezar) btnEmpezar.disabled = true;
    }

    if (this.juegoTerminado) return;

    if (!this.mpActivo && !this.esHost) {
        this.listaDeEnemigos.forEach(e => (e as any).actualizarIA(this));
    }

    const r = this.config.radioVis;

    this.marcarVisibilidadMundo(
      this.worldDesdeCeldaActiva(this.protagonista.fila, this.protagonista.columna),
      r,
    );
  }

  /** Marca visibilidad de mundo en todos los nodos cargados (fallback local en invitado). */
  private marcarVisibilidadMundo(world: { fila: number; columna: number }, radio: number): void {
    const ahora = Date.now();
    if (this.gestorMundo.mundo.size === 0 || !this.gestorMundo.nodoActivoId) {
      const dims = this.dimsActivo();
      for (let f = Math.max(0, this.protagonista.fila - Math.ceil(radio)); f <= Math.min(dims.filas - 1, this.protagonista.fila + Math.ceil(radio)); f++) {
        for (let c = Math.max(0, this.protagonista.columna - Math.ceil(radio)); c <= Math.min(dims.columnas - 1, this.protagonista.columna + Math.ceil(radio)); c++) {
          if (Math.hypot(f - this.protagonista.fila, c - this.protagonista.columna) <= radio) {
            this.mapaLaberinto[f][c].ultimoAvistamiento = ahora;
          }
        }
      }
      return;
    }

    for (const nodo of this.gestorMundo.mundo.values()) {
      const t = this.gestorMundo.transformAbsoluto(nodo.id);
      const minF = Math.max(0, Math.floor(world.fila - radio - t.df));
      const maxF = Math.min(nodo.filas - 1, Math.ceil(world.fila + radio - t.df));
      const minC = Math.max(0, Math.floor(world.columna - radio - t.dc));
      const maxC = Math.min(nodo.columnas - 1, Math.ceil(world.columna + radio - t.dc));
      for (let f = minF; f <= maxF; f++) {
        const fila = nodo.celdas[f];
        if (!fila) continue;
        for (let c = minC; c <= maxC; c++) {
          const wf = t.df + f;
          const wc = t.dc + c;
          if (Math.hypot(wf - world.fila, wc - world.columna) <= radio) {
            const celda = fila[c];
            if (celda) celda.ultimoAvistamiento = ahora;
          }
        }
      }
    }
  }

  /** Reenvío del estado completo del nodo activo a TODOS los invitados conectados: mapa v2 (re-dimensiona la rejilla del invitado) + enemigos + objetos + spawn. El invitado debe conocer el nodo del host en cada cruce, no solo al join. */
  private reenviarEstadoAInvitados(): void {
    if (!this.mpActivo) return;
    this.remotosActivos.forEach((_, guestId: string) => this.enviarMapaAlInvitado(guestId));
  }

  enviarMapaAlInvitado(guestId: string) {
    const jInfo = this.remotosActivos.get(guestId);
    this.registrarEventoLog(`[net] enviarMapaAlInvitado a ${guestId}: ${jInfo ? ('dc=' + (jInfo.dc?.readyState ?? 'null')) : 'sin jInfo'} (remotos=${this.remotosActivos.size})`);
    if (!jInfo || !jInfo.dc || jInfo.dc.readyState !== "open") return;

    const enemigos = this.listaDeEnemigos.map(e => ({
        id: e.id, f: e.fila, c: e.columna, n: e.nombre, t: e.tipo, v: e.vidaActual, vm: e.vidaMaxima
    }));

    // F4b.3: HTTP/manual sin persistencia → gen + deltas + costuras. Con
    // Firebase (snapshot/history en Firestore) o payload excesivo → mapa completo F3.
    let enviadoCompacto = false;
    if (!this.persistenciaMundo) {
        const compacto = this.construirMundoCompacto();
        if (compacto) {
            const payload = JSON.stringify(compacto);
            if (payload.length <= 64 * 1024) {
                jInfo.dc.send(payload);
                enviadoCompacto = true;
            }
        }
    }
    if (!enviadoCompacto) {
        const mapaCompacto = serializarMapa(this.mapaLaberinto, { v2: true });
        const ambiente = this.nodoActivo?.tipo === 'personal' ? 'casa' : 'dungeon';
        const activo = this.nodoActivo;
        const transformActivo = this.gestorMundo.nodoActivoId
            ? this.gestorMundo.transformAbsoluto(this.gestorMundo.nodoActivoId)
            : { df: 0, dc: 0 };
        const vecinos = this.nodosVecinosParaInvitado().map((nodo) => ({
            nodoId: nodo.id,
            tipo: nodo.tipo,
            transform: this.gestorMundo.transformAbsoluto(nodo.id),
            datos: serializarMapa(nodo.celdas, { v2: true }),
        }));
        const mensajeMapa: any = {
            tipo: 'mapa',
            datos: mapaCompacto,
            dificultad: this.config.dificultad,
            ambiente,
            nodoActivoId: this.gestorMundo.nodoActivoId,
            transformActivo,
            tipoActivo: activo?.tipo ?? 'mazmorra',
            continuo: activo?.tipo !== 'personal' && vecinos.length > 0,
            vecinos,
        };
        let payloadMapa = JSON.stringify(mensajeMapa);
        if (payloadMapa.length > 64 * 1024) {
            // Presupuesto F3: si los vecinos hinchan el mensaje, degradar a mapa
            // único + fundido (el invitado conserva el comportamiento anterior).
            delete mensajeMapa.vecinos;
            mensajeMapa.continuo = false;
            payloadMapa = JSON.stringify(mensajeMapa);
        }
        jInfo.dc.send(payloadMapa);
    }
    jInfo.dc.send(JSON.stringify({ tipo: 'enemigos', lista: enemigos }));

    const objetos: any[] = [];
    const dimsObjetos = this.dimsActivo();
    for (let f = 0; f < dimsObjetos.filas; f++) {
        for (let c = 0; c < dimsObjetos.columnas; c++) {
            const celda = this.mapaLaberinto[f][c];
            if (celda.alimento || celda.burbuja || celda.tienePico || celda.esPortal) {
                objetos.push({ f, c, a: celda.alimento, b: celda.burbuja, p: celda.tienePico, pr: celda.esPortal });
            }
        }
    }
    // is_update: el receptor limpia sus objetos antes del overlay para que el
    // host sea la verdad absoluta (imprescindible en re-syncs tras un cruce).
    jInfo.dc.send(JSON.stringify({ tipo: 'objetos', lista: objetos, is_update: true }));
    jInfo.dc.send(JSON.stringify({ tipo: 'loot_sync', lista: this.dropsSuelo }));

    const posSpawn = this.obtenerPosicionInicioAleatoria();
    jInfo.dc.send(JSON.stringify({ tipo: 'spawn', f: posSpawn.f, c: posSpawn.c }));

    // Sincronizar la posición del invitado en la representación del Host
    if (jInfo.entidad) {
        jInfo.entidad.fila = posSpawn.f;
        jInfo.entidad.columna = posSpawn.c;
    }

    this.remotosActivos.forEach((other, otherId) => {
        if (otherId !== guestId && other.entidad) {
            jInfo.dc.send(JSON.stringify({
                tipo: 'posicion', f: other.entidad.fila, c: other.entidad.columna,
                cam: false, nick: other.entidad.nombre, id: otherId,
                hp: other.entidad.vidaActual, maxHp: other.entidad.vidaMaxima
            }));
        }
    });
    jInfo.dc.send(JSON.stringify({
        tipo: 'posicion', f: this.protagonista.fila, c: this.protagonista.columna,
        cam: false, nick: this.protagonista.nombre, id: this.idLocalActivo,
        hp: this.protagonista.vidaActual, maxHp: this.protagonista.vidaMaxima
    }));
  }

  /** Vecinos continuos que el invitado necesita para ver la costura (máx. 2). */
  private nodosVecinosParaInvitado(): NodoMundo[] {
    const activoId = this.gestorMundo.nodoActivoId;
    const activo = this.gestorMundo.mundo.get(activoId);
    if (!activo) return [];
    const ids = new Set<string>();
    const añadir = (id: string): void => {
      if (id === activoId) return;
      const nodo = this.gestorMundo.mundo.get(id);
      if (!nodo || nodo.tipo === 'personal') return;
      ids.add(id);
    };
    for (const conector of this.gestorMundo.conectores.values()) {
      if (!conector.lado) continue;
      if (conector.nodoOrigenId === activoId) añadir(conector.nodoDestinoId);
      if (conector.nodoDestinoId === activoId) añadir(conector.nodoOrigenId);
    }
    if (activo.padreId) añadir(activo.padreId);
    for (const nodo of this.gestorMundo.mundo.values()) {
      if (nodo.padreId === activoId) añadir(nodo.id);
    }
    return Array.from(ids)
      .slice(0, 2)
      .map((id) => this.gestorMundo.mundo.get(id))
      .filter((nodo): nodo is NodoMundo => !!nodo);
  }

  /** Reconstruye el mundo renderizable del invitado desde el mensaje `mapa`. */
  /** F4b.3: materializa mundo compacto (gen + deltas + costuras / datos personal). */
  private aplicarMundoRemoto(msg: any): { filas: number; columnas: number } {
    const nodos: NodoMundo[] = [];
    for (const n of msg.nodos ?? []) {
      let celdas: Celda[][] = [];
      let filas = Number(n.filas) || 0;
      let columnas = Number(n.columnas) || 0;
      if (typeof n.datos === 'string') {
        const dims = deserializarMapa(celdas, n.datos);
        filas = dims.filas;
        columnas = dims.columnas;
      } else if (n.gen) {
        celdas = generarNodo(n.gen, filas, columnas);
        const deltas = Array.isArray(n.deltas) ? [...n.deltas].sort((a: DeltaMundo, b: DeltaMundo) => a.tick - b.tick) : [];
        for (const delta of deltas) aplicarDelta(celdas, delta);
        for (const costura of n.costuras ?? []) abrirCeldaCostura(celdas, costura);
      } else {
        console.warn('mundo: nodo sin gen ni datos; se ignora.', n.id);
        continue;
      }
      nodos.push({
        id: n.id,
        padreId: null,
        transform: n.transform ?? { df: 0, dc: 0 },
        filas,
        columnas,
        tipo: (n.tipo as NodoMundo['tipo']) ?? 'mazmorra',
        gen: n.gen ?? { nombre: 'remoto', version: 1, seed: 0, params: {} },
        celdas,
        ownerId: n.ownerId ?? null,
      });
    }
    if (nodos.length === 0) {
      console.warn('mundo: mensaje sin nodos; se conserva el mundo actual.');
      return this.dimsActivo();
    }
    const activo = nodos.find((n) => n.id === msg.nodoActivoId) ?? nodos[0];
    this.gestorMundo.mundo = new Map(nodos.map((n) => [n.id, n]));
    this.gestorMundo.nodoActivoId = activo.id;
    return { filas: activo.filas, columnas: activo.columnas };
  }

  private aplicarMapaRemoto(msg: any): { filas: number; columnas: number } {
    const celdasActivas: Celda[][] = [];
    const dims = deserializarMapa(celdasActivas, msg.datos);
    const nodoActivo: NodoMundo = {
      id: msg.nodoActivoId ?? 'remoto',
      padreId: null,
      transform: msg.transformActivo ?? { df: 0, dc: 0 },
      filas: dims.filas,
      columnas: dims.columnas,
      tipo: (msg.tipoActivo as NodoMundo['tipo']) ?? (msg.ambiente === 'casa' ? 'personal' : 'mazmorra'),
      gen: { nombre: 'remoto', version: 1, seed: 0, params: {} },
      celdas: celdasActivas,
      ownerId: null,
    };

    const mundo = new Map<string, NodoMundo>();
    mundo.set(nodoActivo.id, nodoActivo);
    for (const vecino of msg.vecinos ?? []) {
      const celdas: Celda[][] = [];
      const dimsVecino = deserializarMapa(celdas, vecino.datos);
      mundo.set(vecino.nodoId, {
        id: vecino.nodoId,
        padreId: null,
        transform: vecino.transform ?? { df: 0, dc: 0 },
        filas: dimsVecino.filas,
        columnas: dimsVecino.columnas,
        tipo: (vecino.tipo as NodoMundo['tipo']) ?? 'mazmorra',
        gen: { nombre: 'remoto', version: 1, seed: 0, params: {} },
        celdas,
        ownerId: null,
      });
    }

    this.gestorMundo.mundo = mundo;
    this.gestorMundo.nodoActivoId = nodoActivo.id;
    return dims;
  }

  /** F4: fin en solitario o aviso de espera en MP al pisar la celda de salida. */
  comprobarSalida(entidad: any = this.protagonista): void {
    if (entidad !== this.protagonista) return;
    const celda = this.mapaLaberinto[entidad.fila]?.[entidad.columna];
    if (!celda?.esSalida) return;
    if (!this.mpActivo) {
        this.juegoTerminado = true;
        this.resultados = [this.resultadoLocal()];
        this.registrarEventoLog("¡Has escapado!");
        return;
    }
    this.registrarEventoLog("Has llegado a la salida. Esperando al resto...");
    this.enviarMultiplayer({
        tipo: 'posicion',
        f: entidad.fila, c: entidad.columna, cam: false,
        id: this.idLocalActivo, nick: this.protagonista.nombre,
        hp: this.protagonista.vidaActual, maxHp: this.protagonista.vidaMaxima,
        oro: this.protagonista.inventario.oro ?? 0,
        xp: this.protagonista.puntosExperiencia,
        bajas: this.protagonista.bajas,
    });
  }

  private resultadoDeEntidad(nombre: string, oro: number, xp: number, bajas: number): ResultadoPartida {
    const segundos = Math.max(0, Math.floor((Date.now() - this.inicioPartida) / 1000));
    const marcador = { oro, xp, bajas, segundos };
    return { nombre, ...marcador, puntuacion: calcularPuntuacion(marcador) };
  }

  private resultadoLocal(): ResultadoPartida {
    return this.resultadoDeEntidad(
      this.protagonista.nombre,
      this.protagonista.inventario.oro ?? 0,
      this.protagonista.puntosExperiencia,
      this.protagonista.bajas,
    );
  }

  private estaEnCeldaSalida(id: string): boolean {
    const e = this.obtenerEntidadPorId(id);
    return !!e && !!this.mapaLaberinto[e.fila]?.[e.columna]?.esSalida;
  }

  /** F4 (host): congela el roster al primer jugador que llega y cierra cuando todos están fuera. */
  private verificarFinPartida(): void {
    if (!this.esHost || !this.mpActivo || this.juegoTerminado) return;
    const ahora = Date.now();
    if (ahora - this.ultimoChequeoFin < 1000) return;
    this.ultimoChequeoFin = ahora;

    const todos = [this.idLocalActivo, ...this.remotosActivos.keys()];
    if (!this.roster && todos.some((id) => this.estaEnCeldaSalida(id))) {
      this.roster = new Set(todos);
      this.rosterJugadores = new Set(todos.map((id) => this.playerIdDeConexion(id)));
      this.registrarEventoLog(`Roster congelado: ${this.roster.size} jugador(es).`);
      this.publicarMetadatosHost(true);
    }
    if (!this.roster) return;

    const fuera = (id: string): boolean => {
      if (id !== this.idLocalActivo && !this.remotosActivos.has(id)) return true;
      const e = this.obtenerEntidadPorId(id);
      if (!e || !e.estaVivo) return true;
      return !!this.mapaLaberinto[e.fila]?.[e.columna]?.esSalida;
    };
    const esperando = [...this.roster].filter((id) => !fuera(id)).length;
    this.esperaInfo = { total: this.roster.size, esperando };
    this.enviarMultiplayer({ tipo: 'espera', total: this.roster.size, esperando });
    if (esperando === 0) this.finPartida();
  }

  private finPartida(): void {
    if (!this.roster) return;
    const resultados: ResultadoPartida[] = [];
    const cubiertos = new Set<string>();

    // Jugadores vivos por conexión (dos pestañas del mismo navegador no se funden).
    for (const id of this.roster) {
      resultados.push(this.resultadoDeConexion(id));
      cubiertos.add(this.playerIdDeConexion(id));
    }
    // Roster/progreso persistido: solo los que ya no tienen conexión viva.
    for (const pid of this.rosterJugadores ?? []) {
      if (cubiertos.has(pid)) continue;
      resultados.push(this.resultadoDeJugador(pid));
      cubiertos.add(pid);
    }
    for (const p of Object.values(this.progresoSala)) {
      if (cubiertos.has(p.playerId)) continue;
      resultados.push(this.resultadoDeJugador(p.playerId));
      cubiertos.add(p.playerId);
    }
    this.resultados = resultados.sort((a, b) => b.puntuacion - a.puntuacion);
    this.esperaInfo = null;
    this.juegoTerminado = true;
    this.enviarMultiplayer({ tipo: 'fin_partida', resultados });
    this.registrarEventoLog('Partida terminada: todos fuera.');
  }


  obtenerEntidadPorNombre(nombre: string) {
    if (nombre === this.protagonista.nombre) return this.protagonista;
    let found = null;
    this.remotosActivos.forEach(j => {
        if (j.entidad && j.entidad.nombre === nombre) found = j.entidad;
    });
    return found;
  }

  obtenerEntidadPorId(id: string) {
    if (id === this.idLocalActivo) return this.protagonista;
    const j = this.remotosActivos.get(id);
    return j ? j.entidad : null;
  }

  /** Garantiza que haya una entidad remota para `id` (robustez ante handshake perdido). */
  asegurarEntidadRemota(id: string): void {
    const m = this.remotosActivos;
    let j = m.get(id);
    if (!j) { j = { pc: null, dc: null, entidad: null, unsubscribes: [] }; m.set(id, j); }
    if (!j.entidad) {
      j.entidad = new JugadorRemoto(0, 0, 'Invitado', id);
      this.setupEntity(j.entidad);
    }
  }

  enBurbujaSim(fila: number, columna: number, radio: number = this.config.radioSim): boolean {
    if (dentroDeBurbuja(fila, columna, this.protagonista.fila, this.protagonista.columna, radio)) {
        return true;
    }
    let dentro = false;
    this.remotosActivos.forEach(j => {
        if (j.entidad && dentroDeBurbuja(fila, columna, j.entidad.fila, j.entidad.columna, radio)) {
            dentro = true;
        }
    });
    return dentro;
  }

  onlineIds(): Set<string> {
    const ids = new Set<string>([this.idLocalActivo]);
    if (this.network.idRealDelHost) ids.add(this.network.idRealDelHost);
    this.remotosActivos.forEach((jugador, id) => {
        ids.add(id);
        const idReal: unknown = jugador?.entidad?.id;
        if (typeof idReal === 'string' && idReal.length > 0) ids.add(idReal);
    });
    return ids;
  }

  portalDisponible(conector: ConectorMundo): boolean {
    return this.housing.portalDisponible(conector, this.onlineIds());
  }

  portalesHousingInactivos(): Set<string> {
    const ahora = performance.now();
    if (ahora - this.portalesInactivosRecalculadoEn < this.INTERVALO_PORTALES_MS) {
      return this.portalesInactivosCache;
    }
    this.portalesInactivosRecalculadoEn = ahora;
    this.portalesInactivosCache = this.calcularPortalesHousingInactivos();
    return this.portalesInactivosCache;
  }

  private invalidarPortalesHousing(): void {
    this.portalesInactivosRecalculadoEn = Number.NEGATIVE_INFINITY;
  }

  /** Ids de todos los portales de housing (ida y vuelta): se dibujan como casita. */
  idsPortalesHousing(): Set<string> {
    const ids = new Set<string>();
    for (const c of this.housing.portales()) ids.add(c.id);
    for (const c of this.gestorMundo.conectores.values()) {
      if (c.housingOwnerId !== null) ids.add(c.id);
    }
    return ids;
  }

  /** Debug: teletransporta el protagonista a su casa (o de vuelta al mapa) por el camino real. */
  teleportHousing(): void {
    if (!this.esLadoAutoritativo()) {
      this.registrarEventoLog('El housing solo está disponible en el lado local (host/solo).');
      return;
    }
    const enCasa = this.nodoActivo?.tipo === 'personal';
    let conector: ConectorMundo | null = null;
    for (const c of this.gestorMundo.conectores.values()) {
      if (enCasa) {
        if (c.tipo === 'entrada' && c.nodoOrigenId === this.gestorMundo.nodoActivoId && c.housingOwnerId !== null) {
          conector = c;
          break;
        }
      } else if (c.tipo === 'portal' && c.housingOwnerId !== null) {
        conector = c;
        break;
      }
    }
    if (!conector) {
      this.registrarEventoLog('No hay portal de housing registrado.');
      return;
    }
    // Travesía real por el conector (conmuta de nodo con fundido/log, sin asumir el nodo actual).
    this.atravesarConector(this.protagonista, conector);
  }

  private calcularPortalesHousingInactivos(): Set<string> {
    const online = this.onlineIds();
    const nodoActivo = this.gestorMundo.nodoActivoId;
    const inactivos = new Set<string>();
    const vistos = new Set<string>();
    const considerar = (conector: ConectorMundo): void => {
      if (conector.housingOwnerId === null) return;
      if (nodoActivo && conector.nodoOrigenId !== nodoActivo) return;
      if (vistos.has(conector.id)) return;
      vistos.add(conector.id);
      if (!this.housing.portalDisponible(conector, online)) {
        inactivos.add(conector.id);
      }
    };
    for (const conector of this.housing.portales()) considerar(conector);
    for (const conector of this.gestorMundo.conectores.values()) considerar(conector);
    return inactivos;
  }

  async persistirDeltaMundo(delta: DeltaMundo): Promise<void> {
    if (!this.esHost || !this.persistenciaMundo) return;
    await this.persistenciaMundo.guardarDelta(delta);
  }

  private siguienteTickMundo(): number {
    this.tickMundo = Math.max(this.tickMundo + 1, Date.now());
    return this.tickMundo;
  }

  /** F4b.3: registra un delta aplicado en el host para enviarlo al invitado. */
  private registrarDeltaMundo(delta: DeltaMundo): void {
    const lista = this.deltasMundo.get(delta.nodoId);
    if (lista) lista.push(delta);
    else this.deltasMundo.set(delta.nodoId, [delta]);
  }

  /** F4b.3: nodo remoto a partir del estado del host (mundo o casa). */
  private construirNodoRemoto(nodo: NodoMundo, activoId: string): NodoRemoto {
    const transform = this.gestorMundo.transformAbsoluto(nodo.id);
    const base: NodoRemoto = {
      id: nodo.id,
      gen: nodo.gen,
      filas: nodo.filas,
      columnas: nodo.columnas,
      tipo: nodo.tipo,
      ownerId: nodo.ownerId,
      transform,
    };
    // El activo se envía completo: su estado puede incluir celdas no
    // reconstruibles por gen+deltas (semilla, objetos, debug). Los vecinos,
    // que son el coste real del protocolo, van gen+deltas.
    if (nodo.tipo === 'personal' || nodo.id === activoId) {
      base.datos = serializarMapa(nodo.celdas, { v2: true });
      return base;
    }
    const deltas = consolidarDeltasNodo(this.deltasMundo.get(nodo.id) ?? []);
    if (deltas.length > 0) base.deltas = deltas;
    const costuras = costurasDeNodo(this.gestorMundo.conectores.values(), nodo.id);
    if (costuras.length > 0) base.costuras = costuras;
    return base;
  }

  /** F4b.3: mensaje compacto activo + hasta 2 vecinos (HTTP/manual). */
  private construirMundoCompacto(): any {
    const activo = this.nodoActivo;
    if (!activo) return null;
    const nodos = [activo, ...this.nodosVecinosParaInvitado()];
    const vistos = new Set<string>();
    const remotos: NodoRemoto[] = [];
    for (const nodo of nodos) {
      if (vistos.has(nodo.id)) continue;
      vistos.add(nodo.id);
      remotos.push(this.construirNodoRemoto(nodo, activo.id));
    }
    return {
      tipo: 'mundo',
      version: 2,
      nodoActivoId: activo.id,
      ambiente: activo.tipo === 'personal' ? 'casa' : 'dungeon',
      dificultad: this.config.dificultad,
      continuo: activo.tipo !== 'personal' && remotos.length > 1,
      nodos: remotos,
    };
  }

  private construirDelta(fila: number, columna: number, cambio: DeltaMundo['cambio'], autoria: string, tickAutor: number | null = null): DeltaMundo {
    const base: Omit<DeltaMundo, 'tick'> = {
      fmt: FMT_DELTA,
      nodoId: this.gestorMundo.nodoActivoId || 'raiz',
      fila,
      columna,
      autoria: autoria || this.idLocalActivo,
      cambio,
    };
    return conTickAutor(base, tickAutor, this.siguienteTickMundo());
  }

  private aplicarDeltaAutorizado(delta: DeltaMundo): boolean {
    // Arbitraje last-writer-wins por celda: un delta de tick inferior al último
    // aplicado en esa celda se descarta (evita divergencia permanente).
    // Residual fase 1: la convergencia entre clientes se apoya además en que
    // `cargarNodo` reproduce los deltas persistidos ordenados por tick; el reloj
    // local puede rechazar temporalmente un delta propio con tick menor que uno
    // remoto hasta que Date.now() lo supera.
    if (!this.arbitroDeltas.puedeAplicar(delta)) return false;
    const aplicado = aplicarDeltaConPersistencia(
      this.gestorMundo,
      this.mapaLaberinto,
      delta,
      this.esHost,
      (d) => void this.persistirDeltaMundo(d),
    );
    if (aplicado) {
      this.arbitroDeltas.registrar(delta);
      if (this.esHost) this.registrarDeltaMundo(delta);
      this.programarGuardadoCasa(delta);
    }
    return aplicado;
  }

  /**
   * Casa duradera (Solo): sin Firebase el espejo local es la persistencia de la
   * casa. Un delta aplicado en ella se acumula y programa un guardado con
   * debounce; con Firebase va por persistenciaMundo (host) y el espejo no interviene.
   */
  private programarGuardadoCasa(delta: DeltaMundo): void {
    if (this.persistenciaMundo) return;
    if (!this.idCasaEspejo || delta.nodoId !== this.idCasaEspejo) return;
    this.deltasCasaPendientes.push(delta);
    if (this.timerEspejoCasa !== null) window.clearTimeout(this.timerEspejoCasa);
    this.timerEspejoCasa = window.setTimeout(() => {
      this.timerEspejoCasa = null;
      this.vaciarEspejoCasa();
    }, Game.DEBOUNCE_ESPEJO_CASA_MS);
  }

  /** Flush del espejo de la casa: acumula deltas (con compactación al superar el límite) y guarda. */
  private vaciarEspejoCasa(): void {
    if (this.timerEspejoCasa !== null) {
      window.clearTimeout(this.timerEspejoCasa);
      this.timerEspejoCasa = null;
    }
    if (this.persistenciaMundo) return; // con Firebase la casa persiste por Firestore
    if (!this.idCasaEspejo) {
      this.deltasCasaPendientes = [];
      return;
    }
    const nodoCasa = this.gestorMundo.mundo.get(this.idCasaEspejo);
    if (!nodoCasa) {
      this.deltasCasaPendientes = [];
      return;
    }
    const previo = this.espejo.cargarDoc(this.idCasaEspejo);
    let deltas = [...(previo?.deltas ?? []), ...this.deltasCasaPendientes].sort(
      (a, b) => a.tick - b.tick,
    );
    this.deltasCasaPendientes = [];

    let snapshot: SnapshotNodo | null = previo?.snapshot ?? null;
    let ultimaCompactacionTick = previo?.ultimaCompactacionTick ?? 0;
    if (deltas.length > Game.LIMITE_DELTAS_ESPEJO) {
      // Plegado tipo compactarNodo: LWW por (celda, tipo, campo) — los efectos
      // ortogonales de la misma celda coexisten; el snapshot previo nunca regresa.
      const plegadas = consolidarCeldasLWW([snapshot?.celdas ?? [], deltas]);
      const fusion: SnapshotNodo = { formato: 1 };
      const celdas = plegadas.length > 0 ? plegadas : undefined;
      if (celdas) fusion.celdas = celdas;
      if (snapshot?.enemigos) fusion.enemigos = snapshot.enemigos;
      if (snapshot?.escenario) fusion.escenario = snapshot.escenario;
      snapshot = fusion;
      if (deltas.length > 0) ultimaCompactacionTick = Math.max(ultimaCompactacionTick, deltas[deltas.length - 1].tick);
      deltas = [];
    }

    const doc: DocNodoLocal = {
      formato: 1,
      gen: nodoCasa.gen,
      ownerId: nodoCasa.ownerId,
      deltas,
      snapshot,
      ultimaCompactacionTick,
    };
    this.espejo.guardarDoc(this.idCasaEspejo, doc);
  }

  /**
   * Enemigos de la casa (Solo): al salir, la foto del nodo saliente se fusiona
   * en el doc local con la misma semántica que PersistenciaMundo.
   * guardarSnapshotParcial: read-modify que reemplaza `enemigos` y conserva el
   * resto del snapshot del espejo.
   */
  private espejoEnemigosCasa(nodoSalienteId: string, fotoEnemigos: EnemigoFoto[] | null): void {
    if (this.persistenciaMundo) return;
    if (!this.idCasaEspejo || nodoSalienteId !== this.idCasaEspejo) return;
    if (!fotoEnemigos || fotoEnemigos.length === 0) return;
    this.vaciarEspejoCasa(); // los deltas pendientes viajan en el mismo doc antes de la fusión
    const doc = this.espejo.cargarDoc(nodoSalienteId);
    if (!doc) return;
    const previo = leerSnapshotNodo(doc.snapshot);
    doc.snapshot = {
      formato: 1,
      enemigos: fotoEnemigos,
      ...(previo.escenario ? { escenario: previo.escenario } : {}),
      ...(previo.celdas ? { celdas: previo.celdas } : {}),
    };
    this.espejo.guardarDoc(nodoSalienteId, doc);
  }

  resolverAccion(id: string, accion: any) {
    const entidad = this.obtenerEntidadPorId(id);
    if (!entidad) {
        console.warn(`resolverAccion: No se encontró entidad para ID ${id} · idLocalActivo=${this.idLocalActivo} · remotosActivos=[${[...this.remotosActivos.keys()].join(',')}]`);
        return;
    }
    if (!entidad.estaVivo) {
        console.warn(`resolverAccion: La entidad ${entidad.nombre} está muerta`);
        return;
    }
    // Fase 2 §3a: la burbuja gobierna la SIM, no la persistencia. Se evalúa una
    // vez por acción y se aplica por rama: las ediciones que producen delta del
    // mundo (cavar, recoger, crear comida) pasan en cualquier celda del nodo;
    // el resto de la lógica de entidades (movimiento, combate, hechizos) sigue guardada.
    const radioInteres = this.esLadoAutoritativo() && entidad !== this.protagonista
        ? Math.max(this.config.radioSim, RADIO_SIM_AUTORIDAD)
        : this.config.radioSim;
    const enBurbuja = this.enBurbujaSim(entidad.fila, entidad.columna, radioInteres);

    if (accion.tipo === 'mover') {
        const { df, dc } = accion;
        const sigFila = entidad.fila + df;
        const sigColumna = entidad.columna + dc;

        // 1-3: SIM bajo burbuja — colisiones con jugadores (solo bloqueo), con
        // enemigos y rehuir. Fuera de burbuja estas ramas no se simulan.
        if (enBurbuja) {
            // 1. Verificar colisión con otros jugadores
            let jugadorChocado: any = null;

            if (id !== this.idLocalActivo && this.protagonista.fila === sigFila && this.protagonista.columna === sigColumna) {
                jugadorChocado = this.protagonista;
            } else {
                this.remotosActivos.forEach((v: any, k: string) => {
                    if (k !== id && v.entidad && v.entidad.fila === sigFila && v.entidad.columna === sigColumna) {
                        jugadorChocado = v.entidad;
                    }
                });
            }

            if (jugadorChocado) {
                // Los aliados bloquean el paso; nunca transfieren vida al chocar.
                return;
            }

            // 2. Verificar colisión con enemigos
            const enemigoEnCasilla = this.listaDeEnemigos.find(e => e.fila === sigFila && e.columna === sigColumna && e.estaVivo);
            if (enemigoEnCasilla) {
                entidad.setEstado('attacking', 500);
                if (entidad.enCombateCon === enemigoEnCasilla) {
                    this.resolverRondaDeCombate(entidad, enemigoEnCasilla);
                } else {
                    this.iniciarCombate(entidad, enemigoEnCasilla);
                }
                return;
            }

            // 3. Rehuir combate
            if (entidad.enCombateCon) {
                if (!this.intentarRehuirCombate(entidad)) return;
            }
        }

        // 4. Costura continua: si el movimiento sale por un borde con costura,
        // cambia de nodo sin teletransportar y conserva la posición de mundo.
        if (this.esLadoAutoritativo() && entidad === this.protagonista && this.intentarCruzarCostura(entidad, df, dc)) {
            return;
        }

        // 4b. Límites del mapa
        if (sigFila < 0 || sigFila >= this.mapaLaberinto.length || sigColumna < 0 || sigColumna >= (this.mapaLaberinto[sigFila]?.length ?? 0)) {
            console.warn(`resolverAccion: Intento de movimiento fuera de límites por ${entidad.nombre}`);
            return;
        }

        // 5. Muros y transitable
        const celdaActual = this.mapaLaberinto[entidad.fila][entidad.columna];
        this.recogerDropsEn(entidad.fila, entidad.columna, entidad);
        let esMovimientoValido = false;
        if (df === -1 && !celdaActual.muros.superior && this.mapaLaberinto[sigFila][sigColumna].esTransitable) esMovimientoValido = true;
        if (df === 1 && !celdaActual.muros.inferior && this.mapaLaberinto[sigFila][sigColumna].esTransitable) esMovimientoValido = true;
        if (dc === -1 && !celdaActual.muros.izquierdo && this.mapaLaberinto[sigFila][sigColumna].esTransitable) esMovimientoValido = true;
        if (dc === 1 && !celdaActual.muros.derecho && this.mapaLaberinto[sigFila][sigColumna].esTransitable) esMovimientoValido = true;

        if (!esMovimientoValido) {
            console.warn(`resolverAccion: Movimiento inválido para ${entidad.nombre} hacia (${sigFila}, ${sigColumna}) desde (${entidad.fila}, ${entidad.columna})`);
            const celdaObjetivo = this.mapaLaberinto[sigFila][sigColumna];
            if (celdaObjetivo?.cofre && entidad === this.protagonista) {
                this.intentarAbrirCofre(sigFila, sigColumna, id);
                return;
            }
        }

        if (!esMovimientoValido && (typeof (entidad as any).puedeCavar === 'function' ? (entidad as any).puedeCavar() : (entidad as any).tienePico)) {
            const celdaObjetivo = this.mapaLaberinto[sigFila][sigColumna];
            if ((entidad as any).ultimaCasillaAtacada && (entidad as any).ultimaCasillaAtacada.f === sigFila && (entidad as any).ultimaCasillaAtacada.c === sigColumna) {
                celdaObjetivo.golpesCavar++;
            } else {
                celdaObjetivo.golpesCavar = 1;
                (entidad as any).ultimaCasillaAtacada = { f: sigFila, c: sigColumna };
            }
            if (celdaObjetivo.golpesCavar >= 5) {
                celdaObjetivo.golpesCavar = 0;
                const deltaCavar = this.construirDelta(sigFila, sigColumna, { tipo: 'cavar' }, id);
                this.aplicarDeltaAutorizado(deltaCavar);
                this.renderer.invalidarCacheLaberinto();
                eliminarMurosEntre(this.mapaLaberinto[entidad.fila][entidad.columna], celdaObjetivo);
                this.enviarMultiplayer({
                    tipo: 'dig_completed',
                    f: sigFila,
                    c: sigColumna,
                    fromF: entidad.fila,
                    fromC: entidad.columna,
                    tick: deltaCavar.tick
                });
            }
            return;
        }

        if (esMovimientoValido) {
            // Sim: el desplazamiento de la entidad sigue gobernado por la burbuja.
            if (enBurbuja) {
                entidad.fila = sigFila;
                entidad.columna = sigColumna;
                console.log(`resolverAccion: ${entidad.nombre} movido a (${sigFila}, ${sigColumna})`);
                entidad.estaCaminando = true;
                (entidad as any).ultimaCasillaAtacada = null;
                this.recogerDropsEn(sigFila, sigColumna, entidad);
            }
            // Recogidas (§3a): ediciones del mundo que producen delta — pasan
            // también fuera de burbuja, sobre la celda objetivo del intento.
            const celdaNueva = this.mapaLaberinto[sigFila][sigColumna];

            if (celdaNueva.tienePico) {
                // El pico del suelo se recoge como item (se empuña para cavar).
                if (entidad === this.protagonista) this.protagonista.recibirBotin([{ id: 'pico', cantidad: 1 }]);
                else (entidad as any).tienePico = true;
                const deltaPico = this.construirDelta(sigFila, sigColumna, { tipo: 'objeto', campo: 'tienePico', valor: false }, id);
                this.aplicarDeltaAutorizado(deltaPico);
                this.renderer.invalidarCacheLaberinto();
                this.enviarMultiplayer({ tipo: 'pick_collected', f: sigFila, c: sigColumna, tick: deltaPico.tick });
                if (entidad === this.protagonista) { this.guardarSesionActual(); this.registrarEventoLog('Recogido: Pico (empúñalo para cavar).'); }
            }
            if (celdaNueva.alimento) {
                // La comida del suelo se recoge como item de mochila (se consumirá desde el panel).
                if (entidad === this.protagonista) this.protagonista.recibirBotin([{ id: 'comida', cantidad: 1 }]);
                else {
                    const PC = celdaNueva.alimento.pc;
                    const CC = ((3 * entidad.fuerza) + (2 * entidad.agilidad) + (1 * entidad.inteligencia)) / 6;
                    entidad.vidaActual = Math.min(entidad.vidaMaxima, entidad.vidaActual + Math.max(1, Math.floor(PC / CC)));
                }
                const deltaAlimento = this.construirDelta(sigFila, sigColumna, { tipo: 'objeto', campo: 'alimento', valor: null }, id);
                this.aplicarDeltaAutorizado(deltaAlimento);
                this.renderer.invalidarCacheLaberinto();
                this.enviarMultiplayer({ tipo: 'food_consumed', f: sigFila, c: sigColumna, tick: deltaAlimento.tick });
                if (entidad === this.protagonista) { this.guardarSesionActual(); this.registrarEventoLog('Recogido: Comida.'); }
            }
            if (celdaNueva.burbuja) {
                const deltaEscudo = this.construirDelta(sigFila, sigColumna, { tipo: 'objeto', campo: 'burbuja', valor: null }, id);
                this.aplicarDeltaAutorizado(deltaEscudo);
                entidad.inmunidadHasta = Date.now() + 30000;
                this.renderer.invalidarCacheLaberinto();
                this.enviarMultiplayer({ tipo: 'shield_collected', f: sigFila, c: sigColumna, tick: deltaEscudo.tick });
                this.registrarEventoLog(`${entidad.nombre} recoge escudo: inmunidad 30 s.`);
            }
            if (celdaNueva.llave && entidad === this.protagonista) {
                const tipoLlave = celdaNueva.llave;
                this.protagonista.recibirBotin([{ id: LLAVE_POR_COFRE[tipoLlave], cantidad: 1 }]);
                const deltaLlave = this.construirDelta(sigFila, sigColumna, { tipo: 'objeto', campo: 'llave', valor: null }, id);
                this.aplicarDeltaAutorizado(deltaLlave);
                this.renderer.invalidarCacheLaberinto();
                this.enviarMultiplayer({ tipo: 'llave_recogida', f: sigFila, c: sigColumna, tick: deltaLlave.tick });
                this.guardarSesionActual();
                this.registrarEventoLog(`Recogida: llave de ${tipoLlave}.`);
            }
            if (enBurbuja) {
                this.verificarPortal(entidad);

                (entidad as any).pasosDesdeUltimoDano = ((entidad as any).pasosDesdeUltimoDano || 0) + 1;
                const factorDificultad = this.config.dificultad === 'facil' ? 1 : (this.config.dificultad === 'medio' ? 2 : 3);
                if ((entidad as any).pasosDesdeUltimoDano >= 10 * factorDificultad) {
                    (entidad as any).pasosDesdeUltimoDano = 0;
                    entidad.vidaActual = Math.min(entidad.vidaMaxima, entidad.vidaActual + 1);
                }
            }
            if (entidad === this.protagonista) this.comprobarSalida(entidad);
        }
    } else if (accion.tipo === 'fireball') {
        // El invitado ya validó su propia burbuja en local; el host no debe
        // descartar sus habilidades por la posición del anfitrión.
        if (entidad !== this.protagonista || enBurbuja) this.lanzarBolaDeFuego(entidad, false);
    } else if (accion.tipo === 'bow') {
        if (entidad !== this.protagonista || enBurbuja) this.lanzarArco(entidad, false, accion.targetId);
    } else if (accion.tipo === 'create_food') {
        // Edición interactiva (§3a): crea comida vía delta, pasa fuera de burbuja.
        this.crearComidaHabilidad(entidad, false);
    } else if (accion.tipo === 'radar') {
        if (entidad !== this.protagonista || enBurbuja) this.lanzarRadar(entidad, false);
    } else if (accion.tipo === 'whirlwind') {
        if (entidad !== this.protagonista || enBurbuja) this.lanzarWhirlwind(entidad, false);
    } else if (accion.tipo === 'freeze') {
        if (entidad !== this.protagonista || enBurbuja) this.lanzarCongelar(entidad, false);
    } else if (accion.tipo === 'stop_walking') {
        if (entidad !== this.protagonista || enBurbuja) entidad.estaCaminando = false;
    }
  }

  asustarMonstruosCercanos(fila: number, columna: number) {
    const r = this.config.radioVis;
    this.listaDeEnemigos.forEach(e => {
        const dist = Math.sqrt(Math.pow(e.fila - fila, 2) + Math.pow(e.columna - columna, 2));
        if (dist <= r) {
            (e as any).huyendoHasta = Date.now() + 10000;
        }
    });
  }

  /**
   * LA GUARDIA: reúne a los aliados alrededor del líder. Solo el host resuelve
   * el teleport en MP; el invitado únicamente lo solicita. Los destinos se
   * buscan con BFS por huecos abiertos (sin atravesar muros) y sin ocupar
   * celdas de otros jugadores, para no amontonar ni desincronizar.
   */
  teletransportarAliados(lider: any, esLocal: boolean) {
    if (this.mpActivo && !this.esHost) {
        if (esLocal) this.enviarMultiplayer({ tipo: 'request_guard_teleport' });
        return;
    }
    if (!this.mapaLaberinto.length) return;

    const clave = (f: number, c: number) => `${f},${c}`;
    const posiciones = this.celdasGuardia(lider, 3);
    const ocupadas = new Set<string>();
    ocupadas.add(clave(lider.fila, lider.columna));
    if (this.protagonista !== lider) {
        ocupadas.add(clave(this.protagonista.fila, this.protagonista.columna));
    }
    const remotos: { id: string; entidad: any }[] = [];
    this.remotosActivos.forEach((j, id) => {
        if (j.entidad) {
            remotos.push({ id, entidad: j.entidad });
            if (j.entidad !== lider) ocupadas.add(clave(j.entidad.fila, j.entidad.columna));
        }
    });

    const elegir = (entidad: any): { f: number; c: number } | null => {
        const propia = entidad ? clave(entidad.fila, entidad.columna) : null;
        const pos = posiciones.find((p) => !ocupadas.has(clave(p.f, p.c)) || clave(p.f, p.c) === propia);
        if (!pos) return null;
        if (propia) ocupadas.delete(propia);
        ocupadas.add(clave(pos.f, pos.c));
        return pos;
    };

    const mover = (entidad: any, pos: { f: number; c: number }): void => {
        entidad.fila = pos.f;
        entidad.columna = pos.c;
        entidad.visualFila = pos.f;
        entidad.visualColumna = pos.c;
        entidad.estaCaminando = false;
        entidad.estadoActual = 'idle';
    };

    remotos.forEach(({ id, entidad }) => {
        if (entidad === lider) return;
        const pos = elegir(entidad);
        if (!pos) return;
        mover(entidad, pos);
        // Descarta movimientos pendientes del aliado: no deben deshacer el salto.
        this.colaAcciones = this.colaAcciones.filter((a) => a.id !== id);
        this.enviarMultiplayer({ tipo: 'force_teleport', id, f: pos.f, c: pos.c, nodo: this.gestorMundo.nodoActivoId });
    });

    if (this.protagonista !== lider) {
        const pos = elegir(this.protagonista);
        if (pos) {
            mover(this.protagonista, pos);
            this.colaAcciones = this.colaAcciones.filter((a) => a.id !== this.idLocalActivo);
            this.registrarEventoLog("¡Llamada a la guardia! Has sido teletransportado.");
            this.enviarMultiplayer({
                tipo: 'posicion',
                f: pos.f, c: pos.c, cam: false,
                id: this.idLocalActivo, nick: this.protagonista.nombre,
                hp: this.protagonista.vidaActual, maxHp: this.protagonista.vidaMaxima,
                oro: this.protagonista.inventario.oro ?? 0,
                xp: this.protagonista.puntosExperiencia,
                bajas: this.protagonista.bajas,
            });
        }
    }
  }

  /** Celdas transitables alcanzables desde el líder sin cruzar muros (BFS). */
  private celdasGuardia(lider: any, maxDist: number): { f: number; c: number }[] {
    const filas = this.mapaLaberinto.length;
    if (!this.mapaLaberinto[lider.fila]?.[lider.columna]) return [];
    const salida: { f: number; c: number }[] = [];
    const vistas = new Set<string>([`${lider.fila},${lider.columna}`]);
    const cola: { f: number; c: number; d: number }[] = [{ f: lider.fila, c: lider.columna, d: 0 }];
    while (cola.length > 0) {
        const actual = cola.shift()!;
        if (actual.d >= maxDist) continue;
        const celda = this.mapaLaberinto[actual.f]?.[actual.c];
        if (!celda) continue;
        const vecinos = [
            { df: -1, dc: 0, muro: celda.muros.superior },
            { df: 1, dc: 0, muro: celda.muros.inferior },
            { df: 0, dc: -1, muro: celda.muros.izquierdo },
            { df: 0, dc: 1, muro: celda.muros.derecho },
        ];
        for (const v of vecinos) {
            if (v.muro) continue;
            const nf = actual.f + v.df;
            const nc = actual.c + v.dc;
            const k = `${nf},${nc}`;
            if (vistas.has(k)) continue;
            if (nf < 0 || nf >= filas || nc < 0 || nc >= (this.mapaLaberinto[nf]?.length ?? 0)) continue;
            if (!this.mapaLaberinto[nf][nc].esTransitable) continue;
            vistas.add(k);
            salida.push({ f: nf, c: nc });
            cola.push({ f: nf, c: nc, d: actual.d + 1 });
        }
    }
    return salida;
  }

  lanzarCongelar(emisor: any, esLocal: boolean) {
    const ahora = Date.now();
    const cooldown = (120 / emisor.inteligencia) * 1000;

    if (esLocal && emisor === this.protagonista) {
        if (ahora - emisor.ultimaVezHabilidad.freeze < cooldown) return;
        emisor.ultimaVezHabilidad.freeze = ahora;

        if (this.mpActivo) {
            if (this.esHost) {
                this.colaAcciones.push({ id: this.idLocalActivo, accion: { tipo: 'freeze' } });
            } else {
                this.enviarMultiplayer({ tipo: 'action', accion: { tipo: 'freeze' } });
            }
            return;
        }
    }

    const duracion = 15000;
    this.freezes.push({
        x: emisor.columna,
        y: emisor.fila,
        radio: 4,
        inicio: ahora,
        duracion: duracion
    });

    if (this.esHost || (!this.mpActivo)) {
        // Inmovilizar NPCs en el área
        this.listaDeEnemigos.forEach(e => {
            if (e.estaVivo && Math.sqrt(Math.pow(e.fila - emisor.fila, 2) + Math.pow(e.columna - emisor.columna, 2)) <= 4) {
                e.inmovilizadoHasta = ahora + duracion;
                this.registrarEventoLog(`¡${e.nombre} ha sido congelado!`);
            }
        });
    }

    if (this.esHost && this.mpActivo) {
        this.enviarMultiplayer({
            tipo: 'freeze_spawn',
            x: emisor.columna,
            y: emisor.fila,
            r: 4,
            d: duracion
        });
    }
  }

  lanzarWhirlwind(emisor: any, esLocal: boolean) {
    const ahora = Date.now();
    const cooldown = (90 / emisor.fuerza) * 1000;

    if (esLocal && emisor === this.protagonista) {
        if (ahora - emisor.ultimaVezHabilidad.whirlwind < cooldown) return;
        emisor.ultimaVezHabilidad.whirlwind = ahora;

        if (this.mpActivo) {
            if (this.esHost) {
                this.colaAcciones.push({ id: this.idLocalActivo, accion: { tipo: 'whirlwind' } });
            } else {
                this.enviarMultiplayer({ tipo: 'action', accion: { tipo: 'whirlwind' } });
            }
            return;
        }
    }

    this.whirlwinds.push({
        x: emisor.columna,
        y: emisor.fila,
        inicio: ahora,
        duracion: 800
    });

    if (this.esHost || (!this.mpActivo)) {
        // Daño a NPCs circundantes
        const danoExtra = 1 + (10 * emisor.fuerza / 100);
        this.listaDeEnemigos.forEach(e => {
            if (e.estaVivo && Math.abs(e.fila - emisor.fila) <= 1 && Math.abs(e.columna - emisor.columna) <= 1) {
                const vA = emisor.generarAtaque() * danoExtra + (emisor === this.protagonista ? (emisor.danoArma() - emisor.penalizacion().ataque) : 0);
                const vD = e.generarDefensa();
                const d = Math.max(1, Math.floor(vA - vD));
                e.recibirDano(d);
                this.registrarEventoLog(`¡Golpe de Giro! ${emisor.nombre} daña a ${e.nombre} (-${d} HP)`);
            }
        });
    }

    if (this.esHost && this.mpActivo) {
        this.enviarMultiplayer({
            tipo: 'whirlwind_spawn',
            x: emisor.columna,
            y: emisor.fila
        });
    }
  }

  lanzarBolaDeFuego(emisor: any, esLocal: boolean) {
    const ahora = Date.now();
    const cooldown = (30 / emisor.inteligencia) * 1000;

    if (esLocal && emisor === this.protagonista) {
        if (ahora - emisor.ultimaVezHabilidad.fireball < cooldown) return;
        emisor.ultimaVezHabilidad.fireball = ahora;

        if (this.mpActivo) {
            if (this.esHost) {
                this.colaAcciones.push({ id: this.idLocalActivo, accion: { tipo: 'fireball' } });
            } else {
                this.enviarMultiplayer({ tipo: 'action', accion: { tipo: 'fireball' } });
            }
            return;
        }
    }

    // Buscar enemigo más cercano, prioridad a los que están a la vista
    let target: any = null;
    let minDist = Infinity;

    this.listaDeEnemigos.forEach(e => {
        if (e.estaVivo) {
            const celda = this.mapaLaberinto[e.fila][e.columna];
            const visible = celda.ultimoAvistamiento > 0 && (ahora - celda.ultimoAvistamiento < this.config.TIEMPO_DESVANECIMIENTO_NIEBLA);

            let dist = Math.sqrt(Math.pow(e.fila - emisor.fila, 2) + Math.pow(e.columna - emisor.columna, 2));
            // Penalizar distancia si no está a la vista para dar prioridad a los visibles
            if (!visible) dist += 100;

            if (dist < minDist) {
                minDist = dist;
                target = e;
            }
        }
    });

    if (target) {
        this.bolasDeFuego.push({
            x: emisor.columna,
            y: emisor.fila,
            targetX: target.columna,
            targetY: target.fila,
            targetRef: target,
            pct: 0,
            aplicarDano: this.esHost || !this.mpActivo,
            color: "#ff4500"
        });
        this.registrarEventoLog(`¡${emisor.nombre} lanza una bola de fuego!`);

        if (this.esHost && this.mpActivo) {
            this.enviarMultiplayer({
                tipo: 'fireball_spawn',
                ex: emisor.columna,
                ey: emisor.fila,
                tx: target.columna,
                ty: target.fila,
                c: "#ff4500"
            });
        }
    }
  }

  /** Reparte botín al protagonista (al derrotar enemigos o desde el botón de pruebas). */
  otorgarBotin(veces: number = 1 + Math.floor(Math.random() * 2)): void {
    const botin = elegirBotin(Math.random, veces);
    this.protagonista.recibirBotin(botin);
    const txt = botin
      .map((b) => `${ITEMS[b.id]?.nombre ?? b.id}${b.cantidad > 1 ? ' ×' + b.cantidad : ''}`)
      .join(', ');
    this.registrarEventoLog(`¡Botín: ${txt}!`);
    this.guardarSesionActual();
    if (document.getElementById('equipoModal')?.style.display === 'flex') this.lobbyManager.renderEquipo();
  }

  /** Envía a los peers por el transporte multijugador activo (Firebase o HTTP). */
  private enviarMultiplayer(msg: any, exceptId: string | null = null): void {
    if (this.mpActivo) this.network.enviarMensaje(msg, exceptId);
    if (this.networkHttp && this.networkHttp.multiplayerActivo) this.networkHttp.enviarMensaje(msg, exceptId);
  }

  /** Mapa de jugadores remotos del transporte multijugador ACTIVO (Firebase o HTTP). */
  private get remotosActivos(): Map<string, any> {
    if (this.networkHttp && this.networkHttp.multiplayerActivo) return this.networkHttp.jugadoresRemotos;
    return this.network.jugadoresRemotos;
  }

  /** Id local del transporte multijugador ACTIVO (Firebase o HTTP). */
  private get idLocalActivo(): string {
    if (this.networkHttp && this.networkHttp.multiplayerActivo) return this.networkHttp.idLocal;
    return this.network.idLocal;
  }

  /** ¿Hay algún transporte multijugador activo (Firebase o HTTP)? */
  private get mpActivo(): boolean {
    return !!(this.network && this.network.multiplayerActivo) || !!(this.networkHttp && this.networkHttp.multiplayerActivo);
  }

  /** Difunde un mensaje de loot por todos los transportes activos. */
  private difundirLoot(msg: any): void {
    this.enviarMultiplayer(msg);
  }
  /** Suelta botín en el suelo (al morir un mob): queda como drop que se recoge al pisar. */
  soltarBotin(f: number, c: number, veces: number = 1 + Math.floor(Math.random() * 2), oro: number = 0): void {
    const botin = elegirBotin(Math.random, veces);
    if (oro > 0) botin.push({ id: 'oro', cantidad: oro });
    for (const b of botin) {
      this.dropsSuelo.push({ f, c, id: b.id, cantidad: b.cantidad });
      this.difundirLoot({ tipo: 'loot_spawn', f, c, id: b.id, cantidad: b.cantidad });
    }
    this.registrarEventoLog(`¡Botín en el suelo (${f},${c}): ${botin.map((b) => ITEMS[b.id]?.nombre ?? b.id).join(', ')}!`);
  }

  /** Apertura bump-to-open: solo el protagonista, llave reutilizable, oro directo. */
  private intentarAbrirCofre(f: number, c: number, id: string): void {
    const celda = this.mapaLaberinto[f]?.[c];
    if (!celda?.cofre) return;
    const tipo = celda.cofre;
    if (celda.cofreAbierto) {
      this.registrarEventoLog('El cofre ya está abierto.');
      return;
    }
    if (!puedeAbrirCofre(tipo, this.protagonista.inventario)) {
      this.registrarEventoLog(`Cofre de ${tipo} cerrado: necesitas la llave de ${tipo}.`);
      return;
    }
    const delta = this.construirDelta(f, c, { tipo: 'cofre', abierto: true }, id);
    if (!this.aplicarDeltaAutorizado(delta)) return;
    const oro = oroDeCofre(tipo);
    this.protagonista.recibirBotin([{ id: 'oro', cantidad: oro }]);
    this.renderer.invalidarCacheLaberinto();
    this.enviarMultiplayer({ tipo: 'cofre_abierto', f, c, tick: delta.tick });
    this.guardarSesionActual();
    this.registrarEventoLog(`¡Cofre de ${tipo} abierto! +${oro} monedas.`);
    if (document.getElementById('equipoModal')?.style.display === 'flex') this.lobbyManager.renderEquipo();
  }

  /** F3: el Balrog suelta la llave de titanio como celda persistente (no drop volátil). */
  private soltarLlaveTitanio(enemigo: EnemigoNPC): void {
    if (enemigo.llaveSoltada) return;
    enemigo.llaveSoltada = true;
    const pos = elegirCeldaParaLlave(this.mapaLaberinto, enemigo.fila, enemigo.columna);
    if (!pos) {
      this.protagonista.recibirBotin([{ id: 'llave_titanio', cantidad: 1 }]);
      this.registrarEventoLog('¡El Balrog suelta la llave de titanio! (directa al inventario)');
      return;
    }
    const delta = this.construirDelta(pos.fila, pos.columna, { tipo: 'objeto', campo: 'llave', valor: 'titanio' }, this.idLocalActivo);
    if (!this.aplicarDeltaAutorizado(delta)) {
      this.protagonista.recibirBotin([{ id: 'llave_titanio', cantidad: 1 }]);
      this.registrarEventoLog('¡El Balrog suelta la llave de titanio! (directa al inventario)');
      return;
    }
    this.renderer.invalidarCacheLaberinto();
    this.enviarMultiplayer({ tipo: 'llave_soltada', f: pos.fila, c: pos.columna, tick: delta.tick });
    this.registrarEventoLog('¡El Balrog suelta la llave de titanio!');
  }

  /** F3: solo el lado autoritativo decide el drop del boss (host o solo). */
  private alMorirEnemigo(enemigo: EnemigoNPC): void {
    if (enemigo.tipo !== 'Balrog') return;
    if (!this.esHost && this.mpActivo) return;
    this.soltarLlaveTitanio(enemigo);
  }

  /** Recoge los drops de una celda (solo el protagonista). */
  recogerDropsEn(f: number, c: number, entidad: any): void {    if (entidad !== this.protagonista) return;
    const aqui = this.dropsSuelo.filter((d) => d.f === f && d.c === c);
    if (aqui.length === 0) return;
    this.dropsSuelo = this.dropsSuelo.filter((d) => !(d.f === f && d.c === c));
    this.difundirLoot({ tipo: 'loot_picked', f, c });
    this.protagonista.recibirBotin(aqui.map((d) => ({ id: d.id, cantidad: d.cantidad })));
    this.guardarSesionActual();
    this.registrarEventoLog(`Recogido: ${aqui.map((d) => `${ITEMS[d.id]?.nombre ?? d.id}${d.cantidad > 1 ? ' ×' + d.cantidad : ''}`).join(', ')}`);
    if (document.getElementById('equipoModal')?.style.display === 'flex') this.lobbyManager.renderEquipo();
  }

  /** Objetivo visible más cercano para una flecha (fog del cliente que dispara). */
  private elegirObjetivoFlecha(emisor: any, ahora: number): any | null {
      let target: any = null;
      let minDist = Infinity;
      this.listaDeEnemigos.forEach(e => {
          if (!e.estaVivo) return;
          const celda = this.mapaLaberinto[e.fila]?.[e.columna];
          const visible = !!celda && celda.ultimoAvistamiento > 0 && (ahora - celda.ultimoAvistamiento < this.config.TIEMPO_DESVANECIMIENTO_NIEBLA);
          if (!visible) return;
          const dist = Math.sqrt(Math.pow(e.fila - emisor.fila, 2) + Math.pow(e.columna - emisor.columna, 2));
          if (dist < minDist) {
              minDist = dist;
              target = e;
          }
      });
      return target;
  }

  lanzarArco(emisor: any, esLocal: boolean, objetivoId?: number) {
      const ahora = Date.now();
      const cooldown = (10 / emisor.agilidad) * 1000;

      if (esLocal && emisor === this.protagonista) {
          if (ahora - emisor.ultimaVezHabilidad.bow < cooldown) return;
          // Munición: el arco consume flechas de la mochila.
          if (!this.protagonista.consumirFlecha()) {
              this.registrarEventoLog('Sin flechas: no puedes disparar.');
              return;
          }
          emisor.ultimaVezHabilidad.bow = ahora;

          if (this.mpActivo) {
              // El cliente que dispara elige el objetivo con SU niebla; el host
              // recibe el id y aplica el daño sin depender de su propia visión.
              const objetivo = this.elegirObjetivoFlecha(emisor, ahora);
              if (!objetivo) {
                  this.registrarEventoLog('Sin objetivo a la vista.');
                  return;
              }
              const accion = { tipo: 'bow', targetId: objetivo.id };
              if (this.esHost) {
                  this.colaAcciones.push({ id: this.idLocalActivo, accion });
              } else {
                  this.enviarMultiplayer({ tipo: 'action', accion });
              }
              return;
          }
      }

      // Lógica de disparo
      let target: any = null;
      if (objetivoId !== undefined) {
          target = this.listaDeEnemigos.find(e => e.id === objetivoId && e.estaVivo) ?? null;
      }
      if (!target) target = this.elegirObjetivoFlecha(emisor, ahora);

      if (target) {
          this.bolasDeFuego.push({
              x: emisor.columna,
              y: emisor.fila,
              targetX: target.columna,
              targetY: target.fila,
              targetRef: target,
              pct: 0,
              speed: 0.05,
              aplicarDano: this.esHost || !this.mpActivo,
              color: "#aaa",
              esFlecha: true
          });
          this.registrarEventoLog(`¡${emisor.nombre} dispara una flecha!`);

          if (this.esHost && this.mpActivo) {
              this.enviarMultiplayer({
                  tipo: 'arrow_spawn',
                  id: emisor === this.protagonista ? this.idLocalActivo : (emisor as any).id ?? null,
                  ex: emisor.columna,
                  ey: emisor.fila,
                  tx: target.columna,
                  ty: target.fila
              });
          }
      }
  }

  crearComidaHabilidad(emisor: any, esLocal: boolean) {
      const ahora = Date.now();
      const cooldown = (10 / emisor.inteligencia) * 1000;

      if (esLocal && emisor === this.protagonista) {
          if (ahora - emisor.ultimaVezHabilidad.food < cooldown) return;
          emisor.ultimaVezHabilidad.food = ahora;

          if (this.mpActivo) {
              if (this.esHost) {
                  this.colaAcciones.push({ id: this.idLocalActivo, accion: { tipo: 'create_food' } });
              } else {
                  this.enviarMultiplayer({ tipo: 'action', accion: { tipo: 'create_food' } });
              }
              return;
          }
      }

      if (!this.esHost && this.mpActivo) return;

      let f: number, c: number;
      let intentos = 0;
      const dimsSpawn = this.dimsActivo();
      do {
          const dist = Math.floor(Math.random() * 3) + 1;
          const angle = Math.random() * Math.PI * 2;
          f = Math.round(emisor.fila + Math.sin(angle) * dist);
          c = Math.round(emisor.columna + Math.cos(angle) * dist);
          intentos++;
      } while (
          (f < 0 || f >= dimsSpawn.filas || c < 0 || c >= dimsSpawn.columnas ||
          !this.mapaLaberinto[f][c].esTransitable || this.mapaLaberinto[f][c].alimento) && intentos < 20
      );

      if (f >= 0 && f < dimsSpawn.filas && c >= 0 && c < dimsSpawn.columnas && this.mapaLaberinto[f][c].esTransitable) {
          const alimentos = [
              { tipo: "Manzana", pc: 5 }, { tipo: "Plátano", pc: 8 }, { tipo: "Kiwi", pc: 10 },
              { tipo: "Brócoli", pc: 25 }, { tipo: "Muslo de pollo", pc: 35 }, { tipo: "Chuleta", pc: 40 },
              { tipo: "Pescado", pc: 70 }
          ];
          const alimento = alimentos[Math.floor(Math.random() * alimentos.length)];
          const deltaComida = this.construirDelta(f, c, { tipo: 'objeto', campo: 'alimento', valor: alimento }, (emisor as any).id || this.idLocalActivo);
          this.aplicarDeltaAutorizado(deltaComida);
          this.registrarEventoLog(`${emisor.nombre} ha creado ${alimento.tipo}.`);
          this.ui.crearTextoFlotanteEnCelda(f, c, "¡COMIDA!", "#ffcc00", this);

          if (this.esHost && this.mpActivo) {
              this.enviarMultiplayer({
                  tipo: 'object_spawned',
                  f, c, a: alimento,
                  tick: deltaComida.tick
              });
          }
      }
  }

  lanzarRadar(emisor: any, esLocal: boolean) {
    const ahora = Date.now();
    const cooldown = ((30 * 2 / (emisor.agilidad + (2 * emisor.inteligencia))) + 5) * 1000;

    if (esLocal && emisor === this.protagonista) {
        if (ahora - emisor.ultimaVezHabilidad.radar < cooldown) return;
        emisor.ultimaVezHabilidad.radar = ahora;

        if (this.mpActivo) {
            if (this.esHost) {
                this.colaAcciones.push({ id: this.idLocalActivo, accion: { tipo: 'radar' } });
            } else {
                this.enviarMultiplayer({ tipo: 'action', accion: { tipo: 'radar' } });
            }
            return;
        }
    }

    const radarObj: any = {
        x: emisor.columna,
        y: emisor.fila,
        inicio: ahora,
        duracion: 5000,
        respuestas: [],
        idEmisor: emisor.id || (this.network ? this.idLocalActivo : 'unknown')
    };

    // Identificar hasta 5 NPCs o personajes cercanos
    const entidades: {f: number, c: number, npc: boolean}[] = [];

    // NPCs
    this.listaDeEnemigos.forEach(e => {
        if (e.estaVivo) {
            const dist = Math.sqrt(Math.pow(e.fila - emisor.fila, 2) + Math.pow(e.columna - emisor.columna, 2));
            entidades.push({ f: e.fila, c: e.columna, npc: true, dist } as any);
        }
    });

    // Jugadores
    if (this.protagonista !== emisor) {
        const dist = Math.sqrt(Math.pow(this.protagonista.fila - emisor.fila, 2) + Math.pow(this.protagonista.columna - emisor.columna, 2));
        entidades.push({ f: this.protagonista.fila, c: this.protagonista.columna, npc: false, dist } as any);
    }
    if (this.network && this.remotosActivos) {
        this.remotosActivos.forEach((j: any) => {
            if (j.entidad && j.entidad !== emisor) {
                const dist = Math.sqrt(Math.pow(j.entidad.fila - emisor.fila, 2) + Math.pow(j.entidad.columna - emisor.columna, 2));
                entidades.push({ f: j.entidad.fila, c: j.entidad.columna, npc: false, dist } as any);
            }
        });
    }

    entidades.sort((a: any, b: any) => a.dist - b.dist);
    radarObj.respuestas = entidades.slice(0, 5);

    this.radares.push(radarObj);

    if (this.esHost && this.mpActivo) {
        this.enviarMultiplayer({
            tipo: 'radar_spawn',
            x: emisor.columna,
            y: emisor.fila,
            respuestas: radarObj.respuestas,
            idEmisor: radarObj.idEmisor
        });
    }
  }

  generarEscenarioDinamicoDemo() {
      // Demo: Colocar algunas puertas y trampas cerca del inicio
      for (let i = 0; i < 5; i++) {
          let f, c;
          do {
              f = Math.floor(Math.random() * this.config.NUMERO_FILAS);
              c = Math.floor(Math.random() * this.config.NUMERO_COLUMNAS);
          } while (!this.mapaLaberinto[f][c].esTransitable);

          // §3b: toda mutación de tipoEscenario/estadoEscenario va por delta
          // (árbitro + persistencia + política de dueño); prohibido escribir la celda a mano.
          if (i < 3) {
              this.aplicarDeltaAutorizado(
                  this.construirDelta(f, c, { tipo: 'escenario', tipoEscenario: 'puerta', estado: 'cerrada' }, this.idLocalActivo),
              );
          } else {
              this.aplicarDeltaAutorizado(
                  this.construirDelta(f, c, { tipo: 'escenario', tipoEscenario: 'trampa', estado: 'inactiva' }, this.idLocalActivo),
              );
          }
      }
  }

  verificarPortal(entidad: any) {
    // Host-authoritative (post-aceptación 2): solo la entidad local del lado
    // autoritativo conmuta el mundo. Una entidad remota (invitada) o un NPC que
    // pisa el portal del host NO atraviesan: el anfitrión cruza y el reenvío
    // (reenviarEstadoAInvitados) lleva a los invitados al nuevo nodo. Sin esto,
    // un paso remoto conmutaba el nodo activo global con el host quieto
    // (niebla negra, fundido y conmutaciones en ping-pong que crasheaban el loop).
    if (this.esLadoAutoritativo() && entidad !== this.protagonista) {
        this.registrarEventoLog(`${entidad?.nombre ?? 'Entidad'} pisó el portal; el anfitrión debe cruzar primero.`);
        return;
    }
    const conector = this.gestorMundo.nodoActivoId
        ? this.gestorMundo.conectorEn(entidad.fila, entidad.columna)
        : null;
    if (conector) {
        // Las costuras continuas no teletransportan: el cruce lo resuelve
        // `intentarCruzarCostura` al moverse hacia fuera del borde.
        if (conector.lado) return;
        this.atravesarConector(entidad, conector);
        return;
    }
    this.teleportarPortalClasico(entidad);
  }

  /**
   * Cruce continuo: la entidad está en la celda de un conector con `lado` y se
   * mueve hacia fuera. Devuelve true si el cruce se realizó.
   */
  private intentarCruzarCostura(entidad: IEntidadRPG, df: number, dc: number): boolean {
    const activoId = this.gestorMundo.nodoActivoId;
    if (!activoId) return false;
    const conector = this.gestorMundo.conectorEn(entidad.fila, entidad.columna);
    if (!conector || !conector.lado || conector.nodoOrigenId !== activoId) return false;

    const tOrigen = this.gestorMundo.transformAbsoluto(activoId);
    const destino = this.gestorMundo.asegurarNodoDestino(conector.id);
    const tDestino = this.gestorMundo.transformAbsoluto(destino.id);
    const target = celdaDestinoEnCostura(conector, tOrigen, tDestino, df, dc, {
      filas: destino.filas,
      columnas: destino.columnas,
    });
    if (!target) return false;
    const celda = destino.celdas[target.fila]?.[target.columna];
    if (!celda?.esTransitable) return false;

    const nodoSalienteId = activoId;
    const worldFila = tOrigen.df + entidad.visualFila;
    const worldColumna = tOrigen.dc + entidad.visualColumna;
    const fotoEnemigos = this.fotografiarEnemigos();

    this.gestorMundo.activarNodo(destino.id);
    this.marcarNodoDescubierto(destino.id);
    entidad.fila = target.fila;
    entidad.columna = target.columna;
    // Posición visual de mundo continua: el render la dibuja con el transform
    // del nuevo nodo, así que no hay salto de cámara.
    entidad.visualFila = worldFila - tDestino.df;
    entidad.visualColumna = worldColumna - tDestino.dc;
    this.recogerDropsEn(target.fila, target.columna, entidad);
    this.aplicarEfectosCruce(nodoSalienteId, fotoEnemigos, entidad);
    this.registrarEventoLog(`${entidad.nombre} ha cruzado una costura.`);
    return true;
  }

  /** Efectos compartidos por teletransporte y costura: enemigos, caché, red y UI. */
  private aplicarEfectosCruce(
    nodoSalienteId: string | null,
    fotoEnemigos: EnemigoFoto[] | null,
    entidad: any,
  ): void {
    this.invalidarPortalesHousing();
    this.renderer.invalidarCacheLaberinto();
    // Fase 2: los enemigos son por-nodo y persistentes. La foto se toma antes
    // de cambiar de nodo (lista activa = nodo saliente).
    if (this.listaDeEnemigos.length > 0) {
        this.listaDeEnemigos = [];
    }
    if (nodoSalienteId) {
        this.conmutarSnapshotEnemigos(nodoSalienteId, fotoEnemigos);
        this.espejoEnemigosCasa(nodoSalienteId, fotoEnemigos);
    }
    if (entidad === this.protagonista) {
        this.enviarMultiplayer({
            tipo: 'posicion',
            f: entidad.fila, c: entidad.columna, cam: false,
            id: this.idLocalActivo, nick: this.protagonista.nombre,
            hp: this.protagonista.vidaActual, maxHp: this.protagonista.vidaMaxima,
            oro: this.protagonista.inventario.oro ?? 0,
            xp: this.protagonista.puntosExperiencia,
            bajas: this.protagonista.bajas,
        });
        this.actualizarPanelAcciones();
    }
  }

  private atravesarConector(entidad: any, conector: ConectorMundo): void {
    const nodoSalienteId = this.gestorMundo.nodoActivoId;
    let aparicion: { fila: number; columna: number };
    try {
        aparicion = this.gestorMundo.atravesar(conector.id);
    } catch (e) {
        console.warn(`No se pudo atravesar el conector ${conector.id}; se usa el portal clásico.`, e);
        this.teleportarPortalClasico(entidad);
        return;
    }
    this.marcarNodoDescubierto(this.gestorMundo.nodoActivoId);
    this.iniciarFundido();
    const fotoEnemigos = this.fotografiarEnemigos();
    entidad.fila = aparicion.fila;
    entidad.columna = aparicion.columna;
    entidad.visualFila = aparicion.fila;
    entidad.visualColumna = aparicion.columna;
    this.registrarEventoLog(`${entidad.nombre} ha atravesado un portal.`);
    this.aplicarEfectosCruce(nodoSalienteId, fotoEnemigos, entidad);
    if (entidad === this.protagonista) {
        this.ui.crearTextoFlotanteEnCelda(aparicion.fila, aparicion.columna, "¡PORTAL!", "#0000ff", this);
    }
  }

  /** Foto fiel de la lista activa (id/fila/columna/nombre/tipo/vidas); null salvo lado autoritativo con lista no vacía. */
  private fotografiarEnemigos(): EnemigoFoto[] | null {
    // Sin Firebase el espejo local usa esta foto para la casa (solo); el destino
    // de la conmutación solo lo restaura la vía Firestore (conmutarSnapshotEnemigos).
    if (!this.esLadoAutoritativo() || this.listaDeEnemigos.length === 0) {
        return null;
    }
    return this.listaDeEnemigos.map((e) => ({
        id: String(e.id),
        fila: e.fila,
        columna: e.columna,
        nombre: e.nombre,
        tipo: e.tipo,
        vidaActual: e.vidaActual,
        vidaMaxima: e.vidaMaxima,
    }));
  }

  /** Persiste la foto del nodo saliente y restaura la lista del destino desde su snapshot (async, patrón handler 'enemigos'). */
  private conmutarSnapshotEnemigos(nodoSalienteId: string, fotoEnemigos: EnemigoFoto[] | null): void {
    if (!this.esHost) return;
    // El destino se captura de forma síncrona: no depende de ningún await.
    const destinoId = this.gestorMundo.nodoActivoId;
    if (!destinoId) return;
    const persistencia = this.persistenciaMundo;
    if (!persistencia) {
        // HTTP/manual: no hay historia persistida que rehidratar, pero el nodo
        // destino ya está materializado y el invitado debe recibirlo igual. En
        // microtask para que atravesarConector termine de mover al protagonista.
        queueMicrotask(() => this.reenviarEstadoAInvitados());
        return;
    }
    void (async () => {
        try {
            // La foto escribe en el nodo saliente fijo (datos capturados de forma síncrona): sin carrera.
            if (fotoEnemigos && fotoEnemigos.length > 0) {
                await persistencia.guardarSnapshotParcial(nodoSalienteId, { enemigos: fotoEnemigos });
            }
            const persistido = await persistencia.cargarNodo(destinoId);
            // Doble cruce rápido (A->B->C / A->B->A): si el nodo activo ya no es el
            // destino de ESTA conmutación, la lista activa la gobierna la conmutación
            // más reciente; restaurar aquí pisaría con una foto ajena.
            if (this.gestorMundo.nodoActivoId !== destinoId) return;
            // I1: la historia persistida del destino (celdas plegadas + deltas por
            // tick) se aplica sobre el nodo ya materializado por gen, ANTES de que
            // cualquier observador/envío (enviarMapaAlInvitado, sync periódica de
            // objetos) lo vea: el invitado debe recibir la casa ya editada. Sin
            // persistenciaMundo (solo) la casa la cubre el espejo local: no se duplica.
            rehidratarNodoTrasCruce(this.gestorMundo, destinoId, persistido);
            const fotoDestino = leerSnapshotNodo(persistido?.snapshot);
            // M3: la foto del destino se acota a las dims del nodo activo; los
            // enemigos fuera de rejilla se descartan (no se inventa posición).
            if (fotoDestino.enemigos) {
                this.listaDeEnemigos = restaurarEnemigos(
                    fotoDestino,
                    (d) => this.reconstruirEnemigo(d),
                    this.dimsActivo(),
                );
            }
            // Post-aceptación: el invitado recibe 'mapa' SOLO al join. Si el host
            // atraviesa a otro nodo, su rejilla quedaría vieja (p. ej. casa 9×16)
            // y el sync por red traería enemigos con coordenadas del destino
            // (mundo 60×60) => crash en EnemigoNPC.puedeAtravesar. Con el nodo ya
            // rehidratado se reenvía el estado completo SIEMPRE (con o sin foto:
            // el mapa del nodo cambió igual), y con la guard de arriba una
            // conmutación más reciente manda aquí.
            this.reenviarEstadoAInvitados();
        } catch (e) {
            console.warn('No se pudo sincronizar el snapshot de enemigos entre nodos.', e);
        }
    })();
  }

  /** Reconstrucción exacta de un enemigo desde su foto (constructor de fase 1 + vidas + setupEntity); los muertos siguen muertos. */
  private reconstruirEnemigo(d: EnemigoFoto): EnemigoNPC {
    const idNumerico = Number(d.id);
    const id = Number.isFinite(idNumerico) && String(idNumerico) === d.id ? idNumerico : (d.id as unknown as number);
    const e = new EnemigoNPC(d.fila, d.columna, d.nombre, d.tipo, id, this.config.dificultad);
    e.vidaActual = d.vidaActual;
    e.vidaMaxima = d.vidaMaxima;
    if (d.vidaActual <= 0) {
        e.estaVivo = false;
    }
    this.setupEntity(e);
    return e;
  }

  private teleportarPortalClasico(entidad: any): void {
    const fila = this.mapaLaberinto[entidad.fila];
    if (fila === undefined || fila[entidad.columna] === undefined) return;
    const celda = fila[entidad.columna];
    if (celda.esPortal) {
        const todosLosPortales: {f: number, c: number}[] = [];
        const dimsPortales = this.dimsActivo();
        for (let f = 0; f < dimsPortales.filas; f++) {
            for (let c = 0; c < dimsPortales.columnas; c++) {
                if (this.mapaLaberinto[f][c].esPortal && (f !== entidad.fila || c !== entidad.columna)) {
                    todosLosPortales.push({ f, c });
                }
            }
        }
        if (todosLosPortales.length > 0) {
            const dest = todosLosPortales[Math.floor(Math.random() * todosLosPortales.length)];
            entidad.fila = dest.f;
            entidad.columna = dest.c;
            entidad.visualFila = dest.f;
            entidad.visualColumna = dest.c;
            this.registrarEventoLog(`${entidad.nombre} ha atravesado un portal.`);
            if (entidad === this.protagonista) {
                this.ui.crearTextoFlotanteEnCelda(dest.f, dest.c, "¡PORTAL!", "#0000ff", this);
                this.enviarMultiplayer({
                    tipo: 'posicion',
                    f: dest.f, c: dest.c, cam: false,
                    id: this.idLocalActivo, nick: this.protagonista.nombre,
                    hp: this.protagonista.vidaActual, maxHp: this.protagonista.vidaMaxima,
                    oro: this.protagonista.inventario.oro ?? 0,
                    xp: this.protagonista.puntosExperiencia,
                    bajas: this.protagonista.bajas,
                });
            }
        }
    }
  }

  obtenerEnemigoAMostrar() {
    return this.listaDeEnemigos.find(e => e.enCombateCon === this.protagonista) ||
           this.listaDeEnemigos.filter(e => {
               const fila = this.mapaLaberinto[e.fila];
               return e.estaVivo && fila !== undefined && fila[e.columna] !== undefined && fila[e.columna].ultimoAvistamiento > 0;
           }).sort((a,b) => a.fila - b.fila)[0];
  }

  iniciarCombate(atacante: any, objetivo: any) {
    atacante.enCombateCon = objetivo;
    objetivo.enCombateCon = atacante;
    this.registrarEventoLog(`¡Combate: ${atacante.nombre} vs ${objetivo.nombre}!`);
    this.resolverRondaDeCombate(atacante, objetivo);
  }

  actualizarCooldownsUI() {
    if (!this.protagonista || !this.protagonista.estaVivo) return;

    const ahora = Date.now();
    const p = this.protagonista;

    const skills = [
        { id: 'btnFireballAction', last: p.ultimaVezHabilidad.fireball, cd: (30 / p.inteligencia) * 1000 },
        { id: 'btnBowAction', last: p.ultimaVezHabilidad.bow, cd: (10 / p.agilidad) * 1000 },
        { id: 'btnCreateFoodAction', last: p.ultimaVezHabilidad.food, cd: (10 / p.inteligencia) * 1000 },
        { id: 'btnRadarAction', last: p.ultimaVezHabilidad.radar, cd: ((30 * 2 / (p.agilidad + (2 * p.inteligencia))) + 5) * 1000 },
        { id: 'btnWhirlwindAction', last: p.ultimaVezHabilidad.whirlwind, cd: (90 / p.fuerza) * 1000 },
        { id: 'btnFreezeAction', last: p.ultimaVezHabilidad.freeze, cd: (120 / p.inteligencia) * 1000 }
    ];

    skills.forEach(skill => {
        const btn = document.getElementById(skill.id);
        if (btn) {
            const transcurrido = ahora - skill.last;
            const overlay = btn.querySelector('.cooldown-overlay') as HTMLElement;

            if (transcurrido < skill.cd) {
                btn.classList.add('disabled');
                btn.classList.add('charging');
                if (overlay) {
                    const pct = (transcurrido / skill.cd) * 100;
                    overlay.style.width = `${pct}%`;
                }
            } else {
                btn.classList.remove('disabled');
                btn.classList.remove('charging');
                if (overlay) overlay.style.width = '0%';
            }
        }
    });
  }

  resolverRondaDeCombate(pA: any, pB: any) {
    const iA = pA.obtenerIniciativa();
    const iB = pB.obtenerIniciativa();
    const order = iA >= iB ? [pA, pB] : [pB, pA];
    order.forEach((l, i) => {
        if (!l.estaVivo) return;
        const o = order[1 - i];
        if (!o.estaVivo) return;
        const vA = l.generarAtaque() + (l === this.protagonista ? (l.danoArma() - l.penalizacion().ataque) : 0);
        const vD = o.generarDefensa();
        let d = Math.max(0, vA - vD);

        // Sobrecarga: el protagonista sobrecargado recibe más daño.
        if (o === this.protagonista) d += this.protagonista.penalizacion().defensa;

        // Inmunidad en modo debug para el protagonista
        if (o === this.protagonista && this.config.vistaDebugActivada) {
            d = 0;
        }

        // F4: quien está en la celda de salida es inmune.
        if (this.mapaLaberinto[o.fila]?.[o.columna]?.esSalida) {
            d = 0;
        }

        o.recibirDano(d);
        this.registrarEventoLog(`${l.nombre} -> ${o.nombre} (-${d} HP)`);
        if (!o.estaVivo) {
            this.registrarEventoLog(`${o.nombre} derrotado.`);
            l.enCombateCon = null;
            if (o === this.protagonista) {
                if (!this.mpActivo) this.juegoTerminado = true;
            } else if (l === this.protagonista) {
                this.protagonista.puntosExperiencia += o.puntosExperiencia;
                this.protagonista.bajas += 1;
                this.registrarEventoLog(`¡Has ganado ${o.puntosExperiencia} XP!`);
                const xpVal = document.getElementById('xpVal');
                if (xpVal) xpVal.textContent = this.protagonista.puntosExperiencia.toString();
                this.soltarBotin(o.fila, o.columna, undefined, sortearOro(o.tipo));
            }
            if (o.tipo === 'Balrog') this.alMorirEnemigo(o as EnemigoNPC);
        }
    });
  }

  intentarRehuirCombate(l: any) {
    const o = l.enCombateCon;
    if (!o) return true;
    const tP = Math.floor(Math.random() * 10) + 1 + l.agilidad;
    const tO = Math.floor(Math.random() * 10) + 1 + o.agilidad;
    if (tP > tO) {
        this.registrarEventoLog(`${l.nombre} escapó.`);
        l.enCombateCon = null;
        o.enCombateCon = null;
        return true;
    } else {
        this.registrarEventoLog(`${l.nombre} falló al escapar.`);
        this.resolverRondaDeCombate(o, l);
        return false;
    }
  }

  procesarMensajeMultiplayer(msg: any, idEmisor: string) {
    if (typeof msg?.tipo === 'string' && msg.tipo.startsWith('trade_')) {
      this.procesarMensajeTrade(msg, idEmisor);
      return;
    }
    const idSujeto = msg.id || (idEmisor === 'host' ? this.network.idRealDelHost : idEmisor) || idEmisor;
    switch (msg.tipo) {
        case 'action':
            if (this.esHost) {
                // Usamos idEmisor directamente para evitar spoofing de identidad
                this.colaAcciones.push({ id: idEmisor, accion: msg.accion });
            }
            break;
        case 'arrow_spawn':
            if (!this.esHost) {
                const emisorA = this.obtenerEntidadPorId(idSujeto);
                if (emisorA) emisorA.setEstado('attacking', 800);
                if (this.bolasDeFuego.length < 50) {
                    const esPropio = msg.id === this.idLocalActivo;
                    this.bolasDeFuego.push({
                        x: esPropio ? this.protagonista.columna : msg.ex,
                        y: esPropio ? this.protagonista.fila : msg.ey,
                        targetX: msg.tx,
                        targetY: msg.ty,
                        pct: 0,
                        speed: 0.05,
                        aplicarDano: false,
                        color: "#aaa",
                        esFlecha: true
                    });
                }
            }
            break;
        case 'freeze_spawn':
            if (!this.esHost) {
                if (this.freezes.length < 50) {
                    this.freezes.push({
                        x: msg.x,
                        y: msg.y,
                        radio: msg.r,
                        inicio: Date.now(),
                        duracion: msg.d
                    });
                }
            }
            break;
        case 'whirlwind_spawn':
            if (!this.esHost) {
                const emisorW = this.obtenerEntidadPorId(idSujeto);
                if (emisorW) emisorW.setEstado('attacking', 800);
                if (this.whirlwinds.length < 50) {
                    this.whirlwinds.push({
                        x: msg.x,
                        y: msg.y,
                        inicio: Date.now(),
                        duracion: 800
                    });
                }
            }
            break;
        case 'object_spawned':
            if (this.esHost) this.enviarMultiplayer(msg, idEmisor);
            if (!this.esHost) {
                // Delta del mundo (§3a): pasa sin gate de burbuja; mandan árbitro y dueño.
                if (msg.a) {
                    this.aplicarDeltaAutorizado(this.construirDelta(msg.f, msg.c, { tipo: 'objeto', campo: 'alimento', valor: msg.a }, idEmisor, typeof msg.tick === 'number' ? msg.tick : null));
                }
                this.ui.crearTextoFlotanteEnCelda(msg.f, msg.c, "¡COMIDA!", "#ffcc00", this);
            }
            break;
        case 'snapshot':
            if (!this.esHost) {
                msg.entities.forEach((entData: any) => {
                    if (entData.isNpc) {
                        const npc = this.listaDeEnemigos.find(e => (e as any).id === entData.id);
                        if (npc) {
                            npc.fila = entData.f;
                            npc.columna = entData.c;
                            npc.vidaActual = entData.v;
                            npc.vidaMaxima = entData.vm;
                            npc.estaVivo = entData.viva;
                            if (entData.est) npc.estadoActual = entData.est;
                            if (entData.fr !== undefined) npc.frameActual = entData.fr;
                        }
                    } else {
                        if (entData.id === this.idLocalActivo) {
                            // Snap-back corregido: solo corregir si la discrepancia es significativa
                            // o si el Host insiste en una posición diferente durante un tiempo.
                            // Por ahora usamos un umbral de 1.1 tiles para permitir predicción local.
                            const dist = Math.sqrt(Math.pow(this.protagonista.fila - entData.f, 2) + Math.pow(this.protagonista.columna - entData.c, 2));
                            if (dist > 1.1) {
                                this.protagonista.fila = entData.f;
                                this.protagonista.columna = entData.c;
                            }

                            this.protagonista.vidaActual = entData.v;
                            this.protagonista.vidaMaxima = entData.vm;
                            this.protagonista.estaVivo = entData.viva;
                            this.protagonista.estaCaminando = entData.cam;
                        } else {
                            let rem = this.remotosActivos.get(entData.id);
                            if (!rem) {
                                // Crear entrada si no existe (para otros invitados o host recién identificado)
                                rem = { pc: null as any, dc: null as any, entidad: null, unsubscribes: [] };
                                this.remotosActivos.set(entData.id, rem);
                            }

                            if (rem && rem.entidad) {
                                rem.entidad.fila = entData.f;
                                rem.entidad.columna = entData.c;
                                rem.entidad.vidaActual = entData.v;
                                rem.entidad.vidaMaxima = entData.vm;
                                rem.entidad.estaVivo = entData.viva;
                                rem.entidad.estaCaminando = entData.cam;
                                rem.entidad.nombre = entData.nick;
                                if (entData.clase) rem.entidad.clase = entData.clase;
                                if (entData.est) rem.entidad.estadoActual = entData.est;
                                if (entData.fr !== undefined) rem.entidad.frameActual = entData.fr;
                            } else if (rem) {
                                rem.entidad = new JugadorRemoto(entData.f, entData.c, entData.nick, entData.id);
                                if (entData.clase) rem.entidad.clase = entData.clase;
                                this.setupEntity(rem.entidad);
                            }
                        }
                    }
                });
            }
            break;
        case 'radar_spawn':
            if (!this.esHost) {
                if (this.radares.length < 20) {
                    this.radares.push({
                        x: msg.x,
                        y: msg.y,
                        inicio: Date.now(),
                        duracion: 5000,
                        respuestas: msg.respuestas,
                        idEmisor: msg.idEmisor
                    });
                }
            }
            break;
        case 'handshake':
            this.registrarEventoLog(`[net] handshake de ${idEmisor} (esHost=${this.esHost})`);
            let realId = idSujeto;

            // Coop manual: la conexión nació bajo `GUEST_*`; al llegar el
            // handshake migramos la entrada al id real y enrutamos el alias
            // para que los mensajes del DataChannel sigan encontrándola.
            if (this.esHost && this.modoMultijugador === 'manual' && this.network && idEmisor !== realId) {
                const provisional = this.network.jugadoresRemotos.get(idEmisor);
                if (provisional) {
                    this.network.jugadoresRemotos.delete(idEmisor);
                    const existente = this.network.jugadoresRemotos.get(realId);
                    if (existente?.entidad) provisional.entidad = existente.entidad;
                    this.network.jugadoresRemotos.set(realId, provisional);
                    this.network.aliasRemoto.set(idEmisor, realId);
                }
            }

            const esHandshakeDelHost = !this.esHost && (
                (this.hostConocidoId !== null && realId === this.hostConocidoId) ||
                (this.hostConocidoId === null && idEmisor === 'host' && !this.remotosActivos.has(realId))
            );

            if (esHandshakeDelHost) {
                const hostInfo = this.remotosActivos.get('host');
                if (hostInfo) {
                    this.remotosActivos.delete('host');
                    this.remotosActivos.set(realId, hostInfo);
                    this.network.idRealDelHost = realId;
                    this.network.aliasRemoto.set('host', realId);
                }
                this.hostConocidoId = realId;
                this.hostNick = msg.nick || this.hostNick;
                if (typeof msg.hostEpoch === 'number') {
                    this.hostEpoch = msg.hostEpoch;
                    this.network.hostEpoch = msg.hostEpoch;
                    if (this.networkHttp) this.networkHttp.hostEpoch = msg.hostEpoch;
                }
                this.actualizarIndicadorHost();
            }

            if (!this.remotosActivos.has(realId)) {
                const pc: any = null;
                const dc: any = null;
                this.remotosActivos.set(realId, { pc, dc, entidad: null, unsubscribes: [] });
            }
            const jInfo = this.remotosActivos.get(realId)!;
            if (!jInfo.entidad) {
                jInfo.entidad = new JugadorRemoto(0, 0, msg.nick, idSujeto);
                if (msg.clase) jInfo.entidad.clase = msg.clase;
                jInfo.entidad.apariencia = aplicarAparienciaRemota(jInfo.entidad.apariencia, msg.apariencia, jInfo.entidad.clase);
                if (msg.stats) {
                    jInfo.entidad.fuerza = msg.stats.fue;
                    jInfo.entidad.agilidad = msg.stats.agi;
                    jInfo.entidad.inteligencia = msg.stats.int;
                    jInfo.entidad.vidaMaxima = Math.floor(10 * ((jInfo.entidad.fuerza * 2 + jInfo.entidad.agilidad) / 3));
                    jInfo.entidad.vidaActual = jInfo.entidad.vidaMaxima;
                }
                this.setupEntity(jInfo.entidad);
            }
            (jInfo.entidad as any).playerId = msg.playerId || (jInfo.entidad as any).playerId || realId;
            (jInfo.entidad as any).esHost = esHandshakeDelHost || (jInfo.entidad as any).esHost === true;

            if (this.esHost) {
                // Notificar a otros y responder al nuevo con nuestro handshake
                this.enviarMultiplayer({ ...msg, id: idSujeto }, realId);

                // Forzar envío de nuestro handshake al que acaba de llegar (por si su canal abrió después que el nuestro)
                const hostStats = { fue: this.protagonista.fuerza, agi: this.protagonista.agilidad, int: this.protagonista.inteligencia };
                const target = this.remotosActivos.get(realId);
                if (target && target.dc && target.dc.readyState === "open") {
                    target.dc.send(JSON.stringify({
                        tipo: 'handshake',
                        nick: this.protagonista.nombre,
                        id: this.idLocalActivo,
                        playerId: this.playerId,
                        hostEpoch: this.hostEpoch,
                        esHost: true,
                        clase: this.protagonista.clase,
                        stats: hostStats,
                        apariencia: aparienciaEfectiva(this.protagonista.clase, this.protagonista.apariencia)
                    }));
                }
            } else {
                const stats = { fue: this.protagonista.fuerza, agi: this.protagonista.agilidad, int: this.protagonista.inteligencia };
                this.enviarMultiplayer({
                    tipo: 'handshake_ack', nick: this.protagonista.nombre,
                    id: this.idLocalActivo, playerId: this.playerId, hostEpoch: this.hostEpoch, stats,
                });
                this.registrarEventoLog('[net] respondido handshake_ack');
            }
            break;
        case 'loot_spawn': {
            if (!this.dropsSuelo.some((d) => d.f === msg.f && d.c === msg.c && d.id === msg.id)) {
                this.dropsSuelo.push({ f: msg.f, c: msg.c, id: msg.id, cantidad: msg.cantidad ?? 1 });
            }
            break;
        }
        case 'loot_picked': {
            this.dropsSuelo = this.dropsSuelo.filter((d) => !(d.f === msg.f && d.c === msg.c));
            break;
        }
        case 'loot_sync': {
            if (Array.isArray(msg.lista)) {
                this.dropsSuelo = msg.lista.map((d: any) => ({ f: d.f, c: d.c, id: d.id, cantidad: d.cantidad ?? 1 }));
            }
            break;
        }

        case 'avatar': {
            const avInfo = this.remotosActivos.get(idSujeto);
            if (avInfo && avInfo.entidad) {
                avInfo.entidad.apariencia = aplicarAparienciaRemota(avInfo.entidad.apariencia, msg.apariencia, avInfo.entidad.clase || 'guerrero');
                const inv = sanearEquipoGuardado(msg.inventario);
                if (inv) avInfo.entidad.inventario = inv;
            } else {
                this.registrarEventoLog(`Avatar recibido sin entidad (${idSujeto}); ignorado.`);
            }
            break;
        }
        case 'handshake_ack':
            if (this.esHost) {
                const jInfoAck = this.remotosActivos.get(idSujeto);
                if (jInfoAck && jInfoAck.entidad) {
                    jInfoAck.entidad.nombre = msg.nick;
                    (jInfoAck.entidad as any).playerId = msg.playerId || (jInfoAck.entidad as any).playerId || idSujeto;
                    if (msg.stats) {
                        jInfoAck.entidad.fuerza = msg.stats.fue;
                        jInfoAck.entidad.agilidad = msg.stats.agi;
                        jInfoAck.entidad.inteligencia = msg.stats.int;
                        jInfoAck.entidad.vidaMaxima = Math.floor(10 * ((jInfoAck.entidad.fuerza * 2 + jInfoAck.entidad.agilidad) / 3));
                        jInfoAck.entidad.vidaActual = jInfoAck.entidad.vidaMaxima;
                    }
                }
                this.enviarMapaAlInvitado(idSujeto);
                this.registrarEventoLog('Invitado listo; enviando mundo.');
            }
            this.actualizarIndicadorHost();
            break;
        case 'mundo': {
            this.mundoRemotoCompacto = true;
            this.ambienteRemoto = msg.ambiente === 'casa' ? 'casa' : 'dungeon';
            const offsetPrevio = this.renderer.obtenerOffsetCamaraMundo(
                this.worldDesdeCeldaActiva(this.protagonista.visualFila, this.protagonista.visualColumna),
                this.config,
            );
            const nodoAnterior = this.gestorMundo.mundo.get(this.gestorMundo.nodoActivoId) ?? null;
            const dims = this.aplicarMundoRemoto(msg);
            this.marcarNodoDescubierto(this.gestorMundo.nodoActivoId);
            this.config.NUMERO_FILAS = dims.filas;
            this.config.NUMERO_COLUMNAS = dims.columnas;
            if (msg.dificultad) this.config.dificultad = msg.dificultad;
            this.ajustarDimensiones();
            this.renderer?.invalidarCacheLaberinto();
            this.mundoDelHostRecibido = true;
            if (msg.continuo && nodoAnterior && !this.gestorMundo.mundo.has(nodoAnterior.id)) {
                this.gestorMundo.mundo.set(nodoAnterior.id, nodoAnterior);
            }
            if (msg.continuo) {
                this.transicionCamara = { desde: offsetPrevio, inicio: performance.now(), duracion: 400 };
            } else {
                this.transicionCamara = null;
            }
            this.registrarEventoLog('Mundo compacto del host recibido.');
            break;
        }
        case 'mapa': {
            this.mundoRemotoCompacto = false;
            this.ambienteRemoto = msg.ambiente === 'casa' ? 'casa' : 'dungeon';
            const offsetPrevio = this.renderer.obtenerOffsetCamaraMundo(
                this.worldDesdeCeldaActiva(this.protagonista.visualFila, this.protagonista.visualColumna),
                this.config,
            );
            const nodoAnterior = this.gestorMundo.mundo.get(this.gestorMundo.nodoActivoId) ?? null;
            const dims = this.aplicarMapaRemoto(msg);
            this.marcarNodoDescubierto(this.gestorMundo.nodoActivoId);
            this.config.NUMERO_FILAS = dims.filas;
            this.config.NUMERO_COLUMNAS = dims.columnas;
            if (msg.dificultad) this.config.dificultad = msg.dificultad;
            this.ajustarDimensiones();
            this.renderer?.invalidarCacheLaberinto();
            this.mundoDelHostRecibido = true;
            if (msg.continuo && nodoAnterior && !this.gestorMundo.mundo.has(nodoAnterior.id)) {
                // Conservar el nodo anterior mientras corte el viewport para que
                // la cámara interpolada muestre la costura.
                this.gestorMundo.mundo.set(nodoAnterior.id, nodoAnterior);
            }
            if (msg.continuo) {
                this.transicionCamara = { desde: offsetPrevio, inicio: performance.now(), duracion: 400 };
            } else {
                this.transicionCamara = null;
            }
            this.registrarEventoLog(msg.continuo ? 'Mapa continuo del host recibido.' : 'Mapa del host recibido.');
            break;
        }
        case 'enemigos':
            // Defensa (post-aceptación): coordenadas de otro nodo (join o re-sync
            // en vuelo con la rejilla aún sin redimensionar) no se construyen; el
            // re-sync completo ('mapa' + 'enemigos') las traerá en su mundo correcto.
            this.listaDeEnemigos = msg.lista.filter((d: any) => {
                if (this.fueraDeRejillaActiva(d.f, d.c)) {
                    console.warn(`Enemigo ${d.n} (${d.f},${d.c}) fuera de la rejilla activa; descartado hasta el re-sync.`);
                    return false;
                }
                return true;
            }).map((d: any) => {
                const e = new EnemigoNPC(d.f, d.c, d.n, d.t, d.id, this.config.dificultad);
                e.vidaActual = d.v; e.vidaMaxima = d.vm;
                this.setupEntity(e);
                return e;
            });
            break;
        case 'objetos':
            // Si es una actualización, primero limpiamos objetos existentes para que el Host sea la verdad absoluta
            if (msg.is_update) {
                for (let f = 0; f < this.config.NUMERO_FILAS; f++) {
                    for (let c = 0; c < this.config.NUMERO_COLUMNAS; c++) {
                        const celda = this.mapaLaberinto[f][c];
                        celda.alimento = null;
                        celda.tienePico = false;
                        // Burbujas y portales suelen ser estáticos, pero por consistencia:
                        celda.burbuja = null;
                        celda.esPortal = false;
                    }
                }
            }
            msg.lista.forEach((o: any) => {
                const celda = this.mapaLaberinto[o.f][o.c];
                celda.alimento = o.a;
                celda.burbuja = o.b;
                celda.tienePico = o.p || false;
                celda.esPortal = o.pr || false;
            });
            this.renderer?.invalidarCacheLaberinto();
            if (!this.motorIniciado) {
                this.mundoSincronizado = true;
                this.ui.ocultarLobby();
                this.iniciarMotorJuego();
            }
            break;
        case 'food_consumed':
            if (this.esHost) this.enviarMultiplayer(msg, idEmisor);
            // Delta del mundo (§3a): sin gate de burbuja; mandan árbitro y dueño.
            this.aplicarDeltaAutorizado(this.construirDelta(msg.f, msg.c, { tipo: 'objeto', campo: 'alimento', valor: null }, idEmisor, typeof msg.tick === 'number' ? msg.tick : null));
            this.renderer?.invalidarCacheLaberinto();
            break;
        case 'pick_collected':
            if (this.esHost) this.enviarMultiplayer(msg, idEmisor);
            // Delta del mundo (§3a): sin gate de burbuja; mandan árbitro y dueño.
            this.aplicarDeltaAutorizado(this.construirDelta(msg.f, msg.c, { tipo: 'objeto', campo: 'tienePico', valor: false }, idEmisor, typeof msg.tick === 'number' ? msg.tick : null));
            this.renderer?.invalidarCacheLaberinto();
            break;
        case 'shield_collected':
            if (this.esHost) this.enviarMultiplayer(msg, idEmisor);
            // Delta del mundo (§3a): sin gate de burbuja; mandan árbitro y dueño.
            this.aplicarDeltaAutorizado(this.construirDelta(msg.f, msg.c, { tipo: 'objeto', campo: 'burbuja', valor: null }, idEmisor, typeof msg.tick === 'number' ? msg.tick : null));
            this.renderer?.invalidarCacheLaberinto();
            break;
        case 'cofre_abierto':
            if (this.esHost) this.enviarMultiplayer(msg, idEmisor);
            this.aplicarDeltaAutorizado(this.construirDelta(msg.f, msg.c, { tipo: 'cofre', abierto: true }, idEmisor, typeof msg.tick === 'number' ? msg.tick : null));
            this.renderer?.invalidarCacheLaberinto();
            break;
        case 'llave_recogida':
            if (this.esHost) this.enviarMultiplayer(msg, idEmisor);
            this.aplicarDeltaAutorizado(this.construirDelta(msg.f, msg.c, { tipo: 'objeto', campo: 'llave', valor: null }, idEmisor, typeof msg.tick === 'number' ? msg.tick : null));
            this.renderer?.invalidarCacheLaberinto();
            break;
        case 'llave_soltada':
            if (this.esHost) this.enviarMultiplayer(msg, idEmisor);
            this.aplicarDeltaAutorizado(this.construirDelta(msg.f, msg.c, { tipo: 'objeto', campo: 'llave', valor: 'titanio' }, idEmisor, typeof msg.tick === 'number' ? msg.tick : null));
            this.renderer?.invalidarCacheLaberinto();
            break;
        case 'dig_completed':
            if (this.esHost) this.enviarMultiplayer(msg, idEmisor);
            // Delta del mundo (§3a): sin gate de burbuja; mandan árbitro y dueño.
            this.aplicarDeltaAutorizado(this.construirDelta(msg.f, msg.c, { tipo: 'cavar' }, idEmisor, typeof msg.tick === 'number' ? msg.tick : null));
            this.renderer?.invalidarCacheLaberinto();
            if (msg.fromF !== undefined && msg.fromC !== undefined) {
                eliminarMurosEntre(this.mapaLaberinto[msg.fromF][msg.fromC], this.mapaLaberinto[msg.f][msg.c]);
            }
            break;
        case 'force_teleport':
            if (msg.id === this.idLocalActivo) {
                if (msg.nodo && msg.nodo !== this.gestorMundo.nodoActivoId) {
                    this.registrarEventoLog("La guardia te llamó desde otro nodo; no se aplicó el salto.");
                    break;
                }
                this.protagonista.fila = msg.f;
                this.protagonista.columna = msg.c;
                this.protagonista.visualFila = msg.f;
                this.protagonista.visualColumna = msg.c;
                this.protagonista.estaCaminando = false;
                this.protagonista.estadoActual = 'idle';
                this.colaAcciones = this.colaAcciones.filter((a) => a.id !== this.idLocalActivo);
                this.registrarEventoLog("¡Has sido llamado a la guardia!");
            }
            break;
        case 'request_guard_teleport':
            if (this.esHost) {
                const emisorEntidad = this.obtenerEntidadPorId(idEmisor);
                if (emisorEntidad) this.teletransportarAliados(emisorEntidad, false);
            }
            break;
        case 'posicion':
            const jPos = this.remotosActivos.get(idSujeto);
            if (jPos && jPos.entidad) {
                jPos.entidad.fila = msg.f;
                jPos.entidad.columna = msg.c;
                jPos.entidad.estaCaminando = msg.cam;
                if (msg.hp !== undefined) {
                    jPos.entidad.vidaActual = msg.hp;
                    jPos.entidad.vidaMaxima = msg.maxHp;
                    jPos.entidad.estaVivo = msg.hp > 0;
                }
                if (msg.est !== undefined) {
                    jPos.entidad.estadoActual = msg.est;
                }
                if (msg.fr !== undefined) {
                    jPos.entidad.frameActual = msg.fr;
                }
                if (msg.oro !== undefined) (jPos.entidad as any).oro = msg.oro;
                if (msg.xp !== undefined) jPos.entidad.puntosExperiencia = msg.xp;
                if (msg.bajas !== undefined) jPos.entidad.bajas = msg.bajas;
            }
            if (this.esHost) this.enviarMultiplayer({ ...msg, id: idSujeto }, idEmisor);
            break;
        case 'chat':
            this.ui.manejarMensajeChat(msg.nick || "Desconocido", msg.texto, false, this, idSujeto);
            if (this.esHost) this.enviarMultiplayer({ ...msg, id: idSujeto }, idEmisor);
            break;
        case 'hp_loss':
            if (msg.id === this.idLocalActivo) {
                this.protagonista.vidaActual = Math.max(0, this.protagonista.vidaActual - msg.amount);
            } else {
                const target = this.remotosActivos.get(msg.id);
                if (target && target.entidad) {
                    target.entidad.vidaActual = Math.max(0, target.entidad.vidaActual - msg.amount);
                    this.ui.crearTextoFlotanteEnCelda(target.entidad.fila, target.entidad.columna, `-${msg.amount} HP`, "#ff0000", this);
                }
            }
            if (this.esHost) this.enviarMultiplayer({ ...msg }, idEmisor);
            break;
        case 'npc_update': {
            const npc = this.listaDeEnemigos.find(e => e.id === msg.id);
            // Defensa (post-aceptación): no mover un NPC a coordenadas de otro nodo.
            if (npc && !this.fueraDeRejillaActiva(msg.f, msg.c)) {
                npc.fila = msg.f; npc.columna = msg.c; npc.vidaActual = msg.v;
                if (npc.vidaActual <= 0) npc.estaVivo = false;
            }
            break;
        }
        case 'npc_damaged_by_guest':
            if (this.esHost) {
                const targetNpc = this.listaDeEnemigos.find(e => e.id === msg.id);
                if (targetNpc) {
                    targetNpc.recibirDano(msg.dano);
                    if (!targetNpc.estaVivo) this.alMorirEnemigo(targetNpc);
                }
            }
            break;
        case 'progreso': {
            const jProg = this.remotosActivos.get(idSujeto);
            if (jProg?.entidad) {
                (jProg.entidad as any).oro = msg.oro;
                jProg.entidad.puntosExperiencia = msg.xp;
                jProg.entidad.bajas = msg.bajas;
                const pid = (jProg.entidad as any).playerId || idSujeto;
                this.progresoSala[pid] = {
                    playerId: pid,
                    nick: jProg.entidad.nombre,
                    oro: msg.oro ?? 0,
                    xp: msg.xp ?? 0,
                    bajas: msg.bajas ?? 0,
                };
            }
            break;
        }
        case 'espera':
            this.esperaInfo = { total: msg.total, esperando: msg.esperando };
            break;
        case 'victoria':
            this.registrarEventoLog(`${msg.nick} ha llegado a la salida.`);
            break;
        case 'fin_partida':
            this.resultados = msg.resultados ?? [];
            this.esperaInfo = null;
            this.juegoTerminado = true;
            break;
        case 'host_migration_trigger':
            this.registrarEventoLog(`Iniciando migración de Host (Razón: ${msg.reason})`);
            this.iniciarEleccionHost();
            break;
        case 'spawn':
            this.protagonista.fila = msg.f;
            this.protagonista.columna = msg.c;
            this.protagonista.visualFila = msg.f;
            this.protagonista.visualColumna = msg.c;
            this.asustarMonstruosCercanos(msg.f, msg.c);
            break;
        case 'fireball_spawn':
            if (!this.esHost) {
                const emisorF = this.obtenerEntidadPorId(idSujeto);
                if (emisorF) emisorF.setEstado('attacking', 800);
                if (this.bolasDeFuego.length < 50) {
                    this.bolasDeFuego.push({
                        x: msg.ex,
                        y: msg.ey,
                        targetX: msg.tx,
                        targetY: msg.ty,
                        pct: 0,
                        aplicarDano: false,
                        color: msg.c
                    });
                }
            }
            break;
        case 'npc_sync_all':
            msg.lista.forEach((d: any) => {
                const npcSync = this.listaDeEnemigos.find(e => e.id === d.id);
                // Defensa (post-aceptación): el sync del host puede tener coords de
                // otro nodo mientras llega el re-sync; no mover fuera de rejilla.
                if (npcSync && !this.fueraDeRejillaActiva(d.f, d.c)) {
                    npcSync.fila = d.f;
                    npcSync.columna = d.c;
                    npcSync.vidaActual = d.v;
                    npcSync.vidaMaxima = d.vm;
                    npcSync.estaVivo = npcSync.vidaActual > 0;
                }
            });
            break;
    }
  }

  // ─── Comercio F1 (trueque host-autoritativo) — ver spec-1-trade-v1 ────────

  public gestorTrueques: GestorTrueques = new GestorTrueques();
  public truequeUI: TruequeUI = new TruequeUI();
  /** Mi cesta en la ventana de trueque (estado de UI; el protocolo la envía íntegra). */
  private truequeCesta: CestaTrade = [];
  /** id del que me invitó (para ACEPTAR/RECHAZAR la invitación). */
  private truequeInvitador: string | null = null;
  /** ¿Ya pulsé CONFIRMAR en la ventana actual? (se anula si el otro cambia su cesta). */
  private truequeConfirmeYo: boolean = false;

  /** Bulto con UNA copia retirada por cada id equipado (superset: el bulto incluye lo puesto). */
  private bultoLibre(): string[] {
    const libres = [...this.protagonista.bulto];
    for (const id of Object.values(this.protagonista.equipo)) {
      if (!id) continue;
      const idx = libres.indexOf(id);
      if (idx >= 0) libres.splice(idx, 1);
    }
    return libres;
  }

  /** Stock disponible de un id para ofertar (excluye lo equipado). */
  private stockTradeDe(id: string): number {
    const item = (ITEMS as Record<string, any>)[id];
    if (!item) return 0;
    return item.tipo === 'equipo'
      ? this.bultoLibre().filter((x) => x === id).length
      : (this.protagonista.inventario[id] ?? 0);
  }

  /** Envía un mensaje de trade según rol: host lo arbitra en local; guest lo difunde. */
  private enviarTradeUI(msj: Record<string, unknown>): void {
    const completo = { ...msj, de: this.idLocalActivo };
    if (!this.mpActivo) {
      this.registrarEventoLog('[trueque] sin multijugador activo');
      return;
    }
    if (this.esHost) this.procesarMensajeTrade(completo, this.idLocalActivo);
    else this.enviarMultiplayer(completo);
  }

  /** Entrada de la UI: OPCIONES → COMERCIAR → INVITAR a un remoto. */
  truequeInvitar(destino: string): void {
    this.truequeSociosToggle(false);
    this.enviarTradeUI({ tipo: 'trade_invite', destino });
  }

  private truequeSociosToggle(abierto: boolean): void {
    const cont = document.getElementById('truequeSocios');
    if (cont) cont.style.display = abierto ? 'flex' : 'none';
  }

  /** Pinta la lista de socios en OPCIONES. */
  truequeSociosRender(): void {
    const cont = document.getElementById('truequeSocios');
    if (!cont) return;
    cont.innerHTML = '';
    if (this.remotosActivos.size === 0) {
      const vacio = document.createElement('div');
      vacio.className = 'trueque-socio';
      vacio.textContent = '(sin jugadores conectados)';
      cont.appendChild(vacio);
      return;
    }
    for (const [id, remoto] of this.remotosActivos) {
      const fila = document.createElement('div');
      fila.className = 'trueque-socio';
      const nombre = document.createElement('span');
      nombre.textContent = remoto.entidad?.nombre ?? id;
      const btn = document.createElement('button');
      btn.textContent = 'INVITAR';
      btn.addEventListener('click', () => this.truequeInvitar(id));
      fila.appendChild(nombre);
      fila.appendChild(btn);
      cont.appendChild(fila);
    }
  }

  /** Difunde mi cesta actual (trade_offer) para que la vea el socio. */
  private truequeOfertar(): void {
    this.enviarTradeUI({
      tipo: 'trade_offer',
      da: this.truequeCesta,
      export: this.protagonista.exportarInventario(),
    });
  }

  /** Conecta los callbacks de la ventana de trueque (llamar en setup). */
  conectarTruequeUI(): void {
    this.truequeUI.conectar();
    this.truequeUI.onOfrecer = (id) => {
      const item = (ITEMS as Record<string, any>)[id];
      if (!item) return;
      if (item.tipo !== 'equipo' && !(this.protagonista.inventario[id] ?? 0)) return;
      const libresDelId = this.bultoLibre().filter((x) => x === id).length;
      if (item.tipo === 'equipo' && libresDelId === 0) return;
      this.truequeCesta = anadirLinea(this.truequeCesta, id, 1, this.stockTradeDe(id));
      this.truequeUI.setCestaMia(this.truequeCesta);
      this.truequeOfertar();
    };
    this.truequeUI.onMenos = (id) => {
      const idx = this.truequeCesta.findIndex((l) => l.id === id);
      if (idx < 0) return;
      const restante = this.truequeCesta[idx].cantidad - 1;
      if (restante <= 0) {
        this.truequeCesta = this.truequeCesta.filter((l) => l.id !== id);
      } else {
        this.truequeCesta = this.truequeCesta.map((l) => (l.id === id ? { id: l.id, cantidad: restante } : l));
      }
      this.truequeUI.setCestaMia(this.truequeCesta);
      this.truequeOfertar();
    };
    this.truequeUI.onQuitar = (id) => {
      this.truequeCesta = this.truequeCesta.filter((l) => l.id !== id);
      this.truequeUI.setCestaMia(this.truequeCesta);
      this.truequeOfertar();
    };
    this.truequeUI.onConfirmar = () => {
      this.enviarTradeUI({
        tipo: 'trade_confirm',
        da: this.truequeCesta,
        pide: this.truequeUI.con ? (this.cestaOtraVista() ?? []) : [],
        export: this.protagonista.exportarInventario(),
      });
      this.truequeConfirmeYo = true;
      this.truequeUI.setEstado('propio-confirmado');
    };
    this.truequeUI.onCancelar = () => {
      this.enviarTradeUI({ tipo: 'trade_cancel' });
      this.truequeUI.cerrar();
      this.truequeCesta = [];
      this.truequeInvitador = null;
    };
    this.truequeUI.onAceptarInvitacion = () => {
      this.enviarTradeUI({ tipo: 'trade_accept' });
      const con = this.truequeInvitador;
      this.truequeInvitador = null;
      if (con) {
        this.truequeCesta = [];
        this.truequeUI.abrir(con);
        this.truequeUI.renderMio(this.bultoLibre(), this.inventarioSinCesta());
      }
    };
    this.truequeUI.onRechazarInvitacion = () => {
      this.enviarTradeUI({ tipo: 'trade_cancel' });
      this.truequeUI.cerrar();
      this.truequeInvitador = null;
    };
  }

  /** Cesta visible del socio (la última que su oferta mostró). */
  private cestaOtraVista(): CestaTrade | null {
    return this.truequeCestaSocio;
  }
  private truequeCestaSocio: CestaTrade | null = null;

  /** Mochila con pilas (sin transformaciones: la cesta se valida al aplicar). */
  private inventarioSinCesta(): Record<string, number> {
    return { ...this.protagonista.inventario };
  }

  /** Ruta de los mensajes trade_*: el host arbitra; trade_apply lo aplica cualquiera. */
  procesarMensajeTrade(msg: any, idEmisor: string): void {
    const tipo: string = msg.tipo;
    if (tipo === 'trade_apply') {
      // Resultado autoritativo difundido por el host: aplico mi parte y pongo al día la del otro.
      const idLocal = this.idLocalActivo;
      if (msg.a === idLocal && msg.invA) {
        this.protagonista.importarInventario(msg.invA);
        this.registrarEventoLog('[trueque] aplicado a tu personaje');
      }
      if (msg.b === idLocal && msg.invB) {
        this.protagonista.importarInventario(msg.invB);
        this.registrarEventoLog('[trueque] aplicado a tu personaje');
      }
      const idOtro = msg.a === idLocal ? msg.b : (msg.b === idLocal ? msg.a : null);
      const invOtro = msg.a === idLocal ? msg.invB : (msg.b === idLocal ? msg.invA : null);
      if (idOtro && invOtro) {
        const remoto = this.remotosActivos.get(idOtro);
        const inv = sanearEquipoGuardado(invOtro);
        if (remoto?.entidad && inv) remoto.entidad.inventario = inv;
      }
      this.truequeUI.cerrar();
      this.truequeCesta = [];
      this.truequeInvitador = null;
      this.truequeConfirmeYo = false;
      return;
    }
    if (tipo === 'trade_state') { this.procesarTradeStateUI(msg); return; } // estado: UI en ambos roles

    // Arbitraje (solo host): dominio F1 intacto.
    if (this.mpActivo && this.esHost) {
      const efectos = this.gestorTrueques.procesar(msg, idEmisor, (id) => this.exportTradeDe(id));
      for (const efecto of efectos) {
        if (efecto.tipo === 'relay') {
          this.enviarTradeA(efecto.para, efecto.msj);
          // El host como socio: los relays a sí mismo (p.ej. confirmada_uno) van a su UI.
          if (efecto.para === this.idLocalActivo && efecto.msj.tipo === 'trade_state') {
            this.procesarTradeStateUI(efecto.msj);
          }
        }
        else this.aplicarTruequeEnHost(efecto.idA, efecto.idB);
      }
      this.gestorTrueques.limpiarTerminados();
    }

    // Espejo de UI (guest y host como socio): mensajes dirigidos a mí.
    const de = typeof msg.de === 'string' && msg.de ? msg.de : idEmisor;
    switch (tipo) {
      case 'trade_invite': {
        // Directo (host como destino): trae destino. Reelayado (guest destino): solo trae `de`.
        const destino = typeof msg.destino === 'string' ? msg.destino : '';
        const dirigidoAMi = destino === this.idLocalActivo || (!destino && de !== this.idLocalActivo);
        if (dirigidoAMi && !this.truequeUI.visible()) {
          this.ventanaInvitacionDesde(de);
        }
        break;
      }
      case 'trade_accept': {
        // Yo invité: el socio aceptó → abro mi ventana de trueque.
        if (de !== this.idLocalActivo && !this.truequeUI.visible() && !this.truequeInvitador && this.mpActivo) {
          this.truequeInvitador = null;
          this.truequeCesta = [];
          this.truequeUI.abrir(de);
          this.truequeUI.renderMio(this.bultoLibre(), { ...this.protagonista.inventario });
          this.truequeUI.setCestaMia(this.truequeCesta);
        }
        break;
      }
      case 'trade_offer': {
        if (de === this.idLocalActivo) break;
        const cesta = sanearCesta(msg.da);
        if (this.truequeUI.con === de) {
          // Si el otro cambió su cesta tras mi confirm, la mía queda sin valor:
          // vuelvo a propuesta para reconsentir.
          if (this.truequeConfirmeYo) {
            this.truequeConfirmeYo = false;
            this.truequeUI.setEstado('propuesta');
            this.registrarEventoLog('[trueque] la oferta del otro cambió: confirma de nuevo');
          }
          this.truequeCestaSocio = cesta;
          this.truequeUI.setCestaOtro(cesta);
        } else if (!this.truequeUI.visible() && !this.truequeInvitador && this.mpActivo) {
          // Oferta de quien yo invité (o flujo directo): abro la ventana.
          this.truequeInvitador = null;
          this.truequeCesta = [];
          this.truequeUI.abrir(de);
          this.truequeUI.renderMio(this.bultoLibre(), { ...this.protagonista.inventario });
          this.truequeUI.setCestaMia(this.truequeCesta);
          this.truequeCestaSocio = cesta;
          this.truequeUI.setCestaOtro(cesta);
        }
        break;
      }
      case 'trade_cancel': {
        if (de !== this.idLocalActivo && this.truequeUI.visible() && this.truequeUI.con === de) {
          this.truequeUI.cerrar();
          this.truequeCesta = [];
          this.truequeConfirmeYo = false;
          this.registrarEventoLog('[trueque] cancelado por el otro jugador');
        }
        break;
      }
      default: break;
    }
  }

  /** trade_state → efectos de la ventana (guests y socio). */
  private procesarTradeStateUI(msg: any): void {
    const estado = typeof msg.estado === 'string' ? msg.estado : '';
    if (estado === 'confirmada_uno') {
      if (this.truequeUI.visible()) this.truequeUI.setEstado('otro-confirmado');
      return;
    }
    if (estado === 'ocupado') {
      if (this.truequeUI.visible()) this.truequeUI.setEstado('ocupado');
      else this.registrarEventoLog('[trueque] el otro está ocupado en otro trueque');
      return;
    }
    if (estado === 'cancelada') {
      if (this.truequeUI.visible()) {
        this.truequeUI.cerrar();
        this.truequeCesta = [];
        this.truequeConfirmeYo = false;
      }
      this.registrarEventoLog('[trueque] trueque cancelado');
    }
  }

  /** Muestra la ventana de invitación (quien RECIBE el invite). */
  private ventanaInvitacionDesde(idInvitador: string): void {
    this.truequeInvitador = idInvitador;
    const nick = this.remotosActivos.get(idInvitador)?.entidad?.nombre ?? 'Un jugador';
    this.truequeUI.abrirInvitacion(idInvitador, nick);
  }

  /** Exportación saneada del estado que el host conoce de un jugador. */
  private exportTradeDe(id: string): InventarioGuardado | null {
    if (id === this.idLocalActivo) return sanearEquipoGuardado(this.protagonista.exportarInventario());
    const remoto = this.remotosActivos.get(id);
    return remoto?.entidad?.inventario ?? null;
  }

  /** Envío unicast a un remoto concreto (el efecto relay dice a quién). */
  private enviarTradeA(para: string, msj: Record<string, unknown>): void {
    const remoto = this.remotosActivos.get(para);
    if (remoto && remoto.dc && remoto.dc.readyState === 'open') {
      remoto.dc.send(JSON.stringify(msj));
    }
  }

  /**
   * Efecto 'aplicar': valida con los estados reales y ejecuta. OK → actualiza
   * al host (si es parte) y difunde `trade_apply`; fallo → `trade_state cancelada`.
   */
  private aplicarTruequeEnHost(idA: string, idB: string): void {
    const trade = this.gestorTrueques.par(clavePar(idA, idB));
    if (!trade || !trade.ofertaA || !trade.ofertaB) return;
    // Fuente de verdad (D2): la exportación fresca traída por cada confirm;
    // el host usa su estado real; si falta, último estado remoto conocido.
    const exportA = idA === this.idLocalActivo
      ? sanearEquipoGuardado(this.protagonista.exportarInventario())
      : (trade.exportA ?? this.exportTradeDe(idA));
    const exportB = idB === this.idLocalActivo
      ? sanearEquipoGuardado(this.protagonista.exportarInventario())
      : (trade.exportB ?? this.exportTradeDe(idB));
    if (!exportA || !exportB) {
      this.enviarTradeA(idA, { tipo: 'trade_state', estado: 'cancelada' });
      this.enviarTradeA(idB, { tipo: 'trade_state', estado: 'cancelada' });
      return;
    }
    const estadoA = this.estadoParteDe(idA, exportA);
    const estadoB = this.estadoParteDe(idB, exportB);
    if (!estadoA || !estadoB) {
      this.enviarTradeA(idA, { tipo: 'trade_state', estado: 'cancelada' });
      this.enviarTradeA(idB, { tipo: 'trade_state', estado: 'cancelada' });
      return;
    }
    // Consentimiento real = el `da` de cada parte: la `pide` se deriva del `da`
    // actual del otro (evita pides congelados desfasados entre confirmaciones).
    const ofertaA = { ...trade.ofertaA, pide: trade.ofertaB.da };
    const ofertaB = { ...trade.ofertaB, pide: trade.ofertaA.da };
    const resultado = aplicarIntercambio(ofertaA, ofertaB, estadoA, estadoB);
    if (!resultado) {
      this.enviarTradeA(idA, { tipo: 'trade_state', estado: 'cancelada', motivo: 'trueque inválido al aplicar' });
      this.enviarTradeA(idB, { tipo: 'trade_state', estado: 'cancelada', motivo: 'trueque inválido al aplicar' });
      this.registrarEventoLog('[trueque] cancelado: validación al aplicar falló');
      return;
    }
    // Estado final de cada parte (el puesto/equipo no cambia en el trueque).
    const invA: InventarioGuardado = {
      formato: 1,
      puesto: exportA.puesto,
      bulto: resultado.a.bulto,
      mochila: resultado.a.inventario,
    };
    const invB: InventarioGuardado = {
      formato: 1,
      puesto: exportB.puesto,
      bulto: resultado.b.bulto,
      mochila: resultado.b.inventario,
    };
    // Host como parte: aplica su estado directamente (antes de difundir).
    if (idA === this.idLocalActivo) this.protagonista.importarInventario(invA);
    if (idB === this.idLocalActivo) this.protagonista.importarInventario(invB);
    if (idA === this.idLocalActivo || idB === this.idLocalActivo) {
      this.truequeUI.cerrar();
      this.truequeCesta = [];
      this.truequeInvitador = null;
      this.truequeConfirmeYo = false;
    }
    // Vista remota del host: el nuevo estado de cada parte para efectos visuales/F2.
    const remA = this.remotosActivos.get(idA);
    if (idA !== this.idLocalActivo && remA?.entidad) remA.entidad.inventario = invA;
    const remB = this.remotosActivos.get(idB);
    if (idB !== this.idLocalActivo && remB?.entidad) remB.entidad.inventario = invB;
    this.enviarTradeA(idA, { tipo: 'trade_apply', a: idA, invA, b: idB, invB });
    this.enviarTradeA(idB, { tipo: 'trade_apply', a: idA, invA, b: idB, invB });
    this.registrarEventoLog('[trueque] aplicado y difundido');
  }

  /** Estado (equipo/bulto/mochila/fuerza) de un jugador según id. */
  private estadoParteDe(id: string, exportado: InventarioGuardado): EstadoParte | null {
    if (id === this.idLocalActivo) {
      const bonos = bonosEquipo(this.protagonista.equipo);
      return {
        equipo: this.protagonista.equipo,
        bulto: [...this.protagonista.bulto],
        inventario: { ...this.protagonista.inventario },
        fuerza: this.protagonista.fuerza + bonos.fuerza,
      };
    }
    const remoto = this.remotosActivos.get(id);
    if (!remoto?.entidad) return null;
    const base = remoto.entidad;
    const fuerzaBase = typeof (base as any).fuerza === 'number' ? (base as any).fuerza : 10;
    const bonosR = bonosEquipo(exportado.puesto);
    return {
      equipo: exportado.puesto,
      bulto: [...exportado.bulto],
      inventario: { ...exportado.mochila },
      fuerza: fuerzaBase + bonosR.fuerza,
    };
  }

  /** Desconexión: cierra todo trueque del que el id forme parte (efectos limpios). */
  cancelarTruequesDe(id: string): void {
    const efectos = this.gestorTrueques.cancelarPorId(id);
    this.gestorTrueques.limpiarTerminados();
    for (const efecto of efectos) {
      if (efecto.tipo === 'relay') this.enviarTradeA(efecto.para, efecto.msj);
    }
    if (this.truequeUI.visible() && (this.truequeUI.con === id || this.truequeInvitador === id)) {
      this.truequeUI.cerrar();
      this.truequeCesta = [];
      this.truequeInvitador = null;
      this.truequeConfirmeYo = false;
      this.registrarEventoLog('[trueque] cerrado por desconexión');
    }
  }
}

new Game();
