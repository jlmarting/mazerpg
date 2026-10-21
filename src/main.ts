import './style.css';
import { Celda } from './world/Celda';
import { Jugador } from './entities/Jugador';
import { JugadorRemoto } from './entities/JugadorRemoto';
import { EnemigoNPC } from './entities/EnemigoNPC';
import { Renderer } from './core/Renderer';
import { UIManager } from './ui/UIManager';
import { LobbyManager, type LobbyMode } from './ui/LobbyManager';
import { FirebaseManager } from './network/FirebaseManager';
import { NetworkManager } from './network/NetworkManager';
import { NetworkManagerHttp } from './network/NetworkManagerHttp';
import { SignalingClient, crearSignalingClient, getSignalingUrl } from './network/SignalingClient';
import { eliminarMurosEntre } from './world/generation';
import { elegirCeldaLejos, elegirCeldaParaLlave } from './world/spawn';
import { serializarMapa, deserializarMapa } from './world/serialization';
import { generateSessionName } from './utils/session';
import { aparienciaEfectiva, aplicarAparienciaRemota, sanearApariencia, fichaJugador } from './core/avatarTintes';
import { bonosEquipo } from './core/equipo';
import { LLAVE_POR_COFRE, oroDeCofre, puedeAbrirCofre } from './core/tesoros';
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
import { GameConfig, IGame } from './types';
import { cargarKeybinds, guardarKeybinds, asignarTecla, accionParaTecla, KEYBINDS_DEFECTO, ACCIONES_VALIDAS, type IdAccion } from './ui/keybinds';
import { sanearPreferencia, resolverEsquema, esAcordeonMovil } from './ui/esquemaAcciones';
import {
    NUMERO_FILAS, NUMERO_COLUMNAS, TAMANO_CELDA,
    ALTO_UI_TOP, ALTO_UI_BOTTOM, RADIO_VISION,
    TIEMPO_DESVANECIMIENTO_NIEBLA
} from './world/constants';
import { dentroDeBurbuja, radioSimPorDefecto } from './world/burbuja';
import { PersistenciaMundo } from './world/PersistenciaMundo';
import { HousingLocal } from './world/housing';
import { EspejoLocal, type DocNodoLocal } from './world/espejoLocal';
import { GestorMundo } from './world/GestorMundo';
import { arrancarMundoGestor, aplicarDeltaConPersistencia, celdasCompatibilidad, rehidratarNodoTrasCruce, sembrarMundoBase, esLadoAutoritativo } from './world/integracion';
import { ArbitroDeltas } from './world/ArbitroDeltas';
import { conTickAutor, consolidarCeldasLWW, FMT_DELTA, leerSnapshotNodo, rehidratarHistoria, restaurarEnemigos, type ConectorMundo, type DeltaMundo, type EnemigoFoto, type GenSpec, type NodoMundo, type SnapshotNodo } from './world/mundo';

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
  public network: NetworkManager = new NetworkManager();
  public housing: HousingLocal;
  public signaling: SignalingClient | null = null;
  public networkHttp: NetworkManagerHttp | null = null;
  private modoMultijugador: 'firebase' | 'http' | 'manual' = 'firebase';
  public config: GameConfig = {
    NUMERO_FILAS, NUMERO_COLUMNAS, TAMANO_CELDA,
    ALTO_UI_TOP, ALTO_UI_BOTTOM, RADIO_VISION,
    radioSim: radioSimPorDefecto(RADIO_VISION),
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
  private ultimoChequeoFin: number = 0;
  private ultimoProgreso: number = 0;
  /** Mapa de teclas por acción (predeterminado 1-6 / 'e', remapeable persistente). */
  public keybinds: Record<IdAccion, string> = { ...KEYBINDS_DEFECTO };
  /** true mientras el panel ASIGNAR TECLAS espera la siguiente pulsación. */
  public capturandoTecla: boolean = false;
  public mundoSincronizado: boolean = false;
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
  private readonly FPS_UMBRAL_SEGUNDOS: number = 3;
  private diagTimer: number | null = null;
  private diagFrameCount: number = 0;
  private diagLastLog: number = 0;
  private fundidoInicio: number = Number.NEGATIVE_INFINITY;
  private readonly fundidoDuracion: number = 400;
  private tickMundo: number = 0;
  private mundoCargado: boolean = false;
  private readonly arbitroDeltas: ArbitroDeltas = new ArbitroDeltas();
  private portalesInactivosCache: Set<string> = new Set();
  private portalesInactivosRecalculadoEn: number = Number.NEGATIVE_INFINITY;
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
    // Keybinds de usuario (mazerpg.ui.keybinds); JSON corrupto o ausente → defaults.
    this.keybinds = cargarKeybinds(() => localStorage.getItem('mazerpg.ui.keybinds'));
    this.capturandoTecla = false;
    const canvas = document.getElementById('mazeCanvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.housing = new HousingLocal(this.idLocalActivo);
    this.inicializarAssets();
    this.setupEntity(this.protagonista);
    this.initMap();
    this.ajustarDimensiones();
    window.addEventListener('resize', () => {
      this.ajustarDimensiones();
      this.aplicarEsquemaUI();
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

    document.getElementById('uiSchemeSelect')?.addEventListener('change', (e) => {
      const valor = sanearPreferencia((e.target as HTMLSelectElement).value);
      localStorage.setItem('mazerpg.ui.scheme', valor);
      this.aplicarEsquemaUI();
      const esquema = resolverEsquema(valor, window.matchMedia('(pointer: coarse)').matches, window.innerWidth);
      this.registrarEventoLog(`Interfaz de acciones: ${esquema === 'dock' ? 'DOCK TÁCTIL' : 'ACORDEÓN'}`);
    });
    const selScheme = document.getElementById('uiSchemeSelect') as HTMLSelectElement | null;
    if (selScheme) selScheme.value = sanearPreferencia(localStorage.getItem('mazerpg.ui.scheme'));

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



    document.getElementById('btnProcesarResp')?.addEventListener('click', () => {
        const sdp = (document.getElementById('manualAnswerIn') as HTMLTextAreaElement).value;
        if (sdp) this.network.procesarRespuestaManual(sdp);
    });

    document.getElementById('btnProcesarOferta')?.addEventListener('click', async () => {
        const offer = (document.getElementById('manualOfferIn') as HTMLTextAreaElement).value;
        if (offer) {
            const answer = await this.network.aceptarOfertaManual(offer, this);
            (document.getElementById('manualAnswerOut') as HTMLTextAreaElement).value = answer;
            this.registrarEventoLog("Respuesta manual generada.");
            this.esHost = false;
            this.network.esHost = false;
        }
    });

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
    this.networkHttp = new NetworkManagerHttp();
    this.networkHttp.setSignaling(this.signaling);
    this.iniciarAutoAdmision();
    const hc = document.getElementById('hostControls');
    if (hc) hc.style.display = 'flex';
    this.crearPartidaHttp();
  }

  async crearPartidaHttp() {
    const nombrePartida = `Partida de ${this.protagonista.nombre}`;
    const resultado = await this.signaling!.crearPartida('', this.networkHttp!.idLocal, this.protagonista.nombre, nombrePartida);
    
    if (!resultado) {
        this.registrarEventoLog("Error: No se pudo crear la partida en el servidor HTTP.");
        alert(`No se pudo conectar al servidor local (${getSignalingUrl()}). Arranca el servidor de signaling y reintenta.`);
        return;
    }

    const partidaId = resultado.id;
    this.networkHttp!.idPartidaActual = partidaId;
    this.networkHttp!.esHost = true;
    this.networkHttp!.multiplayerActivo = true;
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
    if (!this.signaling) {
      this.iniciarModoHttp();
    }
    this.networkHttp!.idPartidaActual = id;
    this.networkHttp!.esHost = false;
    this.networkHttp!.multiplayerActivo = true;
    this.guardarSesion('guest', id);
    this.esHost = false;
    
    const roomDisp = document.getElementById('roomDisplay');
    const roomIdVal = document.getElementById('roomIdVal');
    if (roomDisp && roomIdVal) {
        roomDisp.style.display = 'block';
        roomIdVal.textContent = id;
    }
    
    this.registrarEventoLog(`Registrando en la partida ${id}...`);
    
    // Registrar guest en el servidor
    await this.signaling!.registrarGuest(id, this.networkHttp!.idLocal, this.protagonista.nombre);
    
    this.registrarEventoLog(`Esperando que el Host te acepte...`);
    await this.networkHttp!.setupWebRTCGuest(id, this);
    
    // NO iniciar motor aquí - esperar a que el canal P2P se abra
    // El Guest recibirá el mapa del Host via P2P
  }

  configurarIntervalosHostHttp() {
    this.detenerIntervalosHttp();
    this.heartbeatInterval = window.setInterval(() => {
        if (this.esHost && this.networkHttp?.idPartidaActual) {
            this.signaling!.updateHeartbeat(this.networkHttp.idPartidaActual, this.networkHttp.jugadoresRemotos.size + 1);
        }
    }, 10000);

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
    const id = generateSessionName();
    // Primero creamos; si Firebase falla (reglas/permisos), NO se crea sala ni se arranca.
    const ok = await this.firebase.crearPartida(id, this.idLocalActivo, this.protagonista.nombre);
    if (!ok) {
      this.ui.registrarLogConexion('No se pudo crear la partida en Firebase (reglas/permisos).');
      this.mostrarAvisoFirebase('⚠ No se pudo crear la partida en Firebase. Prueba el modo SERVIDOR LOCAL.');
      return;
    }
    this.network.idPartidaActual = id;
    this.persistenciaMundo = this.firebase.crearPersistenciaMundo(id);
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
    this.networkHttp = new NetworkManagerHttp();
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
      const sdp = await this.network.crearOfertaManual(this);
      (document.getElementById('manualOfferOut') as HTMLTextAreaElement).value = sdp;
      this.registrarEventoLog(`Oferta manual generada (Dificultad: ${this.config.dificultad}).`);
      this.esHost = true;
      this.network.esHost = true;
      this.iniciarMotorJuego();
  }

  async unirseAPartidaFirestore(id: string) {
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
    this.registrarEventoLog(`Uniéndote a la partida ${id}...`);
    this.network.setupWebRTCGuest(id, this);
    this.publicarFichaEnPartida();
  }

  async admitirCandidatos() {
    if (this.modoMultijugador === 'firebase') {
        this.ui.registrarLogConexion("Buscando candidatos...");
        const snapshot = await this.firebase.getDb()!.collection('partidas').doc(this.network.idPartidaActual!).collection('conexiones').get();
        snapshot.forEach((doc: any) => {
            if (doc.id !== this.idLocalActivo && !this.remotosActivos.has(doc.id)) {
                this.network.setupWebRTCHost(doc.id, this);
            }
        });
    } else if (this.modoMultijugador === 'http' && this.networkHttp) {
        // Obtener lista de Guests esperando y conectar cada uno
        const guests = await this.signaling!.getGuests(this.networkHttp.idPartidaActual!);
        for (const guest of guests) {
            if (!this.networkHttp.jugadoresRemotos.has(guest.guestId)) {
                this.ui.registrarLogConexion(`Conectando con ${guest.nick}...`);
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

  iniciarEleccionHost() {
    const misJugadores = Array.from(this.remotosActivos.keys())
        .filter(id => id !== 'host');
    misJugadores.push(this.idLocalActivo);
    misJugadores.sort();

    const candidatoId = misJugadores[0];
    if (candidatoId === this.idLocalActivo) {
        this.registrarEventoLog("Has sido elegido como nuevo Host.");
        this.promocionarAHost();
    } else {
        this.registrarEventoLog(`Esperando que ${candidatoId} tome el control como Host...`);
        this.esperarNuevoHost();
    }
  }

  esperarNuevoHost() {
    if (!this.network.idPartidaActual) return;
    const unsub = this.firebase.getDb()!.collection('partidas').doc(this.network.idPartidaActual)
        .onSnapshot((doc: any) => {
            const data = doc.data();
            if (data && data.hostId && data.hostId !== this.idLocalActivo && data.hostId !== 'L_placeholder') {
                this.registrarEventoLog(`Nuevo Host detectado: ${data.hostNick}. Reconectando...`);
                unsub();
                this.unirseAPartidaFirestore(this.network.idPartidaActual!);
            }
        });
  }

  async promocionarAHost() {
    this.esHost = true;
    this.network.esHost = true;
    const hc = document.getElementById('hostControls');
    if (hc) hc.style.display = 'flex';
    if (this.network.idPartidaActual) {
        await this.firebase.getDb()!.collection('partidas').doc(this.network.idPartidaActual).update({
            hostId: this.idLocalActivo,
            hostNick: this.protagonista.nombre
        });
        this.registrarEventoLog("Ahora eres el Host de la partida.");
        this.configurarIntervalosHost();
        this.iniciarAutoAdmision();
    }
  }

  configurarIntervalosHost() {
    this.detenerIntervalosFirebase();
    this.firebaseHeartbeatInterval = window.setInterval(() => {
        if (this.esHost && this.network.idPartidaActual) {
            this.firebase.updateHeartbeat(this.network.idPartidaActual, this.remotosActivos.size + 1);
        }
    }, 10000);

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
        if (this.networkHttp) this.networkHttp.desconectar();
        this.signaling?.desconectar();
        this.vaciarEspejoCasa();
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
        name: this.protagonista.nombre,
        class: this.protagonista.clase,
        color: this.protagonista.color,
        avatar: this.protagonista.apariencia,
        inventario: this.protagonista.exportarInventario(),
        diff: this.config.dificultad
    }));
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

    if (data.rol === 'solo') {
        this.empezarSolo();
    } else if (data.rol === 'host' && data.roomId) {
        this.esHost = true;
        this.network.esHost = true;
        this.network.idPartidaActual = data.roomId;
        this.persistenciaMundo = this.firebase.crearPersistenciaMundo(data.roomId);
        const hc = document.getElementById('hostControls');
        if (hc) hc.style.display = 'flex';
        this.iniciarAutoAdmision();

        const roomDisp = document.getElementById('roomDisplay');
        const roomIdVal = document.getElementById('roomIdVal');
        if (roomDisp && roomIdVal) {
            roomDisp.style.display = 'block';
            roomIdVal.textContent = data.roomId;
        }

        this.configurarIntervalosHost();
        this.ui.ocultarLobby();
        await this.prepararMundo();
        this.iniciarMotorJuego();
    } else if (data.rol === 'host') {
        // roomId inválido o vacío: caer a modo solo
        this.registrarEventoLog('Sesión host guardada sin roomId válido; iniciando en modo solo.');
        this.empezarSolo();
    } else if (data.rol === 'guest') {
        this.unirseAPartidaFirestore(data.roomId);
    }
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
    this.inicioPartida = Date.now();
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
    this.ultimoFrameTime = performance.now();
    this.fpsBajoContador = 0;
    this.cicloDeJuego();
  }

  /**
   * Aplica el esquema de acciones (dock táctil / acordeón) según la
   * preferencia guardada y el dispositivo autodetectado (spec-2 §2).
   */
  aplicarEsquemaUI(): void {
    const preferencia = sanearPreferencia(localStorage.getItem('mazerpg.ui.scheme'));
    const punteroTosco = window.matchMedia('(pointer: coarse)').matches;
    const ancho = window.innerWidth;
    const esquema = resolverEsquema(preferencia, punteroTosco, ancho);
    const movil = esAcordeonMovil(esquema, punteroTosco, ancho);
    const body = document.body;
    body.classList.remove('esquema-dock', 'esquema-acordeon', 'esquema-acordeon-movil');
    body.classList.add(movil ? 'esquema-acordeon-movil' : `esquema-${esquema}`);

    // Montaje: el MISMO nodo .actions-content vive en el dock (táctil) o en el
    // acordeón — nunca se clona, para que cooldowns y visibilidad sigan vivos.
    const contenido = document.querySelector('.actions-content');
    const actionsMenu = document.getElementById('actionsMenu');
    const dock = document.getElementById('actionDock');
    if (contenido && actionsMenu && dock) {
      const destino = esquema === 'dock' ? dock : actionsMenu;
      if (contenido.parentElement !== destino) destino.appendChild(contenido);
    }
    // En móvil el acordeón nace desplegado full-width (spec-2 §6).
    if (movil && actionsMenu) actionsMenu.classList.add('visible');
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
    if (this.gestorMundo.conectores.size > 0) return;

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
    let cantidad = 40;
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

    if (this.network && this.network.activo) {
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
            fr: this.protagonista.frameActual
        });
    }
  }

  cicloDeJuego() {
    this.diagFrameCount++;
    const ahora = performance.now();
    if (this.ultimoFrameTime > 0) {
      const delta = ahora - this.ultimoFrameTime;
      const fps = 1000 / delta;
      
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

    this.actualizar();
    this.renderer.limpiar();
    const offset = this.renderer.obtenerOffsetCamara(this.protagonista, this.config);

    this.renderer.aplicarZoom(this.config);
    this.renderer.setPortalesHousingInactivos(this.portalesHousingInactivos());
    this.renderer.setPortalesHousing(this.idsPortalesHousing());
    this.renderer.setAmbiente(this.nodoActivo?.tipo === 'personal' ? 'casa' : 'dungeon');
    this.renderer.dibujarLaberinto(this.mapaLaberinto, offset, this.config, this.dropsSuelo);

    let persistence = this.config.TIEMPO_DESVANECIMIENTO_NIEBLA;
    if (this.protagonista.clase === 'explorador') {
        persistence *= 1.5;
    }
    this.renderer.dibujarNiebla(this.mapaLaberinto, offset, this.config, persistence);
    this.renderer.dibujarViñeta(this.protagonista.visualColumna, this.protagonista.visualFila, offset, this.config);

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

    const ahora = Date.now();

    if (!this.mpActivo && !this.esHost) {
        this.listaDeEnemigos.forEach(e => (e as any).actualizarIA(this));
    }

    let r = this.config.RADIO_VISION;
    if (this.protagonista.clase === 'explorador') {
        r *= 1.2;
    }

    const dimsVista = this.dimsActivo();
    for (let f = Math.max(0, this.protagonista.fila - Math.ceil(r)); f <= Math.min(dimsVista.filas - 1, this.protagonista.fila + Math.ceil(r)); f++) {
        for (let c = Math.max(0, this.protagonista.columna - Math.ceil(r)); c <= Math.min(dimsVista.columnas - 1, this.protagonista.columna + Math.ceil(r)); c++) {
            if (Math.sqrt(Math.pow(f - this.protagonista.fila, 2) + Math.pow(c - this.protagonista.columna, 2)) <= r) {
                this.mapaLaberinto[f][c].ultimoAvistamiento = ahora;
            }
        }
    }

  }

  /** Reenvío del estado completo del nodo activo a TODOS los invitados conectados: mapa v2 (re-dimensiona la rejilla del invitado) + enemigos + objetos + spawn. El invitado debe conocer el nodo del host en cada cruce, no solo al join. */
  private reenviarEstadoAInvitados(): void {
    if (!this.network?.activo) return;
    this.remotosActivos.forEach((_, guestId: string) => this.enviarMapaAlInvitado(guestId));
  }

  enviarMapaAlInvitado(guestId: string) {
    const jInfo = this.remotosActivos.get(guestId);
    this.registrarEventoLog(`[net] enviarMapaAlInvitado a ${guestId}: ${jInfo ? ('dc=' + (jInfo.dc?.readyState ?? 'null')) : 'sin jInfo'} (remotos=${this.remotosActivos.size})`);
    if (!jInfo || !jInfo.dc || jInfo.dc.readyState !== "open") return;

    const mapaCompacto = serializarMapa(this.mapaLaberinto, { v2: true });
    const enemigos = this.listaDeEnemigos.map(e => ({
        id: e.id, f: e.fila, c: e.columna, n: e.nombre, t: e.tipo, v: e.vidaActual, vm: e.vidaMaxima
    }));

    jInfo.dc.send(JSON.stringify({ tipo: 'mapa', datos: mapaCompacto, dificultad: this.config.dificultad }));
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

  private resultadoDeId(id: string): ResultadoPartida {
    const entidad = this.obtenerEntidadPorId(id);
    if (!entidad) return this.resultadoDeEntidad(id, 0, 0, 0);
    const oro = entidad === this.protagonista
      ? (this.protagonista.inventario.oro ?? 0)
      : ((entidad as any).oro ?? 0);
    return this.resultadoDeEntidad(entidad.nombre, oro, entidad.puntosExperiencia, entidad.bajas);
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
      this.registrarEventoLog(`Roster congelado: ${this.roster.size} jugador(es).`);
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
    const resultados = [...this.roster]
      .map((id) => this.resultadoDeId(id))
      .sort((a, b) => b.puntuacion - a.puntuacion);
    this.resultados = resultados;
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

  enBurbujaSim(fila: number, columna: number): boolean {
    const radio = this.config.radioSim;
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
    const enBurbuja = this.enBurbujaSim(entidad.fila, entidad.columna);

    if (accion.tipo === 'mover') {
        const { df, dc } = accion;
        const sigFila = entidad.fila + df;
        const sigColumna = entidad.columna + dc;

        // 1-3: SIM bajo burbuja — colisiones con jugadores (combate/HP), con
        // enemigos y rehuir. Fuera de burbuja estas ramas no se simulan.
        if (enBurbuja) {
            // 1. Verificar colisión con otros jugadores
            let jugadorChocadoId: string | null = null;
            let jugadorChocado: any = null;

            if (id !== this.idLocalActivo && this.protagonista.fila === sigFila && this.protagonista.columna === sigColumna) {
                jugadorChocadoId = this.idLocalActivo;
                jugadorChocado = this.protagonista;
            } else {
                this.remotosActivos.forEach((v: any, k: string) => {
                    if (k !== id && v.entidad && v.entidad.fila === sigFila && v.entidad.columna === sigColumna) {
                        jugadorChocadoId = k;
                        jugadorChocado = v.entidad;
                    }
                });
            }

            if (jugadorChocado) {
                const interactions = (entidad.consecutiveInteractions.get(jugadorChocadoId!) || 0) + 1;
                if (interactions >= 2 && entidad.estaVivo && jugadorChocado.estaVivo) {
                    entidad.consecutiveInteractions.set(jugadorChocadoId!, 0);
                    if (entidad.vidaActual > 1) {
                        entidad.vidaActual -= 1;
                        jugadorChocado.vidaActual = Math.min(jugadorChocado.vidaMaxima, jugadorChocado.vidaActual + 1);
                        this.registrarEventoLog(`${entidad.nombre} transfirió 1 HP a ${jugadorChocado.nombre}`);

                        // Notificar a todos para efectos visuales (texto flotante)
                        this.enviarMultiplayer({
                            tipo: 'hp_transfer',
                            fromId: id,
                            toId: jugadorChocadoId,
                            amount: 1
                        });
                        this.enviarMultiplayer({
                            tipo: 'hp_loss',
                            id: id,
                            amount: 1
                        });
                    }
                } else {
                    entidad.consecutiveInteractions.set(jugadorChocadoId!, interactions);
                    this.registrarEventoLog(`Interacción: ${entidad.nombre} -> ${jugadorChocado.nombre} (${interactions}/2)`);
                }
                return;
            }

            entidad.consecutiveInteractions.forEach((_v: number, k: string) => {
                if (k !== jugadorChocadoId) entidad.consecutiveInteractions.set(k, 0);
            });

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

        // 4. Límites del mapa
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
        }
    } else if (accion.tipo === 'fireball') {
        if (enBurbuja) this.lanzarBolaDeFuego(entidad, false);
    } else if (accion.tipo === 'bow') {
        if (enBurbuja) this.lanzarArco(entidad, false);
    } else if (accion.tipo === 'create_food') {
        // Edición interactiva (§3a): crea comida vía delta, pasa fuera de burbuja.
        this.crearComidaHabilidad(entidad, false);
    } else if (accion.tipo === 'radar') {
        if (enBurbuja) this.lanzarRadar(entidad, false);
    } else if (accion.tipo === 'whirlwind') {
        if (enBurbuja) this.lanzarWhirlwind(entidad, false);
    } else if (accion.tipo === 'freeze') {
        if (enBurbuja) this.lanzarCongelar(entidad, false);
    } else if (accion.tipo === 'stop_walking') {
        if (enBurbuja) entidad.estaCaminando = false;
    }
  }

  asustarMonstruosCercanos(fila: number, columna: number) {
    const r = this.config.RADIO_VISION;
    this.listaDeEnemigos.forEach(e => {
        const dist = Math.sqrt(Math.pow(e.fila - fila, 2) + Math.pow(e.columna - columna, 2));
        if (dist <= r) {
            (e as any).huyendoHasta = Date.now() + 10000;
        }
    });
  }

  teletransportarAliados(lider: any, esLocal: boolean) {
    if (!this.esHost && this.mpActivo && esLocal) {
        this.enviarMultiplayer({ tipo: 'request_guard_teleport' });
    }

    if (!this.esHost && !esLocal) {
        // Ignorar si no somos el host y es un mensaje remoto (el host mandará force_teleport)
        return;
    }

    const posicionesLibres: {f: number, c: number}[] = [];
    for (let df = -1; df <= 1; df++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (df === 0 && dc === 0) continue;
            const nf = lider.fila + df;
            const nc = lider.columna + dc;
            if (nf >= 0 && nf < this.mapaLaberinto.length && nc >= 0 && nc < (this.mapaLaberinto[nf]?.length ?? 0)) {
                if (this.mapaLaberinto[nf][nc].esTransitable) {
                    posicionesLibres.push({ f: nf, c: nc });
                }
            }
        }
    }

    // Si no hay suficientes adyacentes, buscar un poco más allá
    if (posicionesLibres.length < this.remotosActivos.size + 1) {
         for (let r = 2; r <= 3; r++) {
            for (let df = -r; df <= r; df++) {
                for (let dc = -r; dc <= r; dc++) {
                    const nf = lider.fila + df;
                    const nc = lider.columna + dc;
                    if (nf >= 0 && nf < this.mapaLaberinto.length && nc >= 0 && nc < (this.mapaLaberinto[nf]?.length ?? 0)) {
                        if (this.mapaLaberinto[nf][nc].esTransitable && !posicionesLibres.some(p => p.f === nf && p.c === nc)) {
                            posicionesLibres.push({ f: nf, c: nc });
                        }
                    }
                }
            }
         }
    }

    let idx = 0;
    this.remotosActivos.forEach((j, id) => {
        // No teletransportar al líder si es uno de los jugadores remotos
        if (j.entidad && j.entidad !== lider && idx < posicionesLibres.length) {
            const pos = posicionesLibres[idx++];
            j.entidad.fila = pos.f;
            j.entidad.columna = pos.c;
            if (this.esHost) {
                this.enviarMultiplayer({ tipo: 'force_teleport', id: id, f: pos.f, c: pos.c });
            }
        }
    });

    if (this.protagonista !== lider && idx < posicionesLibres.length) {
         const pos = posicionesLibres[idx++];
         this.protagonista.fila = pos.f;
         this.protagonista.columna = pos.c;
         this.registrarEventoLog("¡Llamada a la guardia! Has sido teletransportado.");
    }
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

  lanzarArco(emisor: any, esLocal: boolean) {
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
              if (this.esHost) {
                  this.colaAcciones.push({ id: this.idLocalActivo, accion: { tipo: 'bow' } });
              } else {
                  this.enviarMultiplayer({ tipo: 'action', accion: { tipo: 'bow' } });
              }
              return;
          }
      }

      // Lógica de disparo
      let target: any = null;
      let minDist = Infinity;

      this.listaDeEnemigos.forEach(e => {
          if (e.estaVivo) {
              const celda = this.mapaLaberinto[e.fila][e.columna];
              const visible = celda.ultimoAvistamiento > 0 && (ahora - celda.ultimoAvistamiento < this.config.TIEMPO_DESVANECIMIENTO_NIEBLA);

              if (visible) {
                  let dist = Math.sqrt(Math.pow(e.fila - emisor.fila, 2) + Math.pow(e.columna - emisor.columna, 2));
                  if (dist < minDist) {
                      minDist = dist;
                      target = e;
                  }
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
              speed: 0.05,
              aplicarDano: this.esHost || !this.mpActivo,
              color: "#aaa",
              esFlecha: true
          });
          this.registrarEventoLog(`¡${emisor.nombre} dispara una flecha!`);

          if (this.esHost && this.mpActivo) {
              this.enviarMultiplayer({
                  tipo: 'arrow_spawn',
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
        this.atravesarConector(entidad, conector);
        return;
    }
    this.teleportarPortalClasico(entidad);
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
    this.iniciarFundido();
    this.invalidarPortalesHousing();
    this.renderer.invalidarCacheLaberinto();
    // Fase 2: los enemigos son por-nodo y persistentes. Antes de descartar la
    // lista activa se fotografía el nodo saliente (solo host/Firebase) y, tras
    // conmutar, el destino se restaura desde su snapshot de enemigos; si no hay
    // foto, la siembra por gen queda como está.
    const fotoEnemigos = this.fotografiarEnemigos();
    if (this.listaDeEnemigos.length > 0) {
        this.listaDeEnemigos = [];
    }
    if (nodoSalienteId) {
        this.conmutarSnapshotEnemigos(nodoSalienteId, fotoEnemigos);
        this.espejoEnemigosCasa(nodoSalienteId, fotoEnemigos);
    }
    entidad.fila = aparicion.fila;
    entidad.columna = aparicion.columna;
    entidad.visualFila = aparicion.fila;
    entidad.visualColumna = aparicion.columna;
    this.registrarEventoLog(`${entidad.nombre} ha atravesado un portal.`);
    if (entidad === this.protagonista) {
        this.ui.crearTextoFlotanteEnCelda(aparicion.fila, aparicion.columna, "¡PORTAL!", "#0000ff", this);
        if (this.network && this.network.activo) {
            this.enviarMultiplayer({
                tipo: 'posicion',
                f: aparicion.fila, c: aparicion.columna, cam: false,
                id: this.idLocalActivo, nick: this.protagonista.nombre,
                hp: this.protagonista.vidaActual, maxHp: this.protagonista.vidaMaxima
            });
        }
        this.actualizarPanelAcciones();
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
    const persistencia = this.persistenciaMundo;
    if (!this.esHost || !persistencia) {
        return;
    }
    // El destino se captura de forma síncrona: no depende de ningún await.
    const destinoId = this.gestorMundo.nodoActivoId;
    if (!destinoId) return;
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
                if (this.network && this.network.activo) {
                    this.enviarMultiplayer({
                        tipo: 'posicion',
                        f: dest.f, c: dest.c, cam: false,
                        id: this.idLocalActivo, nick: this.protagonista.nombre,
                        hp: this.protagonista.vidaActual, maxHp: this.protagonista.vidaMaxima
                    });
                }
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
                    this.bolasDeFuego.push({
                        x: msg.ex,
                        y: msg.ey,
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
            if (idEmisor === 'host' && !this.esHost) {
                const hostInfo = this.remotosActivos.get('host');
                if (hostInfo) {
                    this.remotosActivos.delete('host');
                    this.remotosActivos.set(realId, hostInfo);
                    this.network.idRealDelHost = realId;
                }
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

            if (this.esHost) {
                // Notificar a otros y responder al nuevo con nuestro handshake
                this.enviarMultiplayer({ ...msg, id: idSujeto }, idEmisor);

                // Forzar envío de nuestro handshake al que acaba de llegar (por si su canal abrió después que el nuestro)
                const hostStats = { fue: this.protagonista.fuerza, agi: this.protagonista.agilidad, int: this.protagonista.inteligencia };
                const target = this.remotosActivos.get(idEmisor);
                if (target && target.dc && target.dc.readyState === "open") {
                    target.dc.send(JSON.stringify({
                        tipo: 'handshake',
                        nick: this.protagonista.nombre,
                        id: this.idLocalActivo,
                        clase: this.protagonista.clase,
                        stats: hostStats,
                        apariencia: aparienciaEfectiva(this.protagonista.clase, this.protagonista.apariencia)
                    }));
                }
            } else {
                const stats = { fue: this.protagonista.fuerza, agi: this.protagonista.agilidad, int: this.protagonista.inteligencia };
                this.enviarMultiplayer({ tipo: 'handshake_ack', nick: this.protagonista.nombre, id: this.idLocalActivo, stats });
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
            break;
        case 'mapa':
            const dims = deserializarMapa(this.mapaLaberinto, msg.datos);
            this.config.NUMERO_FILAS = dims.filas;
            this.config.NUMERO_COLUMNAS = dims.columnas;
            if (msg.dificultad) this.config.dificultad = msg.dificultad;
            this.ajustarDimensiones();
            this.registrarEventoLog('Mapa del host recibido.');
            break;
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
                this.protagonista.fila = msg.f;
                this.protagonista.columna = msg.c;
                this.protagonista.visualFila = msg.f;
                this.protagonista.visualColumna = msg.c;
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
        case 'hp_transfer':
            if (msg.toId === this.idLocalActivo) {
                this.protagonista.vidaActual = Math.min(this.protagonista.vidaMaxima, this.protagonista.vidaActual + msg.amount);
                this.ui.crearTextoFlotanteEnCelda(this.protagonista.fila, this.protagonista.columna, `+${msg.amount} HP`, "#00ff00", this);
                this.registrarEventoLog(`Has recibido vida de un compañero.`);
            } else {
                const target = this.remotosActivos.get(msg.toId);
                if (target && target.entidad) {
                    target.entidad.vidaActual = Math.min(target.entidad.vidaMaxima, target.entidad.vidaActual + msg.amount);
                    this.ui.crearTextoFlotanteEnCelda(target.entidad.fila, target.entidad.columna, `+${msg.amount} HP`, "#00ff00", this);
                }
            }
            if (this.esHost) this.enviarMultiplayer({ ...msg }, idEmisor);
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
