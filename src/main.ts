import './style.css';
import { Celda } from './world/Celda';
import { Jugador } from './entities/Jugador';
import { JugadorRemoto } from './entities/JugadorRemoto';
import { EnemigoNPC } from './entities/EnemigoNPC';
import { Renderer } from './core/Renderer';
import { UIManager } from './ui/UIManager';
import { FirebaseManager } from './network/FirebaseManager';
import { NetworkManager } from './network/NetworkManager';
import { generarLaberintoBSP, eliminarMurosEntre } from './world/generation';
import { serializarMapa, deserializarMapa } from './world/serialization';
import { generateSessionName, generateBubbleName } from './utils/session';
import { GameConfig, IGame } from './types';
import {
    NUMERO_FILAS, NUMERO_COLUMNAS, TAMANO_CELDA,
    ALTO_UI_TOP, ALTO_UI_BOTTOM, RADIO_VISION,
    TIEMPO_DESVANECIMIENTO_NIEBLA
} from './world/constants';

class Game implements IGame {
  public mapaLaberinto: Celda[][] = [];
  public protagonista: Jugador = new Jugador();
  public listaDeEnemigos: EnemigoNPC[] = [];
  public jugadoresRemotos: Map<string, any> = new Map();
  public renderer: Renderer;
  public ui: UIManager = new UIManager();
  public firebase: FirebaseManager = new FirebaseManager();
  public network: NetworkManager = new NetworkManager();
  public config: GameConfig = {
    NUMERO_FILAS, NUMERO_COLUMNAS, TAMANO_CELDA,
    ALTO_UI_TOP, ALTO_UI_BOTTOM, RADIO_VISION,
    TIEMPO_DESVANECIMIENTO_NIEBLA,
    CELDAS_VISIBLES_X: 10,
    CELDAS_VISIBLES_Y: 10,
    vistaDebugActivada: false,
    dificultad: 'dificil',
    zoom: 1,
    targetZoom: 1,
    autoZoom: false,
    tickRate: 16
  };
  public juegoTerminado: boolean = false;
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
  private _flowTarget: 'solo' | 'host' | 'manual' | null = null;

  constructor() {
    const canvas = document.getElementById('mazeCanvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.setupEntity(this.protagonista);
    this.initMap();
    this.ajustarDimensiones();
    window.addEventListener('resize', () => this.ajustarDimensiones());
    this.setupEventListeners();
    (window as any).game = this;
    this.inicializarAssets();
    this.revisarSesionGuardada();

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const toque = e.touches[0];
        this.manejarTap(toque.clientX, toque.clientY);
    }, { passive: false });

    canvas.addEventListener('mousedown', (e) => {
        this.manejarTap(e.clientX, e.clientY);
    });
  }

  async inicializarAssets() {
    const sm = this.renderer.spriteManager;

    const assets = {
        floor: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAARUlEQVR4nO3TsREAIAhDUXDWjJWBGMsBsMTC86cMd7wqKUlStNge6bOqejuYdfU7wCeA7eNhqmcHAC8A7AAAgB0AAETEBmXmKuQaeq+RAAAAAElFTkSuQmCC",
        wall: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAPklEQVR4nO3NQQ0AMAzDwGwqjoIofzRB0t8YRNrDBuA7M6NkJam7Q3fbN7R+AQAAAAAAAAAAAPwClCTbOWAB98UGgLgIu1MAAAAASUVORK5CYII=",
        player: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAPklEQVR4nGP8//8/Ay0BE01NH7Vg1AKqABZcEoyppBn0fzZ28aEfRKMWjFowasGoBSPCAsbRdtGoBaMWMAAAkbwIO3HORrAAAAAASUVORK5CYII=",
        orc: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAT0lEQVR4nGP8//8/Ay0BE01NH7Vg1AKqABZcEozTGUky6H8m9vw09INocFjwP4s0cZItYJxGmjjJFlACRi0YtWDUAjpYwDjaLhq1YNQCBgCCGA073/3AxgAAAABJRU5ErkJggg==",
        food: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAARElEQVR4nGP8//8/Ay0BE01NH7Vg1IJRCxgYGBgYWAjIMzISNgNvWTD0g2jUglELRi0YBGURxW2OoR9EoxaMWjAELAAAUI4HP9mcIXQAAAAASUVORK5CYII=",
        pick: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKUlEQVR4nO3MQQ0AMBAEofGvbGVVxT2agADq0ja73W632+12u93+yV4P1rpLAWquDRAAAAAASUVORK5CYII="
    };

    try {
        await sm.cargarImagen('demo_floor', assets.floor);
        await sm.cargarImagen('demo_wall', assets.wall);
        await sm.cargarImagen('demo_player', assets.player);
        await sm.cargarImagen('demo_orc', assets.orc);
        await sm.cargarImagen('demo_food', assets.food);
        await sm.cargarImagen('demo_pick', assets.pick);

        sm.definirSprite('floor', 'demo_floor', 0, 0, 32, 32);
        sm.definirSprite('wall_top', 'demo_wall', 0, 0, 32, 32);
        sm.definirSprite('wall_bottom', 'demo_wall', 0, 0, 32, 32);
        sm.definirSprite('wall_left', 'demo_wall', 0, 0, 32, 32);
        sm.definirSprite('wall_right', 'demo_wall', 0, 0, 32, 32);

        // Sprites para el jugador (idle y caminar)
        sm.definirSprite('player_guerrero_idle', 'demo_player', 0, 0, 32, 32);
        sm.definirSprite('player_guerrero_walk', 'demo_player', 0, 0, 32, 32);
        sm.definirSprite('player_explorador_idle', 'demo_player', 0, 0, 32, 32);
        sm.definirSprite('player_explorador_walk', 'demo_player', 0, 0, 32, 32);
        sm.definirSprite('player_mago_idle', 'demo_player', 0, 0, 32, 32);
        sm.definirSprite('player_mago_walk', 'demo_player', 0, 0, 32, 32);

        // Sprites para remotos
        sm.definirSprite('player_remote_idle', 'demo_player', 0, 0, 32, 32);
        sm.definirSprite('player_remote_walk', 'demo_player', 0, 0, 32, 32);

        // Sprites para enemigos
        sm.definirSprite('npc_orco', 'demo_orc', 0, 0, 32, 32);
        sm.definirSprite('npc_esqueleto', 'demo_orc', 0, 0, 32, 32);
        sm.definirSprite('npc_goblin', 'demo_orc', 0, 0, 32, 32);
        sm.definirSprite('npc_minotauro', 'demo_orc', 0, 0, 32, 32);

        // Ítems
        sm.definirSprite('food_manzana', 'demo_food', 0, 0, 32, 32);
        sm.definirSprite('food_plátano', 'demo_food', 0, 0, 32, 32);
        sm.definirSprite('food_kiwi', 'demo_food', 0, 0, 32, 32);
        sm.definirSprite('food_brócoli', 'demo_food', 0, 0, 32, 32);
        sm.definirSprite('food_muslo_de_pollo', 'demo_food', 0, 0, 32, 32);
        sm.definirSprite('food_chuleta', 'demo_food', 0, 0, 32, 32);
        sm.definirSprite('food_pescado', 'demo_food', 0, 0, 32, 32);
        sm.definirSprite('pickaxe', 'demo_pick', 0, 0, 32, 32);

        this.registrarEventoLog("Sprites de demostración cargados.");
    } catch (e) {
        console.error("Error cargando sprites demo:", e);
    }
  }

  initMap() {
    this.mapaLaberinto = [];
    for (let fila = 0; fila < this.config.NUMERO_FILAS; fila++) {
      let filaCeldas = [];
      for (let columna = 0; columna < this.config.NUMERO_COLUMNAS; columna++) {
        filaCeldas.push(new Celda(fila, columna));
      }
      this.mapaLaberinto.push(filaCeldas);
    }
  }

  ajustarDimensiones() {
    const canvas = document.getElementById('mazeCanvas') as HTMLCanvasElement;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // CELDAS_VISIBLES se usa para el rango de dibujado.
    // Lo calculamos para zoom 1 y añadimos margen para asegurar cobertura total al centrar.
    this.config.CELDAS_VISIBLES_X = Math.ceil(canvas.width / this.config.TAMANO_CELDA) + 4;
    this.config.CELDAS_VISIBLES_Y = Math.ceil((canvas.height - this.config.ALTO_UI_TOP - this.config.ALTO_UI_BOTTOM) / this.config.TAMANO_CELDA) + 4;
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

    document.getElementById('btnAceptarJugadores')?.addEventListener('click', () => {
      if (this.esHost && this.firebase.isInitialized()) {
        this.admitirCandidatos();
      }
    });

    document.getElementById('btnLogPanel')?.addEventListener('click', () => {
      document.getElementById('logPanel')?.classList.toggle('visible');
    });

    document.getElementById('btnSolo')?.addEventListener('click', () => this.mostrarSeleccionDificultad('solo'));
    document.getElementById('btnCrearPartida')?.addEventListener('click', () => this.mostrarSeleccionDificultad('host'));
    document.getElementById('btnUnirseLobby')?.addEventListener('click', () => this.mostrarLobbyFirebase());
    document.getElementById('btnVolverLobbyFirebase')?.addEventListener('click', () => this.regresarAlLobby());
    document.getElementById('btnVolverLobbyManual')?.addEventListener('click', () => this.regresarAlLobby());
    document.getElementById('btnLobbyManual')?.addEventListener('click', () => {
      document.getElementById('lobbyInitial')!.style.display = 'none';
      document.getElementById('lobbyManual')!.style.display = 'flex';
    });

    document.getElementById('btnRefrescar')?.addEventListener('click', () => this.listarPartidasFirestore());
    document.getElementById('btnReanudar')?.addEventListener('click', () => this.reanudarPartida());

    document.getElementById('btnRespawn')?.addEventListener('click', () => this.respawnPlayer());
    document.getElementById('btnEmpezar')?.addEventListener('click', () => this.respawnPlayer());
    document.getElementById('btnSalir')?.addEventListener('click', () => window.location.reload());
    document.getElementById('btnAbandonar')?.addEventListener('click', () => this.abandonarPartida());

    document.getElementById('btnOpenCharacterModal')?.addEventListener('click', () => this.abrirModalPersonaje());
    document.getElementById('btnEditCharacter')?.addEventListener('click', () => this.abrirModalPersonaje());
    document.getElementById('btnRandomName')?.addEventListener('click', () => this.generarNombreAleatorio());
    document.getElementById('btnCharReroll')?.addEventListener('click', () => this.recalcularStatsPersonaje());
    document.getElementById('btnSaveCharacter')?.addEventListener('click', () => this.guardarPersonaje());

    document.querySelectorAll('.class-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('selected'));
            (e.currentTarget as HTMLElement).classList.add('selected');
            this.recalcularStatsPersonaje();
        });
    });

    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const diff = (e.currentTarget as HTMLElement).getAttribute('data-diff') as any;
            this.config.dificultad = diff;
            document.getElementById('difficultyModal')!.style.display = 'none';
            if (this._flowTarget === 'solo') {
                this.empezarSolo();
            } else if (this._flowTarget === 'host') {
                this.iniciarComoHostFirebase();
            } else if (this._flowTarget === 'manual') {
                this.iniciarComoHostManual();
            }
        });
    });

    document.getElementById('btnBackFromDiff')?.addEventListener('click', () => {
        document.getElementById('difficultyModal')!.style.display = 'none';
    });

    // Eventos de QR Manual
    document.getElementById('btnShowOfferQR')?.addEventListener('click', () => this.mostrarQRManual('OFERTA', (document.getElementById('manualOfferOut') as HTMLTextAreaElement).value));
    document.getElementById('btnShowAnswerQR')?.addEventListener('click', () => this.mostrarQRManual('RESPUESTA', (document.getElementById('manualAnswerOut') as HTMLTextAreaElement).value));
    document.getElementById('btnCloseQRModal')?.addEventListener('click', () => {
        document.getElementById('qrModal')!.style.display = 'none';
    });
    document.getElementById('btnScanQROffer')?.addEventListener('click', () => this.escanearQRManual('manualOfferIn'));
    document.getElementById('btnScanQRAnswer')?.addEventListener('click', () => this.escanearQRManual('manualAnswerIn'));

    document.getElementById('btnGenOferta')?.addEventListener('click', () => {
        this.mostrarSeleccionDificultad('manual');
    });

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

    document.getElementById('btnReroll')?.addEventListener('click', () => this.recalcularStats());
    document.getElementById('btnQR')?.addEventListener('click', () => this.generarQR());

    document.getElementById('btnFireball')?.addEventListener('click', () => this.lanzarBolaDeFuego(this.protagonista, true));
    document.getElementById('btnFireballAction')?.addEventListener('click', () => this.lanzarBolaDeFuego(this.protagonista, true));
    document.getElementById('btnWhirlwindAction')?.addEventListener('click', () => this.lanzarWhirlwind(this.protagonista, true));
    document.getElementById('btnFreezeAction')?.addEventListener('click', () => this.lanzarCongelar(this.protagonista, true));
    document.getElementById('btnBowAction')?.addEventListener('click', () => this.lanzarArco(this.protagonista, true));
    document.getElementById('btnCreateFoodAction')?.addEventListener('click', () => this.crearComidaHabilidad(this.protagonista, true));
    document.getElementById('btnGuardAction')?.addEventListener('click', () => this.teletransportarAliados(this.protagonista, true));
    document.getElementById('btnRadarAction')?.addEventListener('click', () => this.lanzarRadar(this.protagonista, true));
    document.getElementById('btnRestartAction')?.addEventListener('click', () => window.location.reload());

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

    this.actualizarStatsLobby();

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.ui.toggleChat(this);
        return;
      }
      if (document.getElementById('chatModal')?.style.display === 'flex') return;

      if (this.juegoTerminado) return;

      let haMovido = false;
      if (e.key === 'ArrowUp') haMovido = this.protagonista.intentarMover(-1, 0, this);
      if (e.key === 'ArrowDown') haMovido = this.protagonista.intentarMover(1, 0, this);
      if (e.key === 'ArrowLeft') haMovido = this.protagonista.intentarMover(0, -1, this);
      if (e.key === 'ArrowRight') haMovido = this.protagonista.intentarMover(0, 1, this);

      if (e.key.toLowerCase() === 'f') {
          this.lanzarBolaDeFuego(this.protagonista, true);
      }

      if (e.key.toLowerCase() === 'd') {
          this.config.vistaDebugActivada = !this.config.vistaDebugActivada;
          this.registrarEventoLog(`Modo Desarrollo ${this.config.vistaDebugActivada ? 'ACTIVADO' : 'DESACTIVADO'}`);
          this.actualizarPanelAcciones();
      }

      if (haMovido) {
        this.comprobarVictoria();
      }
    });

    window.addEventListener('keyup', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            this.protagonista.estaCaminando = false;
            if (this.network && this.network.multiplayerActivo) {
                if (this.esHost) {
                    // El host ya actualiza a su protagonista localmente
                } else {
                    this.network.enviarMensaje({ tipo: 'action', accion: { tipo: 'stop_walking' } });
                }
            }
        }
    });
  }

  mostrarSeleccionDificultad(target: 'solo' | 'host' | 'manual') {
    this._flowTarget = target;
    document.getElementById('difficultyModal')!.style.display = 'flex';
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
    (document.getElementById('btnAceptarJugadores') as HTMLButtonElement).disabled = false;
    const hc = document.getElementById('hostControls');
    if (hc) hc.style.display = 'flex';
    this.crearPartidaFirestore();
  }

  async crearPartidaFirestore() {
    const id = generateSessionName();
    this.network.idPartidaActual = id;
    this.guardarSesion('host', id);

    const roomDisp = document.getElementById('roomDisplay');
    const roomIdVal = document.getElementById('roomIdVal');
    if (roomDisp && roomIdVal) {
        roomDisp.style.display = 'block';
        roomIdVal.textContent = id;
    }

    await this.firebase.crearPartida(id, this.network.idLocal, this.protagonista.nombre);
    this.configurarIntervalosHost();
    this.ui.registrarLogConexion(`Partida creada: ${id}`);
    this.ui.ocultarLobby();
    this.iniciarMotorJuego();
  }

  mostrarLobbyFirebase() {
    document.getElementById('lobbyInitial')!.style.display = 'none';
    document.getElementById('lobbyFirebase')!.style.display = 'flex';
    this.listarPartidasFirestore();
  }

  async listarPartidasFirestore() {
    const partidas = await this.firebase.getPartidasActivas();
    const listaContainer = document.getElementById('listaPartidas')!;
    listaContainer.innerHTML = "";
    if (partidas.length === 0) {
        listaContainer.innerHTML = '<p style="color: #666; font-style: italic; text-align: center;">No hay partidas disponibles.</p>';
        return;
    }
    partidas.forEach((p: any) => {
        const item = document.createElement('div');
        item.style.cssText = "background: #222; margin-bottom: 5px; padding: 10px; border-radius: 3px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #444;";
        item.innerHTML = `
            <div style="text-align: left;">
                <strong style="color: #007bff;">ID: ${p.id}</strong><br>
                <span style="font-size: 10px; color: #888;">Host: ${p.hostNick} | Jugadores: ${p.numJugadores}</span>
            </div>
            <button class="join-btn" data-id="${p.id}" style="background: #28a745; color: white; border: none; padding: 5px 10px; cursor: pointer; font-family: monospace; font-weight: bold;">UNIRSE</button>
        `;
        listaContainer.appendChild(item);
    });

    listaContainer.querySelectorAll('.join-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = (e.target as HTMLElement).getAttribute('data-id');
            if (id) this.unirseAPartidaFirestore(id);
        });
    });
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
  }

  async admitirCandidatos() {
    this.ui.registrarLogConexion("Buscando candidatos...");
    const snapshot = await this.firebase.getDb()!.collection('partidas').doc(this.network.idPartidaActual!).collection('conexiones').get();
    snapshot.forEach((doc: any) => {
        if (doc.id !== this.network.idLocal && !this.network.jugadoresRemotos.has(doc.id)) {
            this.network.setupWebRTCHost(doc.id, this);
        }
    });
  }

  iniciarEleccionHost() {
    const misJugadores = Array.from(this.network.jugadoresRemotos.keys())
        .filter(id => id !== 'host');
    misJugadores.push(this.network.idLocal);
    misJugadores.sort();

    const candidatoId = misJugadores[0];
    if (candidatoId === this.network.idLocal) {
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
            if (data && data.hostId && data.hostId !== this.network.idLocal && data.hostId !== 'L_placeholder') {
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
            hostId: this.network.idLocal,
            hostNick: this.protagonista.nombre
        });
        this.registrarEventoLog("Ahora eres el Host de la partida.");
        this.configurarIntervalosHost();
        (document.getElementById('btnAceptarJugadores') as HTMLButtonElement).disabled = false;
    }
  }

  configurarIntervalosHost() {
    setInterval(() => {
        if (this.esHost && this.network.idPartidaActual) {
            this.firebase.updateHeartbeat(this.network.idPartidaActual, this.network.jugadoresRemotos.size + 1);
        }
    }, 10000);

    setInterval(() => {
        if (this.esHost && this.network.multiplayerActivo) {
            // Sincronizar NPCs
            const listaNpcs = this.listaDeEnemigos.map(e => ({
                id: (e as any).id, f: e.fila, c: e.columna, v: e.vidaActual, vm: e.vidaMaxima
            }));
            this.network.enviarMensaje({ tipo: 'npc_sync_all', lista: listaNpcs });

            // Sincronizar objetos del mundo (fuente de verdad absoluta)
            const objetos: any[] = [];
            for (let f = 0; f < this.config.NUMERO_FILAS; f++) {
                for (let c = 0; c < this.config.NUMERO_COLUMNAS; c++) {
                    const celda = this.mapaLaberinto[f][c];
                    if (celda.alimento || celda.burbuja || celda.tienePico || celda.esPortal) {
                        objetos.push({ f, c, a: celda.alimento, b: celda.burbuja, p: celda.tienePico, pr: celda.esPortal });
                    }
                }
            }
            this.network.enviarMensaje({ tipo: 'objetos', lista: objetos, is_update: true });
        }
    }, 5000);
  }

  regresarAlLobby() {
    document.getElementById('lobbyInitial')!.style.display = 'block';
    document.getElementById('lobbyFirebase')!.style.display = 'none';
    document.getElementById('lobbyManual')!.style.display = 'none';
    document.getElementById('lobby')!.style.display = 'flex';
    document.getElementById('mazeCanvas')!.style.display = 'none';
    document.getElementById('topMenu')!.style.display = 'none';
    document.getElementById('actionsMenu')!.style.display = 'none';
    this.actualizarStatsLobby();
  }

  abandonarPartida() {
    if (confirm("¿Seguro que quieres abandonar la partida?")) {
        if (this.esHost && this.network.multiplayerActivo) {
            this.network.enviarMensaje({ tipo: 'host_migration_trigger', reason: 'host_abandoned' });
        }
        window.location.reload();
    }
  }

  actualizarStatsLobby() {
    // Actualizar previsualización "cool"
    const preview = document.getElementById('characterPreview');
    const creationSection = document.getElementById('charCreationSection');
    const options = document.getElementById('gameOptions');

    if (this.protagonista.nombre !== "Jugador" || (this.protagonista as any).personajeCreado) {
        if (preview) preview.style.display = 'block';
        if (creationSection) creationSection.style.display = 'none';
        if (options) options.style.display = 'flex';
        this.revisarSesionGuardada();

        document.getElementById('previewName')!.textContent = this.protagonista.nombre;
        const colorDiv = document.getElementById('previewColor')!;
        colorDiv.style.backgroundColor = this.protagonista.color;
        colorDiv.style.color = this.protagonista.color; // Para boxShadow currentColor

        const icons: any = { guerrero: '🪖', explorador: '🏹', mago: '🪄' };
        const names: any = { guerrero: 'GUERRERO', explorador: 'EXPLORADOR', mago: 'MAGO' };

        document.getElementById('previewClassIcon')!.textContent = icons[this.protagonista.clase] || '👤';
        document.getElementById('previewClassName')!.textContent = names[this.protagonista.clase] || 'AVENTURERO';

        document.getElementById('previewFue')!.textContent = this.protagonista.fuerza.toString();
        document.getElementById('previewAgi')!.textContent = this.protagonista.agilidad.toString();
        document.getElementById('previewInt')!.textContent = this.protagonista.inteligencia.toString();

        // Actualizar habilidades en el panel de acciones
        this.actualizarPanelAcciones();
    } else {
        if (preview) preview.style.display = 'none';
        if (creationSection) creationSection.style.display = 'block';
        if (options) options.style.display = 'none';
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

      if (btnWhirlwind) btnWhirlwind.style.display = this.protagonista.clase === 'guerrero' ? 'block' : 'none';
      if (btnFireball) btnFireball.style.display = (this.protagonista.clase === 'mago' || this.protagonista.clase === 'guerrero') ? 'block' : 'none';
      if (btnFreeze) btnFreeze.style.display = this.protagonista.clase === 'mago' ? 'block' : 'none';
      if (btnBow) btnBow.style.display = this.protagonista.clase === 'explorador' ? 'block' : 'none';
      if (btnFood) btnFood.style.display = this.protagonista.clase === 'mago' ? 'block' : 'none';
      if (btnRadar) btnRadar.style.display = this.protagonista.clase === 'explorador' ? 'block' : 'none';
      if (btnGuard) btnGuard.style.display = this.config.vistaDebugActivada ? 'block' : 'none';
      if (btnRestart) btnRestart.style.display = this.config.vistaDebugActivada ? 'block' : 'none';
  }

  abrirModalPersonaje() {
      document.getElementById('characterModal')!.style.display = 'flex';
      if (this.protagonista.nombre === "Jugador") {
          this.generarNombreAleatorio();
      } else {
          (document.getElementById('charNameInput') as HTMLInputElement).value = this.protagonista.nombre;
          (document.getElementById('charColorInput') as HTMLInputElement).value = this.protagonista.color;
          document.querySelectorAll('.class-btn').forEach(btn => {
              if (btn.getAttribute('data-class') === this.protagonista.clase) {
                  btn.classList.add('selected');
              } else {
                  btn.classList.remove('selected');
              }
          });
      }
      this.recalcularStatsPersonaje();
  }

  generarNombreAleatorio() {
      const nombres = [
          "Tharos", "Elowen", "Grombrindal", "Luthien", "Drizzt", "Ciri", "Geralt", "Yennefer",
          "Boromir", "Galadriel", "Aragorn", "Legolas", "Gimli", "Saruman", "Gandalf", "Radagast",
          "Elrond", "Glorfindel", "Eowyn", "Faramir", "Theoden", "Denethor", "Beren", "Tinuviel"
      ];
      const randomName = nombres[Math.floor(Math.random() * nombres.length)];
      (document.getElementById('charNameInput') as HTMLInputElement).value = randomName;
  }

  recalcularStatsPersonaje() {
      const selectedClass = document.querySelector('.class-btn.selected')?.getAttribute('data-class') || 'guerrero';
      this.protagonista.generarStats(selectedClass);

      const f = document.getElementById('charFue')!;
      const a = document.getElementById('charAgi')!;
      const i = document.getElementById('charInt')!;

      f.textContent = this.protagonista.fuerza.toString();
      a.textContent = this.protagonista.agilidad.toString();
      i.textContent = this.protagonista.inteligencia.toString();
  }

  guardarPersonaje() {
      this.protagonista.nombre = (document.getElementById('charNameInput') as HTMLInputElement).value || "Héroe";
      this.protagonista.color = (document.getElementById('charColorInput') as HTMLInputElement).value;
      const selectedClass = document.querySelector('.class-btn.selected')?.getAttribute('data-class') || 'guerrero';
      this.protagonista.clase = selectedClass;
      (this.protagonista as any).personajeCreado = true;

      document.getElementById('characterModal')!.style.display = 'none';

      // Sincronizar con el nickInput original por compatibilidad con el resto del código
      (document.getElementById('nickInput') as HTMLInputElement).value = this.protagonista.nombre;
      this.actualizarStatsLobby();
      this.registrarEventoLog(`Personaje guardado: ${this.protagonista.nombre} (${selectedClass})`);
  }

  mostrarQRManual(titulo: string, data: string) {
      if (!data) {
          alert("No hay datos para generar QR");
          return;
      }
      const qrImage = document.getElementById('modalQRImage') as HTMLImageElement;
      qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data)}`;
      document.getElementById('modalQRTitle')!.textContent = titulo;
      document.getElementById('qrModal')!.style.display = 'flex';
  }

  escanearQRManual(targetId: string) {
      const data = prompt("Pega aquí el contenido del código QR (o usa tu cámara si el dispositivo lo permite):");
      if (data) {
          (document.getElementById(targetId) as HTMLTextAreaElement).value = data;
          this.registrarEventoLog("QR escaneado y pegado en " + targetId);
      }
  }

  recalcularStats() {
    const prevClass = this.protagonista.clase;
    const prevColor = this.protagonista.color;
    const prevName = this.protagonista.nombre;

    this.protagonista = new Jugador(prevName);
    this.protagonista.clase = prevClass;
    this.protagonista.color = prevColor;
    this.protagonista.generarStats();

    this.setupEntity(this.protagonista);
    this.actualizarStatsLobby();
    this.registrarEventoLog("Estadísticas recalculadas.");
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

  guardarSesion(rol: string, roomId: string | null = null) {
    localStorage.setItem('mazeRPG_lastSession', JSON.stringify({
        roomId,
        rol,
        name: this.protagonista.nombre,
        class: this.protagonista.clase,
        color: this.protagonista.color,
        diff: this.config.dificultad
    }));
  }

  revisarSesionGuardada() {
    const data = localStorage.getItem('mazeRPG_lastSession');
    const btn = document.getElementById('btnReanudar');
    if (data && btn) {
        btn.style.display = 'block';
        // Asegurar que el contenedor de opciones sea visible si hay algo que reanudar
        const options = document.getElementById('gameOptions');
        if (options) options.style.display = 'flex';
        const creation = document.getElementById('charCreationSection');
        if (creation) creation.style.display = 'none';
    } else if (btn) {
        btn.style.display = 'none';
    }
  }

  async reanudarPartida() {
    const dataStr = localStorage.getItem('mazeRPG_lastSession');
    if (!dataStr) return;
    const data = JSON.parse(dataStr);

    this.protagonista.nombre = data.name;
    this.protagonista.clase = data.class;
    this.protagonista.color = data.color;
    this.config.dificultad = data.diff || 'medio';
    (this.protagonista as any).personajeCreado = true;
    (document.getElementById('nickInput') as HTMLInputElement).value = this.protagonista.nombre;

    if (data.rol === 'solo') {
        this.empezarSolo();
    } else if (data.rol === 'host') {
        this.esHost = true;
        this.network.esHost = true;
        this.network.idPartidaActual = data.roomId;
        const hc = document.getElementById('hostControls');
        if (hc) hc.style.display = 'flex';
        (document.getElementById('btnAceptarJugadores') as HTMLButtonElement).disabled = false;

        const roomDisp = document.getElementById('roomDisplay');
        const roomIdVal = document.getElementById('roomIdVal');
        if (roomDisp && roomIdVal) {
            roomDisp.style.display = 'block';
            roomIdVal.textContent = data.roomId;
        }

        this.configurarIntervalosHost();
        this.ui.ocultarLobby();
        this.iniciarMotorJuego();
    } else if (data.rol === 'guest') {
        this.unirseAPartidaFirestore(data.roomId);
    }
  }

  iniciarMotorJuego() {
    if (this.motorIniciado) return;
    this.motorIniciado = true;

    // Mostrar menús
    document.getElementById('topMenu')!.style.display = 'block';
    document.getElementById('actionsMenu')!.style.display = 'block';

    if (this.esHost || !this.network.multiplayerActivo) {
        generarLaberintoBSP(this.mapaLaberinto);
        const pos = this.obtenerPosicionInicioAleatoria();
        this.protagonista.fila = pos.f;
        this.protagonista.columna = pos.c;
        this.asustarMonstruosCercanos(pos.f, pos.c);
        this.generarEnemigos();
        this.generarObjetos();
    }
    this.cicloDeJuego();
  }

  generarObjetos() {
    // Generar comida
    const alimentos = [
        { tipo: "Manzana", pc: 5 },
        { tipo: "Plátano", pc: 8 },
        { tipo: "Kiwi", pc: 10 },
        { tipo: "Brócoli", pc: 25 },
        { tipo: "Muslo de pollo", pc: 35 },
        { tipo: "Chuleta", pc: 40 },
        { tipo: "Pescado", pc: 70 }
    ];

    for (let i = 0; i < 30; i++) {
        let f, c;
        let s = 0;
        do {
            f = Math.floor(Math.random() * this.config.NUMERO_FILAS);
            c = Math.floor(Math.random() * this.config.NUMERO_COLUMNAS);
            s++;
        } while (!this.mapaLaberinto[f][c].esTransitable && s < 1000);

        if (this.mapaLaberinto[f][c].esTransitable) {
            this.mapaLaberinto[f][c].alimento = alimentos[Math.floor(Math.random() * alimentos.length)];
        }
    }

    // Generar burbujas (máximo 5)
    const burbujas: {f: number, c: number, nombre: string}[] = [];
    const nombresBurbujas = new Set<string>();
    for (let i = 0; i < 5; i++) {
        let f, c;
        let s = 0;
        do {
            f = Math.floor(Math.random() * this.config.NUMERO_FILAS);
            c = Math.floor(Math.random() * this.config.NUMERO_COLUMNAS);
            s++;
        } while ((!this.mapaLaberinto[f][c].esTransitable || this.mapaLaberinto[f][c].burbuja) && s < 1000);

        if (this.mapaLaberinto[f][c].esTransitable) {
            let nombre = "";
            let intentosNombre = 0;
            do {
                nombre = generateBubbleName();
                intentosNombre++;
            } while (nombresBurbujas.has(nombre) && intentosNombre < 100);

            nombresBurbujas.add(nombre);
            burbujas.push({ f, c, nombre });
        }
    }

    for (let i = 0; i < burbujas.length; i++) {
        const b = burbujas[i];
        const destino = burbujas[(i + 1) % burbujas.length].nombre;
        this.mapaLaberinto[b.f][b.c].burbuja = { nombreSecreto: b.nombre, destino: destino };
    }

    // Generar portales (0, 2 o 5)
    const opcionesPortales = [0, 2, 5];
    const numPortales = opcionesPortales[Math.floor(Math.random() * opcionesPortales.length)];
    for (let i = 0; i < numPortales; i++) {
        let f, c;
        let s = 0;
        do {
            f = Math.floor(Math.random() * this.config.NUMERO_FILAS);
            c = Math.floor(Math.random() * this.config.NUMERO_COLUMNAS);
            s++;
        } while ((!this.mapaLaberinto[f][c].esTransitable || this.mapaLaberinto[f][c].burbuja || this.mapaLaberinto[f][c].esPortal) && s < 1000);

        if (this.mapaLaberinto[f][c].esTransitable) {
            this.mapaLaberinto[f][c].esPortal = true;
        }
    }

    // Generar picos (0 a 10)
    const numPicos = Math.floor(Math.random() * 11);
    for (let i = 0; i < numPicos; i++) {
        let f, c;
        let s = 0;
        do {
            f = Math.floor(Math.random() * this.config.NUMERO_FILAS);
            c = Math.floor(Math.random() * this.config.NUMERO_COLUMNAS);
            s++;
        } while ((!this.mapaLaberinto[f][c].esTransitable || this.mapaLaberinto[f][c].burbuja || this.mapaLaberinto[f][c].esPortal || this.mapaLaberinto[f][c].tienePico) && s < 1000);

        if (this.mapaLaberinto[f][c].esTransitable) {
            this.mapaLaberinto[f][c].tienePico = true;
        }
    }
  }

  setupEntity(entity: any) {
    entity.onDamageReceived = (amount: number, e: any) => {
        const color = (e instanceof EnemigoNPC) ? "#00ff00" : "#ff0000";
        this.ui.crearTextoFlotanteEnCelda(e.fila, e.columna, `-${amount}`, color, this);

        if (e instanceof EnemigoNPC && this.network && this.network.multiplayerActivo) {
            if (this.esHost) {
                this.network.enviarMensaje({
                    tipo: 'npc_update',
                    id: e.id,
                    f: e.fila,
                    c: e.columna,
                    v: e.vidaActual
                });
            } else {
                this.network.enviarMensaje({
                    tipo: 'npc_damaged_by_guest',
                    id: e.id,
                    dano: amount
                });
            }
        }

        if (e instanceof JugadorRemoto && this.esHost && this.network && this.network.multiplayerActivo) {
            this.network.enviarMensaje({
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
        this.comprobarVictoria();
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
        do {
            f = Math.floor(Math.random() * this.config.NUMERO_FILAS);
            c = Math.floor(Math.random() * this.config.NUMERO_COLUMNAS);
            s++;
        } while (((f < 5 && c < 5) || !this.mapaLaberinto[f][c].esTransitable) && s < 1000);
        const t = tipos[i % tipos.length];
        const e = new EnemigoNPC(f, c, t, t, i, this.config.dificultad);
        this.setupEntity(e);
        this.listaDeEnemigos.push(e);
    }
  }

  obtenerPosicionInicioAleatoria(): {f: number, c: number} {
    let f = 0, c = 0;
    let valid = false;
    let attempts = 0;
    while (!valid && attempts < 1000) {
        f = Math.floor(Math.random() * this.config.NUMERO_FILAS);
        c = Math.floor(Math.random() * this.config.NUMERO_COLUMNAS);
        const dist = Math.abs(f - (this.config.NUMERO_FILAS - 1)) + Math.abs(c - (this.config.NUMERO_COLUMNAS - 1));
        if (this.mapaLaberinto[f][c].esTransitable && dist > 15) {
            valid = true;
        }
        attempts++;
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
    this.protagonista.enCombateCon = null;
    this.protagonista.puntosExperiencia = 0;
    this.juegoTerminado = false;
    document.getElementById('endGameUI')!.style.display = 'none';
    const xpVal = document.getElementById('xpVal');
    if (xpVal) xpVal.textContent = "0";
    this.registrarEventoLog("Has renacido en el inicio.");

    if (this.network && this.network.activo) {
        this.network.enviarMensaje({
            tipo: 'posicion',
            f: this.protagonista.fila,
            c: this.protagonista.columna,
            cam: false,
            id: this.network.idLocal,
            nick: this.protagonista.nombre,
            hp: this.protagonista.vidaActual,
            maxHp: this.protagonista.vidaMaxima
        });
    }
  }

  cicloDeJuego() {
    this.actualizar();
    this.renderer.limpiar();
    const offset = this.renderer.obtenerOffsetCamara(this.protagonista, this.config);

    this.renderer.aplicarZoom(this.config);
    this.renderer.dibujarLaberinto(this.mapaLaberinto, offset, this.config);

    let persistence = this.config.TIEMPO_DESVANECIMIENTO_NIEBLA;
    if (this.protagonista.clase === 'explorador') {
        persistence *= 1.5;
    }
    this.renderer.dibujarNiebla(this.mapaLaberinto, offset, this.config, persistence);

    this.protagonista.dibujar(this.renderer.getCtx(), offset, this.config);
    this.protagonista.dibujarBarraVida(this.renderer.getCtx(), offset, this.config, this.mapaLaberinto);
    this.protagonista.dibujarBubbleChat(this.renderer.getCtx(), offset, this.config);

    this.network.jugadoresRemotos.forEach(j => {
        if (j.entidad) {
            j.entidad.dibujar(this.renderer.getCtx(), offset, this.config);
            j.entidad.dibujarBarraVida(this.renderer.getCtx(), offset, this.config, this.mapaLaberinto);
            j.entidad.dibujarBubbleChat(this.renderer.getCtx(), offset, this.config);
        }
    });

    this.listaDeEnemigos.forEach(e => {
        if (e.estaVivo) {
            e.dibujar(this.renderer.getCtx(), offset, this.config, this.mapaLaberinto);
            e.dibujarBarraVida(this.renderer.getCtx(), offset, this.config, this.mapaLaberinto);
            e.dibujarBubbleChat(this.renderer.getCtx(), offset, this.config);
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

        if (f >= 0 && f < this.config.NUMERO_FILAS && c >= 0 && c < this.config.NUMERO_COLUMNAS) {
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
            this.renderer.dibujarRadar(r, offset, this.config, this.network.idLocal);
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

    this.renderer.dibujarMarcadoresMovimiento(this.config);
    this.renderer.dibujarUI(this);

    requestAnimationFrame(() => this.cicloDeJuego());
  }

  procesarTick() {
    if (!this.esHost) return;

    while (this.colaAcciones.length > 0) {
        const item = this.colaAcciones.shift();
        this.resolverAccion(item.id, item.accion);
    }

    this.listaDeEnemigos.forEach(e => (e as any).actualizarIA(this));

    this.enviarSnapshot();
  }

  enviarSnapshot() {
    const snapshot: any = {
        tipo: 'snapshot',
        entities: []
    };

    snapshot.entities.push({
        id: this.network.idLocal,
        f: this.protagonista.fila,
        c: this.protagonista.columna,
        v: this.protagonista.vidaActual,
        vm: this.protagonista.vidaMaxima,
        cam: this.protagonista.estaCaminando,
        viva: this.protagonista.estaVivo,
        nick: this.protagonista.nombre
    });

    this.network.jugadoresRemotos.forEach((j: any, id: string) => {
        if (j.entidad && id !== 'host') {
            snapshot.entities.push({
                id: id,
                f: j.entidad.fila,
                c: j.entidad.columna,
                v: j.entidad.vidaActual,
                vm: j.entidad.vidaMaxima,
                cam: j.entidad.estaCaminando,
                viva: j.entidad.estaVivo,
                nick: j.entidad.nombre
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
        isNpc: true
    })));

    this.network.enviarMensaje(snapshot);
  }

  actualizar() {
    if (!this.protagonista) return;

    // Actualizar UI de estadísticas en el menú superior
    const hpStat = document.getElementById('hpStat');
    const fueStat = document.getElementById('fueStat');
    const agiStat = document.getElementById('agiStat');
    const intStat = document.getElementById('intStat');
    const xpStat = document.getElementById('xpStat');

    if (hpStat) hpStat.textContent = `${Math.floor(this.protagonista.vidaActual)}/${this.protagonista.vidaMaxima}`;
    if (fueStat) fueStat.textContent = this.protagonista.fuerza.toString();
    if (agiStat) agiStat.textContent = this.protagonista.agilidad.toString();
    if (intStat) intStat.textContent = this.protagonista.inteligencia.toString();
    if (xpStat) xpStat.textContent = this.protagonista.puntosExperiencia.toString();

    if (this.esHost) {
        const ahoraTick = Date.now();
        if (ahoraTick - this.ultimoTick >= this.config.tickRate) {
            this.procesarTick();
            this.ultimoTick = ahoraTick;
        }
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
                if (this.esHost && this.network.multiplayerActivo) {
                    this.network.enviarMensaje({ tipo: 'host_migration_trigger', reason: 'death' });
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

    if (!this.network.multiplayerActivo) {
        this.listaDeEnemigos.forEach(e => (e as any).actualizarIA(this));
    }

    let r = this.config.RADIO_VISION;
    if (this.protagonista.clase === 'explorador') {
        r *= 1.2;
    }

    for (let f = Math.max(0, this.protagonista.fila - Math.ceil(r)); f <= Math.min(this.config.NUMERO_FILAS - 1, this.protagonista.fila + Math.ceil(r)); f++) {
        for (let c = Math.max(0, this.protagonista.columna - Math.ceil(r)); c <= Math.min(this.config.NUMERO_COLUMNAS - 1, this.protagonista.columna + Math.ceil(r)); c++) {
            if (Math.sqrt(Math.pow(f - this.protagonista.fila, 2) + Math.pow(c - this.protagonista.columna, 2)) <= r) {
                this.mapaLaberinto[f][c].ultimoAvistamiento = ahora;
            }
        }
    }

  }

  enviarMapaAlInvitado(guestId: string) {
    const jInfo = this.network.jugadoresRemotos.get(guestId);
    if (!jInfo || !jInfo.dc || jInfo.dc.readyState !== "open") return;

    const mapaCompacto = serializarMapa(this.mapaLaberinto);
    const enemigos = this.listaDeEnemigos.map(e => ({
        id: e.id, f: e.fila, c: e.columna, n: e.nombre, t: e.tipo, v: e.vidaActual, vm: e.vidaMaxima
    }));

    jInfo.dc.send(JSON.stringify({ tipo: 'mapa', datos: mapaCompacto, dificultad: this.config.dificultad }));
    jInfo.dc.send(JSON.stringify({ tipo: 'enemigos', lista: enemigos }));

    const objetos: any[] = [];
    for (let f = 0; f < this.config.NUMERO_FILAS; f++) {
        for (let c = 0; c < this.config.NUMERO_COLUMNAS; c++) {
            const celda = this.mapaLaberinto[f][c];
            if (celda.alimento || celda.burbuja || celda.tienePico || celda.esPortal) {
                objetos.push({ f, c, a: celda.alimento, b: celda.burbuja, p: celda.tienePico, pr: celda.esPortal });
            }
        }
    }
    jInfo.dc.send(JSON.stringify({ tipo: 'objetos', lista: objetos }));

    const posSpawn = this.obtenerPosicionInicioAleatoria();
    jInfo.dc.send(JSON.stringify({ tipo: 'spawn', f: posSpawn.f, c: posSpawn.c }));

    // Sincronizar la posición del invitado en la representación del Host
    if (jInfo.entidad) {
        jInfo.entidad.fila = posSpawn.f;
        jInfo.entidad.columna = posSpawn.c;
    }

    this.network.jugadoresRemotos.forEach((other, otherId) => {
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
        cam: false, nick: this.protagonista.nombre, id: this.network.idLocal,
        hp: this.protagonista.vidaActual, maxHp: this.protagonista.vidaMaxima
    }));
  }

  comprobarVictoria() {
    if (this.protagonista.fila === this.config.NUMERO_FILAS - 1 && this.protagonista.columna === this.config.NUMERO_COLUMNAS - 1) {
        this.juegoTerminado = true;
        this.registrarEventoLog("¡Has escapado!");
        if (this.network.activo) this.network.enviarMensaje({ tipo: 'victoria', nick: this.protagonista.nombre });
    }
  }


  obtenerEntidadPorNombre(nombre: string) {
    if (nombre === this.protagonista.nombre) return this.protagonista;
    let found = null;
    this.network.jugadoresRemotos.forEach(j => {
        if (j.entidad && j.entidad.nombre === nombre) found = j.entidad;
    });
    return found;
  }

  obtenerEntidadPorId(id: string) {
    if (id === this.network.idLocal) return this.protagonista;
    const j = this.network.jugadoresRemotos.get(id);
    return j ? j.entidad : null;
  }

  resolverAccion(id: string, accion: any) {
    const entidad = this.obtenerEntidadPorId(id);
    if (!entidad) {
        console.warn(`resolverAccion: No se encontró entidad para ID ${id}`);
        return;
    }
    if (!entidad.estaVivo) {
        console.warn(`resolverAccion: La entidad ${entidad.nombre} está muerta`);
        return;
    }

    if (accion.tipo === 'mover') {
        const { df, dc } = accion;
        const sigFila = entidad.fila + df;
        const sigColumna = entidad.columna + dc;

        // 1. Verificar colisión con otros jugadores
        let jugadorChocadoId: string | null = null;
        let jugadorChocado: any = null;

        if (id !== this.network.idLocal && this.protagonista.fila === sigFila && this.protagonista.columna === sigColumna) {
            jugadorChocadoId = this.network.idLocal;
            jugadorChocado = this.protagonista;
        } else {
            this.network.jugadoresRemotos.forEach((v: any, k: string) => {
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
                    this.network.enviarMensaje({
                        tipo: 'hp_transfer',
                        fromId: id,
                        toId: jugadorChocadoId,
                        amount: 1
                    });
                    this.network.enviarMensaje({
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

        // 4. Límites del mapa
        if (sigFila < 0 || sigFila >= this.config.NUMERO_FILAS || sigColumna < 0 || sigColumna >= this.config.NUMERO_COLUMNAS) {
            console.warn(`resolverAccion: Intento de movimiento fuera de límites por ${entidad.nombre}`);
            return;
        }

        // 5. Muros y transitable
        const celdaActual = this.mapaLaberinto[entidad.fila][entidad.columna];
        let esMovimientoValido = false;
        if (df === -1 && !celdaActual.muros.superior && this.mapaLaberinto[sigFila][sigColumna].esTransitable) esMovimientoValido = true;
        if (df === 1 && !celdaActual.muros.inferior && this.mapaLaberinto[sigFila][sigColumna].esTransitable) esMovimientoValido = true;
        if (dc === -1 && !celdaActual.muros.izquierdo && this.mapaLaberinto[sigFila][sigColumna].esTransitable) esMovimientoValido = true;
        if (dc === 1 && !celdaActual.muros.derecho && this.mapaLaberinto[sigFila][sigColumna].esTransitable) esMovimientoValido = true;

        if (!esMovimientoValido) {
            console.warn(`resolverAccion: Movimiento inválido para ${entidad.nombre} hacia (${sigFila}, ${sigColumna}) desde (${entidad.fila}, ${entidad.columna})`);
        }

        if (!esMovimientoValido && (entidad as any).tienePico) {
            const celdaObjetivo = this.mapaLaberinto[sigFila][sigColumna];
            if ((entidad as any).ultimaCasillaAtacada && (entidad as any).ultimaCasillaAtacada.f === sigFila && (entidad as any).ultimaCasillaAtacada.c === sigColumna) {
                celdaObjetivo.golpesCavar++;
            } else {
                celdaObjetivo.golpesCavar = 1;
                (entidad as any).ultimaCasillaAtacada = { f: sigFila, c: sigColumna };
            }
            if (celdaObjetivo.golpesCavar >= 5) {
                celdaObjetivo.esTransitable = true;
                celdaObjetivo.golpesCavar = 0;
                eliminarMurosEntre(this.mapaLaberinto[entidad.fila][entidad.columna], celdaObjetivo);
                this.network.enviarMensaje({
                    tipo: 'dig_completed',
                    f: sigFila,
                    c: sigColumna,
                    fromF: entidad.fila,
                    fromC: entidad.columna
                });
            }
            return;
        }

        if (esMovimientoValido) {
            entidad.fila = sigFila;
            entidad.columna = sigColumna;
            console.log(`resolverAccion: ${entidad.nombre} movido a (${sigFila}, ${sigColumna})`);
            entidad.estaCaminando = true;
            const celdaNueva = this.mapaLaberinto[entidad.fila][entidad.columna];
            (entidad as any).ultimaCasillaAtacada = null;

            if (celdaNueva.tienePico) {
                (entidad as any).tienePico = true;
                celdaNueva.tienePico = false;
                this.network.enviarMensaje({ tipo: 'pick_collected', f: entidad.fila, c: entidad.columna });
            }
            if (celdaNueva.alimento) {
                const PC = celdaNueva.alimento.pc;
                const CC = ((3 * entidad.fuerza) + (2 * entidad.agilidad) + (1 * entidad.inteligencia)) / 6;
                const recuperacion = Math.floor(PC / CC);
                entidad.vidaActual = Math.min(entidad.vidaMaxima, entidad.vidaActual + Math.max(1, recuperacion));
                celdaNueva.alimento = null;
                this.network.enviarMensaje({ tipo: 'food_consumed', f: entidad.fila, c: entidad.columna });
            }
            if (celdaNueva.burbuja) {
                const ahoraB = Date.now();
                if (ahoraB > entidad.inmunidadHasta) {
                    entidad.inmunidadHasta = ahoraB + 30000;
                }
            }
            this.verificarPortal(entidad);

            (entidad as any).pasosDesdeUltimoDano = ((entidad as any).pasosDesdeUltimoDano || 0) + 1;
            const factorDificultad = this.config.dificultad === 'facil' ? 1 : (this.config.dificultad === 'medio' ? 2 : 3);
            if ((entidad as any).pasosDesdeUltimoDano >= 10 * factorDificultad) {
                (entidad as any).pasosDesdeUltimoDano = 0;
                entidad.vidaActual = Math.min(entidad.vidaMaxima, entidad.vidaActual + 1);
            }
        }
    } else if (accion.tipo === 'fireball') {
        this.lanzarBolaDeFuego(entidad, false);
    } else if (accion.tipo === 'bow') {
        this.lanzarArco(entidad, false);
    } else if (accion.tipo === 'create_food') {
        this.crearComidaHabilidad(entidad, false);
    } else if (accion.tipo === 'radar') {
        this.lanzarRadar(entidad, false);
    } else if (accion.tipo === 'whirlwind') {
        this.lanzarWhirlwind(entidad, false);
    } else if (accion.tipo === 'freeze') {
        this.lanzarCongelar(entidad, false);
    } else if (accion.tipo === 'stop_walking') {
        entidad.estaCaminando = false;
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
    if (!this.esHost && this.network.multiplayerActivo && esLocal) {
        this.network.enviarMensaje({ tipo: 'request_guard_teleport' });
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
            if (nf >= 0 && nf < this.config.NUMERO_FILAS && nc >= 0 && nc < this.config.NUMERO_COLUMNAS) {
                if (this.mapaLaberinto[nf][nc].esTransitable) {
                    posicionesLibres.push({ f: nf, c: nc });
                }
            }
        }
    }

    // Si no hay suficientes adyacentes, buscar un poco más allá
    if (posicionesLibres.length < this.network.jugadoresRemotos.size + 1) {
         for (let r = 2; r <= 3; r++) {
            for (let df = -r; df <= r; df++) {
                for (let dc = -r; dc <= r; dc++) {
                    const nf = lider.fila + df;
                    const nc = lider.columna + dc;
                    if (nf >= 0 && nf < this.config.NUMERO_FILAS && nc >= 0 && nc < this.config.NUMERO_COLUMNAS) {
                        if (this.mapaLaberinto[nf][nc].esTransitable && !posicionesLibres.some(p => p.f === nf && p.c === nc)) {
                            posicionesLibres.push({ f: nf, c: nc });
                        }
                    }
                }
            }
         }
    }

    let idx = 0;
    this.network.jugadoresRemotos.forEach((j, id) => {
        // No teletransportar al líder si es uno de los jugadores remotos
        if (j.entidad && j.entidad !== lider && idx < posicionesLibres.length) {
            const pos = posicionesLibres[idx++];
            j.entidad.fila = pos.f;
            j.entidad.columna = pos.c;
            if (this.esHost) {
                this.network.enviarMensaje({ tipo: 'force_teleport', id: id, f: pos.f, c: pos.c });
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

        if (this.network && this.network.multiplayerActivo) {
            if (this.esHost) {
                this.colaAcciones.push({ id: this.network.idLocal, accion: { tipo: 'freeze' } });
            } else {
                this.network.enviarMensaje({ tipo: 'action', accion: { tipo: 'freeze' } });
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

    if (this.esHost || (this.network && !this.network.multiplayerActivo)) {
        // Inmovilizar NPCs en el área
        this.listaDeEnemigos.forEach(e => {
            if (e.estaVivo && Math.sqrt(Math.pow(e.fila - emisor.fila, 2) + Math.pow(e.columna - emisor.columna, 2)) <= 4) {
                e.inmovilizadoHasta = ahora + duracion;
                this.registrarEventoLog(`¡${e.nombre} ha sido congelado!`);
            }
        });
    }

    if (this.esHost && this.network && this.network.multiplayerActivo) {
        this.network.enviarMensaje({
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

        if (this.network && this.network.multiplayerActivo) {
            if (this.esHost) {
                this.colaAcciones.push({ id: this.network.idLocal, accion: { tipo: 'whirlwind' } });
            } else {
                this.network.enviarMensaje({ tipo: 'action', accion: { tipo: 'whirlwind' } });
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

    if (this.esHost || (this.network && !this.network.multiplayerActivo)) {
        // Daño a NPCs circundantes
        const danoExtra = 1 + (10 * emisor.fuerza / 100);
        this.listaDeEnemigos.forEach(e => {
            if (e.estaVivo && Math.abs(e.fila - emisor.fila) <= 1 && Math.abs(e.columna - emisor.columna) <= 1) {
                const vA = emisor.generarAtaque() * danoExtra;
                const vD = e.generarDefensa();
                const d = Math.max(1, Math.floor(vA - vD));
                e.recibirDano(d);
                this.registrarEventoLog(`¡Golpe de Giro! ${emisor.nombre} daña a ${e.nombre} (-${d} HP)`);
            }
        });
    }

    if (this.esHost && this.network && this.network.multiplayerActivo) {
        this.network.enviarMensaje({
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

        if (this.network && this.network.multiplayerActivo) {
            if (this.esHost) {
                this.colaAcciones.push({ id: this.network.idLocal, accion: { tipo: 'fireball' } });
            } else {
                this.network.enviarMensaje({ tipo: 'action', accion: { tipo: 'fireball' } });
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
            aplicarDano: this.esHost || !this.network.multiplayerActivo,
            color: "#ff4500"
        });
        this.registrarEventoLog(`¡${emisor.nombre} lanza una bola de fuego!`);

        if (this.esHost && this.network.multiplayerActivo) {
            this.network.enviarMensaje({
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

  lanzarArco(emisor: any, esLocal: boolean) {
      const ahora = Date.now();
      const cooldown = (10 / emisor.agilidad) * 1000;

      if (esLocal && emisor === this.protagonista) {
          if (ahora - emisor.ultimaVezHabilidad.bow < cooldown) return;
          emisor.ultimaVezHabilidad.bow = ahora;

          if (this.network && this.network.multiplayerActivo) {
              if (this.esHost) {
                  this.colaAcciones.push({ id: this.network.idLocal, accion: { tipo: 'bow' } });
              } else {
                  this.network.enviarMensaje({ tipo: 'action', accion: { tipo: 'bow' } });
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
              aplicarDano: this.esHost || !this.network.multiplayerActivo,
              color: "#aaa",
              esFlecha: true
          });
          this.registrarEventoLog(`¡${emisor.nombre} dispara una flecha!`);

          if (this.esHost && this.network.multiplayerActivo) {
              this.network.enviarMensaje({
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

          if (this.network && this.network.multiplayerActivo) {
              if (this.esHost) {
                  this.colaAcciones.push({ id: this.network.idLocal, accion: { tipo: 'create_food' } });
              } else {
                  this.network.enviarMensaje({ tipo: 'action', accion: { tipo: 'create_food' } });
              }
              return;
          }
      }

      if (!this.esHost && this.network.multiplayerActivo) return;

      let f: number, c: number;
      let intentos = 0;
      do {
          const dist = Math.floor(Math.random() * 3) + 1;
          const angle = Math.random() * Math.PI * 2;
          f = Math.round(emisor.fila + Math.sin(angle) * dist);
          c = Math.round(emisor.columna + Math.cos(angle) * dist);
          intentos++;
      } while (
          (f < 0 || f >= this.config.NUMERO_FILAS || c < 0 || c >= this.config.NUMERO_COLUMNAS ||
          !this.mapaLaberinto[f][c].esTransitable || this.mapaLaberinto[f][c].alimento) && intentos < 20
      );

      if (f >= 0 && f < this.config.NUMERO_FILAS && c >= 0 && c < this.config.NUMERO_COLUMNAS && this.mapaLaberinto[f][c].esTransitable) {
          const alimentos = [
              { tipo: "Manzana", pc: 5 }, { tipo: "Plátano", pc: 8 }, { tipo: "Kiwi", pc: 10 },
              { tipo: "Brócoli", pc: 25 }, { tipo: "Muslo de pollo", pc: 35 }, { tipo: "Chuleta", pc: 40 },
              { tipo: "Pescado", pc: 70 }
          ];
          const alimento = alimentos[Math.floor(Math.random() * alimentos.length)];
          this.mapaLaberinto[f][c].alimento = alimento;
          this.registrarEventoLog(`${emisor.nombre} ha creado ${alimento.tipo}.`);
          this.ui.crearTextoFlotanteEnCelda(f, c, "¡COMIDA!", "#ffcc00", this);

          if (this.esHost && this.network.multiplayerActivo) {
              this.network.enviarMensaje({
                  tipo: 'object_spawned',
                  f, c, a: alimento
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

        if (this.network && this.network.multiplayerActivo) {
            if (this.esHost) {
                this.colaAcciones.push({ id: this.network.idLocal, accion: { tipo: 'radar' } });
            } else {
                this.network.enviarMensaje({ tipo: 'action', accion: { tipo: 'radar' } });
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
        idEmisor: emisor.id || (this.network ? this.network.idLocal : 'unknown')
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
    if (this.network && this.network.jugadoresRemotos) {
        this.network.jugadoresRemotos.forEach((j: any) => {
            if (j.entidad && j.entidad !== emisor) {
                const dist = Math.sqrt(Math.pow(j.entidad.fila - emisor.fila, 2) + Math.pow(j.entidad.columna - emisor.columna, 2));
                entidades.push({ f: j.entidad.fila, c: j.entidad.columna, npc: false, dist } as any);
            }
        });
    }

    entidades.sort((a: any, b: any) => a.dist - b.dist);
    radarObj.respuestas = entidades.slice(0, 5);

    this.radares.push(radarObj);

    if (this.esHost && this.network && this.network.multiplayerActivo) {
        this.network.enviarMensaje({
            tipo: 'radar_spawn',
            x: emisor.columna,
            y: emisor.fila,
            respuestas: radarObj.respuestas,
            idEmisor: radarObj.idEmisor
        });
    }
  }

  verificarPortal(entidad: any) {
    const celda = this.mapaLaberinto[entidad.fila][entidad.columna];
    if (celda.esPortal) {
        const todosLosPortales: {f: number, c: number}[] = [];
        for (let f = 0; f < this.config.NUMERO_FILAS; f++) {
            for (let c = 0; c < this.config.NUMERO_COLUMNAS; c++) {
                if (this.mapaLaberinto[f][c].esPortal && (f !== entidad.fila || c !== entidad.columna)) {
                    todosLosPortales.push({ f, c });
                }
            }
        }
        if (todosLosPortales.length > 0) {
            const dest = todosLosPortales[Math.floor(Math.random() * todosLosPortales.length)];
            entidad.fila = dest.f;
            entidad.columna = dest.c;
            this.registrarEventoLog(`${entidad.nombre} ha atravesado un portal.`);
            if (entidad === this.protagonista) {
                this.ui.crearTextoFlotanteEnCelda(dest.f, dest.c, "¡PORTAL!", "#0000ff", this);
                if (this.network && this.network.activo) {
                    this.network.enviarMensaje({
                        tipo: 'posicion',
                        f: dest.f, c: dest.c, cam: false,
                        id: this.network.idLocal, nick: this.protagonista.nombre,
                        hp: this.protagonista.vidaActual, maxHp: this.protagonista.vidaMaxima
                    });
                }
            }
        }
    }
  }

  obtenerEnemigoAMostrar() {
    return this.listaDeEnemigos.find(e => e.enCombateCon === this.protagonista) ||
           this.listaDeEnemigos.filter(e => e.estaVivo && this.mapaLaberinto[e.fila][e.columna].ultimoAvistamiento > 0).sort((a,b) => a.fila - b.fila)[0];
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
        const vA = l.generarAtaque();
        const vD = o.generarDefensa();
        let d = Math.max(0, vA - vD);

        // Inmunidad en modo debug para el protagonista
        if (o === this.protagonista && this.config.vistaDebugActivada) {
            d = 0;
        }

        o.recibirDano(d);
        this.registrarEventoLog(`${l.nombre} -> ${o.nombre} (-${d} HP)`);
        if (!o.estaVivo) {
            this.registrarEventoLog(`${o.nombre} derrotado.`);
            l.enCombateCon = null;
            if (o === this.protagonista) {
                this.juegoTerminado = true;
            } else if (l === this.protagonista) {
                this.protagonista.puntosExperiencia += o.puntosExperiencia;
                this.registrarEventoLog(`¡Has ganado ${o.puntosExperiencia} XP!`);
                const xpVal = document.getElementById('xpVal');
                if (xpVal) xpVal.textContent = this.protagonista.puntosExperiencia.toString();
            }
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
            break;
        case 'freeze_spawn':
            if (!this.esHost) {
                this.freezes.push({
                    x: msg.x,
                    y: msg.y,
                    radio: msg.r,
                    inicio: Date.now(),
                    duracion: msg.d
                });
            }
            break;
        case 'whirlwind_spawn':
            if (!this.esHost) {
                this.whirlwinds.push({
                    x: msg.x,
                    y: msg.y,
                    inicio: Date.now(),
                    duracion: 800
                });
            }
            break;
        case 'object_spawned':
            if (!this.esHost) {
                const celda = this.mapaLaberinto[msg.f][msg.c];
                if (msg.a) celda.alimento = msg.a;
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
                        }
                    } else {
                        if (entData.id === this.network.idLocal) {
                            this.protagonista.fila = entData.f;
                            this.protagonista.columna = entData.c;
                            this.protagonista.vidaActual = entData.v;
                            this.protagonista.vidaMaxima = entData.vm;
                            this.protagonista.estaVivo = entData.viva;
                            this.protagonista.estaCaminando = entData.cam;
                        } else {
                            let rem = this.network.jugadoresRemotos.get(entData.id);
                            if (!rem) {
                                // Crear entrada si no existe (para otros invitados o host recién identificado)
                                rem = { pc: null as any, dc: null as any, entidad: null, unsubscribes: [] };
                                this.network.jugadoresRemotos.set(entData.id, rem);
                            }

                            if (rem && rem.entidad) {
                                rem.entidad.fila = entData.f;
                                rem.entidad.columna = entData.c;
                                rem.entidad.vidaActual = entData.v;
                                rem.entidad.vidaMaxima = entData.vm;
                                rem.entidad.estaVivo = entData.viva;
                                rem.entidad.estaCaminando = entData.cam;
                                rem.entidad.nombre = entData.nick;
                            } else if (rem) {
                                rem.entidad = new JugadorRemoto(entData.f, entData.c, entData.nick, entData.id);
                                this.setupEntity(rem.entidad);
                            }
                        }
                    }
                });
            }
            break;
        case 'radar_spawn':
            if (!this.esHost) {
                this.radares.push({
                    x: msg.x,
                    y: msg.y,
                    inicio: Date.now(),
                    duracion: 5000,
                    respuestas: msg.respuestas,
                    idEmisor: msg.idEmisor
                });
            }
            break;
        case 'handshake':
            let realId = idSujeto;
            if (idEmisor === 'host' && !this.esHost) {
                const hostInfo = this.network.jugadoresRemotos.get('host');
                if (hostInfo) {
                    this.network.jugadoresRemotos.delete('host');
                    this.network.jugadoresRemotos.set(realId, hostInfo);
                    this.network.idRealDelHost = realId;
                }
            }

            if (!this.network.jugadoresRemotos.has(realId)) {
                const pc: any = null;
                const dc: any = null;
                this.network.jugadoresRemotos.set(realId, { pc, dc, entidad: null, unsubscribes: [] });
            }
            const jInfo = this.network.jugadoresRemotos.get(realId)!;
            if (!jInfo.entidad) {
                jInfo.entidad = new JugadorRemoto(0, 0, msg.nick, idSujeto);
                this.setupEntity(jInfo.entidad);
            }

            if (this.esHost) {
                this.network.enviarMensaje({ ...msg, id: idSujeto }, idEmisor);
            } else {
                this.network.enviarMensaje({ tipo: 'handshake_ack', nick: this.protagonista.nombre, id: this.network.idLocal });
            }
            break;
        case 'handshake_ack':
            if (this.esHost) {
                const jInfoAck = this.network.jugadoresRemotos.get(idSujeto);
                if (jInfoAck && jInfoAck.entidad) jInfoAck.entidad.nombre = msg.nick;
                this.enviarMapaAlInvitado(idSujeto);
            }
            break;
        case 'mapa':
            deserializarMapa(this.mapaLaberinto, msg.datos);
            if (msg.dificultad) this.config.dificultad = msg.dificultad;
            break;
        case 'enemigos':
            this.listaDeEnemigos = msg.lista.map((d: any) => {
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
            if (!this.motorIniciado) {
                this.mundoSincronizado = true;
                this.ui.ocultarLobby();
                this.iniciarMotorJuego();
            }
            break;
        case 'food_consumed':
            const celdaFood = this.mapaLaberinto[msg.f][msg.c];
            celdaFood.alimento = null;
            if (this.esHost) this.network.enviarMensaje(msg, idEmisor);
            break;
        case 'pick_collected':
            const celdaPick = this.mapaLaberinto[msg.f][msg.c];
            celdaPick.tienePico = false;
            if (this.esHost) this.network.enviarMensaje(msg, idEmisor);
            break;
        case 'dig_completed':
            const celdaDig = this.mapaLaberinto[msg.f][msg.c];
            celdaDig.esTransitable = true;
            if (msg.fromF !== undefined && msg.fromC !== undefined) {
                eliminarMurosEntre(this.mapaLaberinto[msg.fromF][msg.fromC], celdaDig);
            }
            if (this.esHost) this.network.enviarMensaje(msg, idEmisor);
            break;
        case 'force_teleport':
            if (msg.id === this.network.idLocal) {
                this.protagonista.fila = msg.f;
                this.protagonista.columna = msg.c;
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
            const jPos = this.network.jugadoresRemotos.get(idSujeto);
            if (jPos && jPos.entidad) {
                jPos.entidad.fila = msg.f;
                jPos.entidad.columna = msg.c;
                jPos.entidad.estaCaminando = msg.cam;
                if (msg.hp !== undefined) {
                    jPos.entidad.vidaActual = msg.hp;
                    jPos.entidad.vidaMaxima = msg.maxHp;
                    jPos.entidad.estaVivo = msg.hp > 0;
                }
            }
            if (this.esHost) this.network.enviarMensaje({ ...msg, id: idSujeto }, idEmisor);
            break;
        case 'chat':
            this.ui.manejarMensajeChat(msg.nick || "Desconocido", msg.texto, false, this, idSujeto);
            if (this.esHost) this.network.enviarMensaje({ ...msg, id: idSujeto }, idEmisor);
            break;
        case 'hp_transfer':
            if (msg.toId === this.network.idLocal) {
                this.protagonista.vidaActual = Math.min(this.protagonista.vidaMaxima, this.protagonista.vidaActual + msg.amount);
                this.ui.crearTextoFlotanteEnCelda(this.protagonista.fila, this.protagonista.columna, `+${msg.amount} HP`, "#00ff00", this);
                this.registrarEventoLog(`Has recibido vida de un compañero.`);
            } else {
                const target = this.network.jugadoresRemotos.get(msg.toId);
                if (target && target.entidad) {
                    target.entidad.vidaActual = Math.min(target.entidad.vidaMaxima, target.entidad.vidaActual + msg.amount);
                    this.ui.crearTextoFlotanteEnCelda(target.entidad.fila, target.entidad.columna, `+${msg.amount} HP`, "#00ff00", this);
                }
            }
            if (this.esHost) this.network.enviarMensaje({ ...msg }, idEmisor);
            break;
        case 'hp_loss':
            if (msg.id === this.network.idLocal) {
                this.protagonista.vidaActual = Math.max(0, this.protagonista.vidaActual - msg.amount);
            } else {
                const target = this.network.jugadoresRemotos.get(msg.id);
                if (target && target.entidad) {
                    target.entidad.vidaActual = Math.max(0, target.entidad.vidaActual - msg.amount);
                    this.ui.crearTextoFlotanteEnCelda(target.entidad.fila, target.entidad.columna, `-${msg.amount} HP`, "#ff0000", this);
                }
            }
            if (this.esHost) this.network.enviarMensaje({ ...msg }, idEmisor);
            break;
        case 'npc_update':
            const npc = this.listaDeEnemigos.find(e => e.id === msg.id);
            if (npc) {
                npc.fila = msg.f; npc.columna = msg.c; npc.vidaActual = msg.v;
                if (npc.vidaActual <= 0) npc.estaVivo = false;
            }
            break;
        case 'npc_damaged_by_guest':
            if (this.esHost) {
                const targetNpc = this.listaDeEnemigos.find(e => e.id === msg.id);
                if (targetNpc) targetNpc.recibirDano(msg.dano);
            }
            break;
        case 'victoria':
            this.juegoTerminado = true;
            this.registrarEventoLog(`${msg.nick} ha ganado!`);
            break;
        case 'host_migration_trigger':
            this.registrarEventoLog(`Iniciando migración de Host (Razón: ${msg.reason})`);
            this.iniciarEleccionHost();
            break;
        case 'spawn':
            this.protagonista.fila = msg.f;
            this.protagonista.columna = msg.c;
            this.asustarMonstruosCercanos(msg.f, msg.c);
            break;
        case 'fireball_spawn':
            if (!this.esHost) {
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
            break;
        case 'npc_sync_all':
            msg.lista.forEach((d: any) => {
                const npc = this.listaDeEnemigos.find(e => e.id === d.id);
                if (npc) {
                    npc.fila = d.f;
                    npc.columna = d.c;
                    npc.vidaActual = d.v;
                    npc.vidaMaxima = d.vm;
                    npc.estaVivo = npc.vidaActual > 0;
                }
            });
            break;
    }
  }
}

new Game();
