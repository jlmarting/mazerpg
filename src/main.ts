import './style.css';
import { Celda } from './world/Celda';
import { Jugador } from './entities/Jugador';
import { JugadorRemoto } from './entities/JugadorRemoto';
import { EnemigoNPC } from './entities/EnemigoNPC';
import { Renderer } from './core/Renderer';
import { UIManager } from './ui/UIManager';
import { FirebaseManager } from './network/FirebaseManager';
import { NetworkManager } from './network/NetworkManager';
import { generarLaberintoBSP } from './world/generation';
import { serializarMapa, deserializarMapa } from './world/serialization';
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
    vistaDebugActivada: false
  };
  public juegoTerminado: boolean = false;
  public mundoSincronizado: boolean = false;
  public esHost: boolean = false;
  public motorIniciado: boolean = false;
  public colaDeMensajes: string[] = [];

  constructor() {
    const canvas = document.getElementById('mazeCanvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.setupEntity(this.protagonista);
    this.initMap();
    this.ajustarDimensiones();
    window.addEventListener('resize', () => this.ajustarDimensiones());
    this.setupEventListeners();

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const toque = e.touches[0];
        this.manejarTap(toque.clientX, toque.clientY);
    }, { passive: false });

    canvas.addEventListener('mousedown', (e) => {
        this.manejarTap(e.clientX, e.clientY);
    });
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

    this.config.CELDAS_VISIBLES_X = Math.floor(canvas.width / this.config.TAMANO_CELDA);
    this.config.CELDAS_VISIBLES_Y = Math.floor((canvas.height - this.config.ALTO_UI_TOP - this.config.ALTO_UI_BOTTOM) / this.config.TAMANO_CELDA);
  }

  setupEventListeners() {
    document.getElementById('menuToggle')?.addEventListener('click', () => {
      document.getElementById('topMenu')?.classList.toggle('visible');
    });

    document.getElementById('btnDebug')?.addEventListener('click', () => {
      this.config.vistaDebugActivada = !this.config.vistaDebugActivada;
      this.registrarEventoLog(`Modo Desarrollo ${this.config.vistaDebugActivada ? 'ACTIVADO' : 'DESACTIVADO'}`);
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

    document.getElementById('btnSolo')?.addEventListener('click', () => this.empezarSolo());
    document.getElementById('btnCrearPartida')?.addEventListener('click', () => this.iniciarComoHostFirebase());
    document.getElementById('btnUnirseLobby')?.addEventListener('click', () => this.mostrarLobbyFirebase());
    document.getElementById('btnVolverLobbyFirebase')?.addEventListener('click', () => this.regresarAlLobby());
    document.getElementById('btnVolverLobbyManual')?.addEventListener('click', () => this.regresarAlLobby());
    document.getElementById('btnLobbyManual')?.addEventListener('click', () => {
      document.getElementById('lobbyInitial')!.style.display = 'none';
      document.getElementById('lobbyManual')!.style.display = 'flex';
    });

    document.getElementById('btnRefrescar')?.addEventListener('click', () => this.listarPartidasFirestore());

    document.getElementById('btnRespawn')?.addEventListener('click', () => this.respawnPlayer());
    document.getElementById('btnEmpezar')?.addEventListener('click', () => this.respawnPlayer());
    document.getElementById('btnSalir')?.addEventListener('click', () => window.location.reload());

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

      if (haMovido) {
        this.comprobarVictoria();
      }
    });

    window.addEventListener('keyup', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            this.protagonista.estaCaminando = false;
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
    });
  }

  empezarSolo() {
    this.protagonista.nombre = (document.getElementById('nickInput') as HTMLInputElement).value || "Héroe";
    const pos = this.obtenerPosicionInicioAleatoria();
    this.protagonista.fila = pos.f;
    this.protagonista.columna = pos.c;
    this.mundoSincronizado = true;
    this.ui.ocultarLobby();
    this.iniciarMotorJuego();
  }

  iniciarComoHostFirebase() {
    this.esHost = true;
    this.network.esHost = true;
    this.protagonista.nombre = (document.getElementById('nickInput') as HTMLInputElement).value || "Host";
    (document.getElementById('btnAceptarJugadores') as HTMLButtonElement).disabled = false;
    this.crearPartidaFirestore();
  }

  async crearPartidaFirestore() {
    const id = Math.random().toString(36).substr(2, 6).toUpperCase();
    this.network.idPartidaActual = id;
    const pos = this.obtenerPosicionInicioAleatoria();
    this.protagonista.fila = pos.f;
    this.protagonista.columna = pos.c;
    await this.firebase.crearPartida(id, this.network.idLocal, this.protagonista.nombre);

    setInterval(() => {
        if (this.esHost && this.network.idPartidaActual) {
            this.firebase.updateHeartbeat(this.network.idPartidaActual, this.network.jugadoresRemotos.size + 1);
        }
    }, 10000);

    setInterval(() => {
        if (this.esHost && this.network.multiplayerActivo) {
            const lista = this.listaDeEnemigos.map(e => ({
                id: e.id, f: e.fila, c: e.columna, v: e.vidaActual, vm: e.vidaMaxima
            }));
            this.network.enviarMensaje({ tipo: 'npc_sync_all', lista });
        }
    }, 5000);

    this.ui.registrarLogConexion(`Partida creada: ${id}`);
    const roomDisp = document.getElementById('roomDisplay');
    const roomIdVal = document.getElementById('roomIdVal');
    if (roomDisp && roomIdVal) {
        roomDisp.style.display = 'block';
        roomIdVal.textContent = id;
    }
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

  async unirseAPartidaFirestore(id: string) {
    this.network.idPartidaActual = id;
    const roomDisp = document.getElementById('roomDisplay');
    const roomIdVal = document.getElementById('roomIdVal');
    if (roomDisp && roomIdVal) {
        roomDisp.style.display = 'block';
        roomIdVal.textContent = id;
    }
    this.protagonista.nombre = (document.getElementById('nickInput') as HTMLInputElement).value || "Invitado";
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
    if (this.network.idPartidaActual) {
        await this.firebase.getDb()!.collection('partidas').doc(this.network.idPartidaActual).update({
            hostId: this.network.idLocal,
            hostNick: this.protagonista.nombre
        });
        this.registrarEventoLog("Ahora eres el Host de la partida.");

        setInterval(() => {
            if (this.esHost && this.network.idPartidaActual) {
                this.firebase.updateHeartbeat(this.network.idPartidaActual, this.network.jugadoresRemotos.size + 1);
            }
        }, 10000);

        setInterval(() => {
            if (this.esHost && this.network.multiplayerActivo) {
                const lista = this.listaDeEnemigos.map(e => ({
                    id: e.id, f: e.fila, c: e.columna, v: e.vidaActual, vm: e.vidaMaxima
                }));
                this.network.enviarMensaje({ tipo: 'npc_sync_all', lista });
            }
        }, 5000);

        (document.getElementById('btnAceptarJugadores') as HTMLButtonElement).disabled = false;
    }
  }

  regresarAlLobby() {
    document.getElementById('lobbyInitial')!.style.display = 'block';
    document.getElementById('lobbyFirebase')!.style.display = 'none';
    document.getElementById('lobbyManual')!.style.display = 'none';
  }

  registrarEventoLog(mensaje: string) {
    const texto = `[${new Date().toLocaleTimeString()}] ${mensaje}`;
    this.colaDeMensajes.unshift(texto);
    if (this.colaDeMensajes.length > 5) this.colaDeMensajes.pop();
    console.log(mensaje);
  }

  iniciarMotorJuego() {
    if (this.motorIniciado) return;
    this.motorIniciado = true;
    if (this.esHost || !this.network.multiplayerActivo) {
        generarLaberintoBSP(this.mapaLaberinto);
        this.generarEnemigos();
    }
    this.cicloDeJuego();
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
    for (let i = 0; i < 40; i++) {
        let f, c;
        let s = 0;
        do {
            f = Math.floor(Math.random() * this.config.NUMERO_FILAS);
            c = Math.floor(Math.random() * this.config.NUMERO_COLUMNAS);
            s++;
        } while (((f < 5 && c < 5) || !this.mapaLaberinto[f][c].esTransitable) && s < 1000);
        const t = tipos[i % tipos.length];
        const e = new EnemigoNPC(f, c, t, t, i);
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
    this.protagonista.vidaActual = this.protagonista.vidaMaxima;
    this.protagonista.estaVivo = true;
    this.protagonista.enCombateCon = null;
    this.juegoTerminado = false;
    document.getElementById('respawnUI')!.style.display = 'none';
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
    this.renderer.dibujarLaberinto(this.mapaLaberinto, offset, this.config);
    this.renderer.dibujarNiebla(this.mapaLaberinto, offset, this.config);

    if (this.protagonista.estaVivo) {
        this.protagonista.dibujar(this.renderer.getCtx(), offset, this.config);
        this.protagonista.dibujarBarraVida(this.renderer.getCtx(), offset, this.config, this.mapaLaberinto);
    }

    this.network.jugadoresRemotos.forEach(j => {
        if (j.entidad && j.entidad.estaVivo) {
            j.entidad.dibujar(this.renderer.getCtx(), offset, this.config);
            j.entidad.dibujarBarraVida(this.renderer.getCtx(), offset, this.config, this.mapaLaberinto);
        }
    });

    this.listaDeEnemigos.forEach(e => {
        if (e.estaVivo) {
            e.dibujar(this.renderer.getCtx(), offset, this.config, this.mapaLaberinto);
            e.dibujarBarraVida(this.renderer.getCtx(), offset, this.config, this.mapaLaberinto);
        }
    });

    this.ui.actualizarTextosFlotantes();
    this.ui.dibujarTextosFlotantes(this.renderer.getCtx());
    this.renderer.dibujarMarcadoresMovimiento(this.config);
    this.renderer.dibujarUI(this);

    requestAnimationFrame(() => this.cicloDeJuego());
  }

  actualizar() {
    if (this.juegoTerminado || !this.protagonista) return;
    const ahora = Date.now();

    if (this.esHost || !this.network.multiplayerActivo) {
        this.listaDeEnemigos.forEach(e => e.actualizarIA(this));
    }

    const r = this.config.RADIO_VISION;
    for (let f = Math.max(0, this.protagonista.fila - r); f <= Math.min(this.config.NUMERO_FILAS - 1, this.protagonista.fila + r); f++) {
        for (let c = Math.max(0, this.protagonista.columna - r); c <= Math.min(this.config.NUMERO_COLUMNAS - 1, this.protagonista.columna + r); c++) {
            if (Math.sqrt(Math.pow(f - this.protagonista.fila, 2) + Math.pow(c - this.protagonista.columna, 2)) <= r) {
                this.mapaLaberinto[f][c].ultimoAvistamiento = ahora;
            }
        }
    }

    const btnEmpezar = document.getElementById('btnEmpezar') as HTMLButtonElement;
    if (!this.protagonista.estaVivo && !this.juegoTerminado) {
        document.getElementById('respawnUI')!.style.display = 'flex';
        if (btnEmpezar) btnEmpezar.disabled = false;
    } else {
        if (btnEmpezar) btnEmpezar.disabled = true;
    }
  }

  enviarMapaAlInvitado(guestId: string) {
    const jInfo = this.network.jugadoresRemotos.get(guestId);
    if (!jInfo || !jInfo.dc || jInfo.dc.readyState !== "open") return;

    const mapaCompacto = serializarMapa(this.mapaLaberinto);
    const enemigos = this.listaDeEnemigos.map(e => ({
        id: e.id, f: e.fila, c: e.columna, n: e.nombre, t: e.tipo, v: e.vidaActual, vm: e.vidaMaxima
    }));

    jInfo.dc.send(JSON.stringify({ tipo: 'mapa', datos: mapaCompacto }));
    jInfo.dc.send(JSON.stringify({ tipo: 'enemigos', lista: enemigos }));

    const posSpawn = this.obtenerPosicionInicioAleatoria();
    jInfo.dc.send(JSON.stringify({ tipo: 'spawn', f: posSpawn.f, c: posSpawn.c }));

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
        const d = Math.max(0, vA - vD);
        o.recibirDano(d);
        this.registrarEventoLog(`${l.nombre} -> ${o.nombre} (-${d} HP)`);
        if (!o.estaVivo) {
            this.registrarEventoLog(`${o.nombre} derrotado.`);
            l.enCombateCon = null;
            if (o === this.protagonista) this.juegoTerminado = true;
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
    const idSujeto = msg.id || idEmisor;
    switch (msg.tipo) {
        case 'handshake':
            if (!this.network.jugadoresRemotos.has(idSujeto)) {
                const pc: any = null;
                const dc: any = null;
                this.network.jugadoresRemotos.set(idSujeto, { pc, dc, entidad: null, unsubscribes: [] });
            }
            const jInfo = this.network.jugadoresRemotos.get(idSujeto)!;
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
            break;
        case 'enemigos':
            this.listaDeEnemigos = msg.lista.map((d: any) => {
                const e = new EnemigoNPC(d.f, d.c, d.n, d.t, d.id);
                e.vidaActual = d.v; e.vidaMaxima = d.vm;
                this.setupEntity(e);
                return e;
            });
            this.mundoSincronizado = true;
            this.ui.ocultarLobby();
            this.iniciarMotorJuego();
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
            this.ui.manejarMensajeChat(msg.nick || "Desconocido", msg.texto, false, this);
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
        case 'spawn':
            this.protagonista.fila = msg.f;
            this.protagonista.columna = msg.c;
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
