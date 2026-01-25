import { Celda } from './world/Celda';
import { Jugador } from './entities/Jugador';
import { EnemigoNPC } from './entities/EnemigoNPC';
import { JugadorRemoto } from './entities/JugadorRemoto';
import { FirebaseManager } from './network/FirebaseManager';
import { NetworkManager } from './network/NetworkManager';
import { Renderer } from './core/Renderer';
import { UIManager } from './ui/UIManager';
import { TextoFlotante, MensajeChat } from './ui/ChatModels';
import { generarLaberintoBSP } from './world/generation';
import { NUMERO_FILAS, NUMERO_COLUMNAS, TAMANO_CELDA, ALTO_UI_TOP, ALTO_UI_BOTTOM, RADIO_VISION, TIEMPO_DESVANECIMIENTO_NIEBLA } from './world/constants';

class Game {
  public mapaLaberinto: Celda[][] = [];
  public protagonista: Jugador;
  public listaDeEnemigos: EnemigoNPC[] = [];
  public jugadoresRemotos: Map<string, any>;
  public listaTextosFlotantes: TextoFlotante[] = [];
  public listaMensajesChat: MensajeChat[] = [];
  public colaDeMensajes: string[] = [];
  public juegoTerminado: boolean = false;
  public vistaDebugActivada: boolean = false;
  public motorIniciado: boolean = false;

  public firebaseManager: FirebaseManager;
  public networkManager: NetworkManager;
  private renderer: Renderer;
  public uiManager: UIManager;

  public db: any;

  constructor() {
    this.firebaseManager = new FirebaseManager();
    this.db = this.firebaseManager.getDb();
    this.networkManager = new NetworkManager();
    this.jugadoresRemotos = this.networkManager.jugadoresRemotos;

    const canvas = document.getElementById('mazeCanvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.uiManager = new UIManager(this);

    this.protagonista = new Jugador();
    this.inicializarMapa();
    this.ajustarDimensiones();
    this.setupListeners();
  }

  private ajustarDimensiones() {
    const canvas = document.getElementById('mazeCanvas') as HTMLCanvasElement;
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  }

  private inicializarMapa() {
    for (let fila = 0; fila < NUMERO_FILAS; fila++) {
      let filaCeldas = [];
      for (let columna = 0; columna < NUMERO_COLUMNAS; columna++) {
        filaCeldas.push(new Celda(fila, columna));
      }
      this.mapaLaberinto.push(filaCeldas);
    }
  }

  private setupListeners() {
    window.addEventListener('keydown', (e) => this.manejarTeclado(e));
    window.addEventListener('resize', () => this.ajustarDimensiones());
  }

  public empezarSolo() {
    this.protagonista.nombre = (document.getElementById('nickInput') as HTMLInputElement).value || "Héroe";
    this.networkManager.mundoSincronizado = true;
    this.uiManager.ocultarLobby();
    this.iniciarMotorJuego();
  }

  public iniciarComoHostFirebase() {
    this.networkManager.esHost = true;
    this.protagonista.nombre = (document.getElementById('nickInput') as HTMLInputElement).value || "Host";
    const btn = document.getElementById('btnAceptarJugadores') as HTMLButtonElement;
    if (btn) btn.disabled = false;
    this.crearPartidaFirestore();
  }

  public mostrarLobbyFirebase() {
    (document.getElementById('lobbyInitial') as HTMLElement).style.display = 'none';
    (document.getElementById('lobbyFirebase') as HTMLElement).style.display = 'flex';
    this.listarPartidasFirestore();
  }

  public mostrarLobbyManual() {
    (document.getElementById('lobbyInitial') as HTMLElement).style.display = 'none';
    (document.getElementById('lobbyManual') as HTMLElement).style.display = 'flex';
  }

  private async crearPartidaFirestore() {
    if (!this.db) {
      this.uiManager.registrarLogConexion("Error: Firebase no inicializado. Iniciando solo.");
      this.empezarSolo();
      return;
    }

    this.networkManager.idPartidaActual = Math.random().toString(36).substr(2, 6).toUpperCase();

    try {
      await this.db.collection('partidas').doc(this.networkManager.idPartidaActual).set({
        hostId: this.networkManager.idLocal,
        hostNick: this.protagonista.nombre,
        creacion: Date.now(),
        numJugadores: 1,
        estado: 'activa',
        lastSeen: Date.now()
      });
      this.uiManager.registrarLogConexion(`Documento de partida ${this.networkManager.idPartidaActual} creado.`);
    } catch (e: any) {
      this.uiManager.registrarLogConexion("Error fatal al crear partida: " + e.message);
      return;
    }

    setInterval(async () => {
      if (this.networkManager.esHost && this.networkManager.idPartidaActual) {
        try {
          await this.db.collection('partidas').doc(this.networkManager.idPartidaActual).update({
            numJugadores: this.networkManager.jugadoresRemotos.size + 1,
            lastSeen: Date.now()
          });
        } catch (e: any) {
          this.uiManager.registrarLogConexion("Error en heartbeat: " + e.message);
        }
      }
    }, 10000);

    this.uiManager.registrarLogConexion(`Partida creada: ${this.networkManager.idPartidaActual}. Pulsa 'ADMITIR JUGADORES' en el menú para conectar invitados.`);
    this.uiManager.ocultarLobby();
    this.iniciarMotorJuego();
  }

  public async listarPartidasFirestore() {
    if (!this.db) return;
    const listaContainer = document.getElementById('listaPartidas');
    if (!listaContainer) return;

    try {
      const snapshot = await this.db.collection('partidas').where('estado', '==', 'activa').get();
      listaContainer.innerHTML = "";
      const ahora = Date.now();
      let count = 0;

      snapshot.forEach((doc: any) => {
        const data = doc.data();
        if (ahora - (data.lastSeen || 0) < 60000) {
          count++;
          const item = document.createElement('div');
          item.style.cssText = "background: #222; margin-bottom: 5px; padding: 10px; border-radius: 3px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #444;";
          item.innerHTML = `
            <div style="text-align: left;">
                <strong style="color: #007bff;">ID: ${doc.id}</strong><br>
                <span style="font-size: 10px; color: #888;">Host: ${data.hostNick || '?'} | Jugadores: ${data.numJugadores || 1}</span>
            </div>
            <button class="join-btn" data-id="${doc.id}" style="background: #28a745; color: white; border: none; padding: 5px 10px; cursor: pointer; font-family: monospace; font-weight: bold;">UNIRSE</button>
          `;
          listaContainer.appendChild(item);
          item.querySelector('.join-btn')?.addEventListener('click', () => this.unirseAPartidaFirestore(doc.id));
        }
      });

      if (count === 0) {
        listaContainer.innerHTML = '<p style="color: #666; font-style: italic; text-align: center;">No hay partidas disponibles.</p>';
      }
    } catch (err: any) {
      listaContainer.innerHTML = `<p style="color: #f55;">Error: ${err.message}</p>`;
    }
  }

  public async unirseAPartidaFirestore(partidaId: string) {
    this.networkManager.idPartidaActual = partidaId;
    this.protagonista.nombre = (document.getElementById('nickInput') as HTMLInputElement).value || "Invitado";
    this.networkManager.esHost = false;
    this.registrarEventoLog(`Uniéndote a la partida ${partidaId}...`);
    this.networkManager.setupWebRTCGuest(partidaId, this);
  }

  public registrarEventoLog(mensaje: string) {
    const texto = `[${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${mensaje}`;
    this.colaDeMensajes.unshift(texto);
    if (this.colaDeMensajes.length > 5) this.colaDeMensajes.pop();
    console.log(mensaje);
  }

  public iniciarMotorJuego() {
    if (this.motorIniciado) return;
    this.motorIniciado = true;

    if (this.networkManager.esHost || !this.networkManager.multiplayerActivo) {
      generarLaberintoBSP(this.mapaLaberinto);
      this.generarEnemigos();
    }
    this.cicloDeJuego();
  }

  private generarEnemigos() {
    const tiposEnemigos = ["Esqueleto", "Orco", "Goblin", "Minotauro"];
    for (let i = 0; i < 40; i++) {
      let fila, columna;
      let seguridad = 0;
      do {
        fila = Math.floor(Math.random() * NUMERO_FILAS);
        columna = Math.floor(Math.random() * NUMERO_COLUMNAS);
        seguridad++;
      } while (((fila < 5 && columna < 5) || !this.mapaLaberinto[fila][columna].esTransitable) && seguridad < 1000);

      const tipo = tiposEnemigos[i % tiposEnemigos.length];
      this.listaDeEnemigos.push(new EnemigoNPC(fila, columna, tipo, tipo, i));
    }
  }

  private manejarTeclado(evento: KeyboardEvent) {
    if (evento.key === 'Enter') {
      this.uiManager.toggleChat(this);
      return;
    }
    if (evento.key === 'd') {
      this.vistaDebugActivada = !this.vistaDebugActivada;
      this.registrarEventoLog(`Modo Desarrollo ${this.vistaDebugActivada ? 'ACTIVADO' : 'DESACTIVADO'}`);
      return;
    }
    if (this.juegoTerminado) return;

    let deltaFila = 0, deltaColumna = 0;
    if (evento.key === 'ArrowUp') deltaFila = -1;
    if (evento.key === 'ArrowDown') deltaFila = 1;
    if (evento.key === 'ArrowLeft') deltaColumna = -1;
    if (evento.key === 'ArrowRight') deltaColumna = 1;

    if (deltaFila !== 0 || deltaColumna !== 0) {
      if (this.protagonista.intentarMover(deltaFila, deltaColumna, this)) {
        this.comprobarVictoria();
      }
    }
  }

  private comprobarVictoria() {
    if (this.protagonista.fila === NUMERO_FILAS - 1 && this.protagonista.columna === NUMERO_COLUMNAS - 1) {
      this.juegoTerminado = true;
      this.registrarEventoLog("¡Has escapado del laberinto!");
      if (this.networkManager.multiplayerActivo) {
        this.networkManager.enviarMensaje({ tipo: 'victoria', nick: this.protagonista.nombre });
      }
    }
  }

  private actualizar() {
    if (this.juegoTerminado) return;
    const ahora = Date.now();

    const RADIO = RADIO_VISION;
    for (let f = Math.max(0, this.protagonista.fila - RADIO); f <= Math.min(NUMERO_FILAS - 1, this.protagonista.fila + RADIO); f++) {
      for (let c = Math.max(0, this.protagonista.columna - RADIO); c <= Math.min(NUMERO_COLUMNAS - 1, this.protagonista.columna + RADIO); c++) {
        const dist = Math.sqrt(Math.pow(f - this.protagonista.fila, 2) + Math.pow(c - this.protagonista.columna, 2));
        if (dist <= RADIO) this.mapaLaberinto[f][c].ultimoAvistamiento = ahora;
      }
    }

    this.listaDeEnemigos.forEach(e => e.actualizarIA(this));
    this.listaTextosFlotantes.forEach(t => t.actualizar());
    this.listaTextosFlotantes = this.listaTextosFlotantes.filter(t => t.vida > 0);
    this.listaMensajesChat.forEach(m => m.actualizar());
    this.listaMensajesChat = this.listaMensajesChat.filter(m => m.vida > 0);
  }

  private cicloDeJuego() {
    this.actualizar();
    this.renderer.limpiar();

    const offset = this.obtenerOffsetCamara();

    const enemigoVisible = this.listaDeEnemigos.find(e => {
        if (e.enCombateCon === this.protagonista) return true;
        for (let j of this.jugadoresRemotos.values()) {
            if (j.entidad && e.enCombateCon === j.entidad) return true;
        }
        return false;
    }) ||
    this.listaDeEnemigos.filter(e => e.estaVivo && this.mapaLaberinto[e.fila][e.columna].ultimoAvistamiento > 0 && Date.now() - this.mapaLaberinto[e.fila][e.columna].ultimoAvistamiento < TIEMPO_DESVANECIMIENTO_NIEBLA)
                   .sort((a,b) => (Math.abs(a.fila - this.protagonista.fila) + Math.abs(a.columna - this.protagonista.columna)) - (Math.abs(b.fila - this.protagonista.fila) + Math.abs(b.columna - this.protagonista.columna)))[0];

    const config = {
      NUMERO_FILAS, NUMERO_COLUMNAS, TAMANO_CELDA, ALTO_UI_TOP, ALTO_UI_BOTTOM,
      CELDAS_VISIBLES_X: Math.floor(window.innerWidth / TAMANO_CELDA),
      CELDAS_VISIBLES_Y: Math.floor((window.innerHeight - ALTO_UI_TOP - ALTO_UI_BOTTOM) / TAMANO_CELDA),
      RADIO_VISION, TIEMPO_DESVANECIMIENTO_NIEBLA,
      vistaDebugActivada: this.vistaDebugActivada,
      protagonista: this.protagonista,
      colaDeMensajes: this.colaDeMensajes,
      juegoTerminado: this.juegoTerminado,
      mapaLaberinto: this.mapaLaberinto,
      enemigoVisible
    };

    this.renderer.dibujarLaberinto(this.mapaLaberinto, offset, config);
    this.renderer.dibujarNiebla(this.mapaLaberinto, offset, config);

    this.protagonista.dibujar(this.renderer.getCtx(), offset, config);
    this.protagonista.dibujarBarraVida(this.renderer.getCtx(), offset, config);

    this.jugadoresRemotos.forEach(j => {
      if (j.entidad && j.entidad.estaVivo) {
        j.entidad.dibujar(this.renderer.getCtx(), offset, config);
        j.entidad.dibujarBarraVida(this.renderer.getCtx(), offset, config);
      }
    });

    this.listaDeEnemigos.forEach(e => {
      if (e.estaVivo) {
        e.dibujar(this.renderer.getCtx(), offset, config);
        e.dibujarBarraVida(this.renderer.getCtx(), offset, config);
      }
    });

    this.listaTextosFlotantes.forEach(t => t.dibujar(this.renderer.getCtx()));
    this.renderer.dibujarUI(config);
    this.renderer.dibujarMarcadoresMovimiento(config);

    requestAnimationFrame(() => this.cicloDeJuego());
  }

  private obtenerOffsetCamara() {
    const C_VIS_X = Math.floor(window.innerWidth / TAMANO_CELDA);
    const C_VIS_Y = Math.floor((window.innerHeight - ALTO_UI_TOP - ALTO_UI_BOTTOM) / TAMANO_CELDA);
    let colOffset = this.protagonista.columna - Math.floor(C_VIS_X / 2);
    let filaOffset = this.protagonista.fila - Math.floor(C_VIS_Y / 2);
    colOffset = Math.max(0, Math.min(colOffset, NUMERO_COLUMNAS - C_VIS_X));
    filaOffset = Math.max(0, Math.min(filaOffset, NUMERO_FILAS - C_VIS_Y));
    return { colOffset, filaOffset };
  }

  public iniciarCombate(atacante: any, objetivo: any) {
    if (atacante.enCombateCon === objetivo) {
      this.resolverRondaDeCombate(atacante, objetivo);
      return;
    }
    atacante.enCombateCon = objetivo;
    objetivo.enCombateCon = atacante;
    this.registrarEventoLog(`¡Combate iniciado: ${atacante.nombre} vs ${objetivo.nombre}!`);
    this.resolverRondaDeCombate(atacante, objetivo);
  }

  public resolverRondaDeCombate(participanteA: any, participanteB: any) {
    const iniciativaA = participanteA.obtenerIniciativa();
    const iniciativaB = participanteB.obtenerIniciativa();
    const combatientes = iniciativaA >= iniciativaB ? [participanteA, participanteB] : [participanteB, participanteA];
    combatientes.forEach((luchador, indice) => {
      if (!luchador.estaVivo || luchador.vidaActual <= 0) return;
      const oponente = combatientes[1 - indice];
      if (!oponente.estaVivo || oponente.vidaActual <= 0) return;
      const valorAtaque = luchador.generarAtaque();
      const valorDefensa = oponente.generarDefensa();
      const danoNeto = Math.max(0, valorAtaque - valorDefensa);
      oponente.recibirDano(danoNeto, luchador);
      this.registrarEventoLog(`${luchador.nombre} ataca a ${oponente.nombre}: ${valorAtaque} vs ${valorDefensa} DEF. Daño: ${danoNeto}`);
      if (!oponente.estaVivo) {
        this.registrarEventoLog(`¡${oponente.nombre} ha sido derrotado!`);
        luchador.enCombateCon = null;
        if (oponente === this.protagonista) this.juegoTerminado = true;
      }
    });
  }

  public intentarRehuirCombate(luchador: any) {
    const oponente = luchador.enCombateCon;
    if (!oponente) return true;
    const tiradaPropia = Math.floor(Math.random() * 10) + 1 + luchador.agilidad;
    const tiradaOponente = Math.floor(Math.random() * 10) + 1 + oponente.agilidad;
    if (tiradaPropia > tiradaOponente) {
      this.registrarEventoLog(`${luchador.nombre} ha logrado rehuir el combate.`);
      luchador.enCombateCon = null;
      oponente.enCombateCon = null;
      return true;
    } else {
      this.registrarEventoLog(`${luchador.nombre} falló al intentar rehuir.`);
      this.resolverRondaDeCombate(oponente, luchador);
      return false;
    }
  }

  public crearTextoFlotanteEnCelda(f: number, c: number, texto: string, color: string) {
    const offset = this.obtenerOffsetCamara();
    const C_VIS_X = Math.floor(window.innerWidth / TAMANO_CELDA);
    const C_VIS_Y = Math.floor((window.innerHeight - ALTO_UI_TOP - ALTO_UI_BOTTOM) / TAMANO_CELDA);
    if (f < offset.filaOffset || f >= offset.filaOffset + C_VIS_Y ||
        c < offset.colOffset || c >= offset.colOffset + C_VIS_X) return;
    const x = (c - offset.colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const y = (f - offset.filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;
    this.listaTextosFlotantes.push(new TextoFlotante(x, y, texto, color));
  }

  public enviarChat(texto: string) {
    this.manejarMensajeChat(this.protagonista.nombre, texto, true);
    if (this.networkManager.multiplayerActivo) {
        this.networkManager.enviarMensaje({ tipo: 'chat', texto: texto, id: this.networkManager.idLocal });
    }
  }

  public manejarMensajeChat(nombre: string, texto: string, esLocal: boolean) {
    this.listaMensajesChat.push(new MensajeChat(nombre, texto, esLocal, true));
    this.registrarEventoLog(`CHAT - ${nombre}: ${texto}`);
  }

  public async admitirCandidatos() {
    if (!this.networkManager.esHost || !this.db || !this.networkManager.idPartidaActual) return;
    this.uiManager.registrarLogConexion("Buscando candidatos en Firestore...");
    try {
      const snapshot = await this.db.collection('partidas').doc(this.networkManager.idPartidaActual).collection('conexiones').get();
      this.uiManager.registrarLogConexion(`Escaneo completado: ${snapshot.size} entradas encontradas.`);
      snapshot.forEach((doc: any) => {
        const guestId = doc.id;
        if (guestId && guestId !== this.networkManager.idLocal) {
          if (!this.jugadoresRemotos.has(guestId)) {
            this.uiManager.registrarLogConexion(`Iniciando conexión con candidato: ${guestId}`);
            this.networkManager.setupWebRTCHost(guestId, this);
          }
        }
      });
    } catch (e: any) {
      this.uiManager.registrarLogConexion("Error al buscar candidatos: " + e.message);
    }
  }

  public async limpiarSignalingFirestore(partidaId: string, guestId: string) {
    if (!this.db) return;
    const connRef = this.db.collection('partidas').doc(partidaId).collection('conexiones').doc(guestId);
    try {
      const hostCandidates = await connRef.collection('iceCandidatesHost').limit(50).get();
      hostCandidates.forEach((doc: any) => doc.ref.delete());
      const guestCandidates = await connRef.collection('iceCandidatesGuest').limit(50).get();
      guestCandidates.forEach((doc: any) => doc.ref.delete());
      await connRef.delete();
    } catch (e) {}
  }

  public async procesarMensajeMultiplayer(msg: any, idEmisor: string) {
    if (!this.networkManager.mundoSincronizado && ['posicion', 'victoria', 'spawn'].includes(msg.tipo)) {
        this.networkManager.colaMensajesPendientes.push({ msg, idEmisor });
        return;
    }
    const idSujeto = msg.id || idEmisor;
    switch (msg.tipo) {
        case 'handshake':
            if (!this.jugadoresRemotos.has(idSujeto)) {
                this.jugadoresRemotos.set(idSujeto, { pc: null, dc: null, entidad: null });
            }
            const jInfo = this.jugadoresRemotos.get(idSujeto);
            if (this.networkManager.esHost) {
                const jRel = this.jugadoresRemotos.get(idEmisor);
                if (jRel && jRel !== jInfo) {
                    jInfo.pc = jRel.pc; jInfo.dc = jRel.dc; jInfo.unsubscribes = jRel.unsubscribes;
                    this.jugadoresRemotos.delete(idEmisor);
                }
            }
            if (!jInfo.entidad) jInfo.entidad = new JugadorRemoto(0, 0, msg.nick);
            if (!this.networkManager.esHost) this.networkManager.enviarMensaje({ tipo: 'handshake_ack', nick: this.protagonista.nombre, id: this.networkManager.idLocal });
            break;
        case 'posicion':
            if (!this.jugadoresRemotos.has(idSujeto)) this.jugadoresRemotos.set(idSujeto, { entidad: new JugadorRemoto(msg.f, msg.c, msg.nick || "Jugador") });
            const jPos = this.jugadoresRemotos.get(idSujeto);
            if (jPos && jPos.entidad) {
                jPos.entidad.fila = msg.f; jPos.entidad.columna = msg.c; jPos.entidad.estaCaminando = msg.cam;
            }
            if (this.networkManager.esHost) this.networkManager.enviarMensaje({ ...msg, id: idSujeto }, idEmisor);
            break;
        case 'chat':
            this.manejarMensajeChat(msg.nick || "Remoto", msg.texto, false);
            if (this.networkManager.esHost) this.networkManager.enviarMensaje({ ...msg, id: idSujeto }, idEmisor);
            break;
    }
  }
}

new Game();
