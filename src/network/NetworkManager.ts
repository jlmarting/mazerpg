import { IGame } from '../types';

/**
 * Gestor de red para comunicaciones peer-to-peer (P2P) usando WebRTC.
 * Permite establecer conexiones directas entre jugadores para intercambio de datos
 * en tiempo real, utilizando Firebase únicamente para la fase de señalización.
 *
 * Esta clase está diseñada para ser reutilizable en diferentes tipos de juegos
 * o aplicaciones que requieran comunicación multijugador de baja latencia.
 *
 * @example
 * // Crear instancia y conectar como host
 * const network = new NetworkManager();
 * await network.setupWebRTCHost("guestId", gameInstance);
 *
 * // Enviar mensaje a todos los jugadores conectados
 * network.enviarMensaje({ tipo: 'movimiento', x: 100, y: 200 });
 */
export interface RemotePlayer {
    /** Conexión peer-to-peer establecida con el jugador remoto */
    pc: RTCPeerConnection;
    /** Canal de datos para envío/recepción de mensajes */
    dc: RTCDataChannel;
    /** Referencia a la entidad del jugador en el juego (se asigna después del handshake) */
    entidad: any;
    /** Funciones de desuscripción para limpiar listeners de Firebase cuando sea necesario */
    unsubscribes: (() => void)[];
}

export class NetworkManager {
    /** ID único generado para este cliente (prefijo "L" + caracteres aleatorios) */
    public idLocal: string = "L" + Math.random().toString(36).substr(2, 9);
    /** Indica si el modo multijugador está activo */
    public multiplayerActivo: boolean = false;
    /** Verdadero si este cliente actúa como host de la partida */
    public esHost: boolean = false;
    /** ID de la partida actual (null si no está en ninguna partida) */
    public idPartidaActual: string | null = null;
    /** Mapa de jugadores remotos conectados, keyed por su ID */
    public jugadoresRemotos: Map<string, RemotePlayer> = new Map();
    /** Indica si hay al menos un canal de datos abierto */
    public activo: boolean = false;
    /** ID real del host (usado cuando el cliente es invitado) */
    public idRealDelHost: string | null = null;

    constructor() {}

    /**
     * Envía un mensaje JSON a todos los jugadores remotos conectados.
     * @param objeto - Objeto que será serializado a JSON y enviado
     * @param exceptId - Opcional: ID de jugador al que NO se enviará el mensaje
     */
    enviarMensaje(objeto: any, exceptId: string | null = null) {
        const data = JSON.stringify(objeto);
        this.jugadoresRemotos.forEach((j, id) => {
            if (id !== exceptId && j.dc && j.dc.readyState === "open") {
                try { j.dc.send(data); } catch (e) {
                    console.error(`Error enviando a ${id}:`, e);
                }
            }
        });
    }

    /**
     * Configura los manejadores de eventos para un canal de datos WebRTC.
     * Se encarga del handshake inicial, procesamiento de mensajes y limpieza al desconectar.
     * @param canal - Canal de datos RTCDataChannel ya creado
     * @param idEmisor - ID del jugador remoto en el otro extremo del canal
     * @param game - Instancia del juego que manejará la lógica de mensajes multijugador
     */
    setupDataChannelHandlers(canal: RTCDataChannel, idEmisor: string, game: IGame) {
        canal.addEventListener('open', () => {
            this.activo = true;
            this.multiplayerActivo = true;
            const nick = (document.getElementById('nickInput') as HTMLInputElement).value || "Héroe";
            const clase = game.protagonista.clase;
            const stats = { fue: game.protagonista.fuerza, agi: game.protagonista.agilidad, int: game.protagonista.inteligencia };
            this.enviarMensaje({ tipo: 'handshake', nick, id: this.idLocal, clase, stats });

            if (this.esHost) {
                game.registrarEventoLog(`Jugador conectado (${idEmisor})`);
            }
        });

        canal.onmessage = (evento) => {
            try {
                const mensaje = JSON.parse(evento.data);
                game.procesarMensajeMultiplayer(mensaje, idEmisor);
            } catch(e) {
                console.error("Error al procesar mensaje P2P:", e);
            }
        };

        canal.addEventListener('close', () => {
            game.registrarEventoLog(`Jugador desconectado (${idEmisor})`);
            this.jugadoresRemotos.delete(idEmisor);

            if (idEmisor === 'host' && !this.esHost) {
                game.registrarEventoLog("El Host se ha desconectado. Iniciando elección de nuevo Host...");
                game.iniciarEleccionHost();
            }

            if (this.jugadoresRemotos.size === 0) {
                this.activo = false;
                this.multiplayerActivo = false;
            }
        });
    }

    /**
     * Configura la conexión WebRTC actuando como host para un invitado específico.
     * El host crea una conexión y espera que el invitado se una mediante señales en Firebase.
     * 
     * Flujo de conexión:
     * 1. El host crea un RTCPeerConnection y un RTCDataChannel
     * 2. Genera una oferta SDP (descripción de la conexión) y la guarda en Firebase
     * 3. Espera la respuesta del invitado desde Firebase
     * 4. Intercambian candidatos ICE (información de conexión) a través de Firebase
     * 5. Una vez que ambos tienen la descripción remota, establecen conexión P2P directa
     * 
     * @param guestId - ID del jugador invitado al que conectar
     * @param game - Instancia del juego para logging y manejo de mensajes
     */
    async setupWebRTCHost(guestId: string, game: IGame) {
        if (!guestId) return;
        if (this.jugadoresRemotos.has(guestId)) {
            const existing = this.jugadoresRemotos.get(guestId)!;
            if (existing.pc && (existing.pc.connectionState === 'connected' || existing.pc.connectionState === 'connecting')) {
                return;
            }
        }

        game.ui.registrarLogConexion(`Iniciando PeerConnection para Invitado: ${guestId}`);
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        const dc = pc.createDataChannel("mazeRPG");
        const iceBuffer: any[] = [];
        const info: RemotePlayer = { pc, dc, entidad: null, unsubscribes: [] };
        this.jugadoresRemotos.set(guestId, info);
        this.setupDataChannelHandlers(dc, guestId, game);

        // ================================================================
        // MANEJADOR: Cuando el canal de datos se abre completamente
        // ================================================================
        // El canal está listo para enviar y recibir datos
        // Enviamos nuestro handshake inicial (nick, clase, stats)
        // Limpiamos los listeners de Firebase ya que no necesitamos más señales
        dc.addEventListener('open', () => {
            game.ui.registrarLogConexion(`✅ CANAL P2P ABIERTO con ${guestId}.`);
            info.unsubscribes.forEach(unsub => unsub());
            info.unsubscribes = [];
            // Ya no necesitamos generar más candidatos ICE locales
            pc.onicecandidate = null;
            // Limpiamos las señales de Firebase para esta conexión
            if (this.idPartidaActual) game.firebase.limpiarSignaling(this.idPartidaActual, guestId);
        });

        // ================================================================
        // MANEJADOR: Generamos nuestros candidatos ICE locales
        // ================================================================
        // Los candidatos ICE son información sobre cómo podemos ser alcanzados
        // (direcciones IP, puertos, tipos de conexión, etc.)
        // Los enviamos al invitado a través de Firebase para que intente conectarse
        pc.onicecandidate = (event) => {
            if (event.candidate && this.idPartidaActual) {
                // Guardamos nuestro candidato ICE en Firebase para que el invitado lo lea
                game.firebase.getDb().collection('partidas').doc(this.idPartidaActual)
                  .collection('conexiones').doc(guestId)
                  .collection('iceCandidatesHost').add(event.candidate.toJSON());
            }
        };

        // ================================================================
        // PASO INICIAL: Creamos y enviamos nuestra oferta al invitado
        // ================================================================
        // Generamos una oferta SDP que describe cómo podemos conectarnos
        // La guardamos en Firebase para que el invitado la lea
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await game.firebase.getDb().collection('partidas').doc(this.idPartidaActual)
          .collection('conexiones').doc(guestId).set({
            offer: { type: offer.type, sdp: offer.sdp }
          }, { merge: true });

        // ================================================================
        // LISTENER: Esperamos la respuesta del invitado desde Firebase
        // ================================================================
        // El invitado crea una respuesta SDP a nuestra oferta y la guarda aquí
        // Cuando la recibimos, configuramos nuestra conexión remota
        const unsubAnswer = game.firebase.getDb().collection('partidas').doc(this.idPartidaActual)
          .collection('conexiones').doc(guestId).onSnapshot((doc: any) => {
            const data = doc.data();
            if (data && data.answer && !pc.currentRemoteDescription) {
                // Configuramos nuestra conexión remota con la respuesta del invitado
                pc.setRemoteDescription(new RTCSessionDescription(data.answer)).then(() => {
                    // Procesamos cualquier candidato ICE que hayamos recibido previamente
                    // (puede haber llegado antes de que tuviéramos la descripción remota)
                    while(iceBuffer.length > 0) {
                        pc.addIceCandidate(new RTCIceCandidate(iceBuffer.shift()));
                    }
                });
            }
          });

        // ================================================================
        // LISTENER: Esperamos los candidatos ICE del invitado desde Firebase
        // ================================================================
        // El invitado envía sus candidatos ICE (cómo él puede ser alcanzado)
        // Los recibimos aquí y los añadimos a nuestra conexión cuando esté lista
        const unsubIce = game.firebase.getDb().collection('partidas').doc(this.idPartidaActual)
          .collection('conexiones').doc(guestId)
          .collection('iceCandidatesGuest').onSnapshot((snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                if (change.type === 'added') {
                    const cand = change.doc.data();
                    // Si ya tenemos la descripción remota, añadimos el candidato directamente
                    // Si no, lo guardamos en buffer para procesarlo después
                    if (pc.remoteDescription) {
                        pc.addIceCandidate(new RTCIceCandidate(cand));
                    } else {
                        iceBuffer.push(cand);
                    }
                }
            });
          });

        // Guardamos las funciones de desuscripción para limpiar estos listeners más tarde
        info.unsubscribes.push(unsubAnswer, unsubIce);
    }

    /**
     * Configura la conexión WebRTC actuando como invitado uniéndose a una partida existente.
     * El invitado se conecta como cliente al host mediante señales en Firebase.
     * 
     * Flujo de conexión:
     * 1. El invitado se registra en Firebase con su ID local
     * 2. Espera la oferta del host desde Firebase
     * 3. Cuando recibe la oferta, crea y envía una respuesta al host
     * 4. Intercambian candidatos ICE (información de conexión) a través de Firebase
     * 5. Una vez que ambos tienen la descripción remota, establecen conexión P2P directa
     * 
     * @param partidaId - ID de la partida a la que unirse
     * @param game - Instancia del juego para logging y manejo de mensajes
     */
    async setupWebRTCGuest(partidaId: string, game: IGame) {
        this.idPartidaActual = partidaId;
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        const iceBuffer: any[] = [];
        const info: RemotePlayer = { pc, dc: null as any, entidad: null, unsubscribes: [] };

        // ================================================================
        // MANEJADOR: Cuando el host crea un canal de datos y nos lo envía
        // ================================================================
        // El host crea un RTCDataChannel y lo envía a través de este evento
        // Nosotros recibimos el canal y configuramos su manejo de mensajes
        pc.ondatachannel = (event) => {
            const dc = event.channel;
            info.dc = dc;
            this.jugadoresRemotos.set('host', info);
            this.setupDataChannelHandlers(dc, 'host', game);
            
            // ================================================================
            // MANEJADOR: Cuando el canal de datos se abre completamente
            // ================================================================
            // El canal está listo para enviar y recibir datos
            // Limpiamos los listeners de Firebase ya que no necesitamos más señales
            dc.addEventListener('open', () => {
                info.unsubscribes.forEach(unsub => unsub());
                info.unsubscribes = [];
                // Ya no necesitamos generar más candidatos ICE locales
                pc.onicecandidate = null;
            });
        };

        // ================================================================
        // MANEJADOR: Generamos nuestros candidatos ICE locales
        // ================================================================
        // Los candidatos ICE son información sobre cómo podemos ser alcanzados
        // (direcciones IP, puertos, tipos de conexión, etc.)
        // Los enviamos al host a través de Firebase para que intente conectarse
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                // Guardamos nuestro candidato ICE en Firebase para que el host lo lea
                game.firebase.getDb().collection('partidas').doc(partidaId)
                  .collection('conexiones').doc(this.idLocal)
                  .collection('iceCandidatesGuest').add(event.candidate.toJSON());
            }
        };

        // ================================================================
        // PASO INICIAL: Nos registramos en Firebase como invitado disponible
        // ================================================================
        // Guardamos nuestro ID y nombre en Firebase para que el host sepa que estamos aquí
        await game.firebase.getDb().collection('partidas').doc(partidaId).collection('conexiones').doc(this.idLocal).set({
            id: this.idLocal,
            nick: game.protagonista.nombre
        });

        // ================================================================
        // LISTENER: Esperamos la oferta del host desde Firebase
        // ================================================================
        // El host crea una oferta SDP (descripción de la conexión) y la guarda aquí
        // Cuando la recibimos, configuramos nuestra conexión remota y enviamos nuestra respuesta
        const unsubOffer = game.firebase.getDb().collection('partidas').doc(partidaId)
          .collection('conexiones').doc(this.idLocal).onSnapshot(async (doc: any) => {
            const data = doc.data();
            if (data && data.offer && !pc.currentRemoteDescription) {
                // Configuramos nuestra conexión remota con la oferta del host
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                
                // Procesamos cualquier candidato ICE que hayamos recibido previamente
                // (puede haber llegado antes de que tuviéramos la descripción remota)
                while(iceBuffer.length > 0) {
                    pc.addIceCandidate(new RTCIceCandidate(iceBuffer.shift()));
                }
                
                // Creamos y enviamos nuestra respuesta al host
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await game.firebase.getDb().collection('partidas').doc(partidaId)
                  .collection('conexiones').doc(this.idLocal).set({
                    answer: { type: answer.type, sdp: answer.sdp }
                  }, { merge: true });
            }
          });

        // ================================================================
        // LISTENER: Esperamos los candidatos ICE del host desde Firebase
        // ================================================================
        // El host envía sus candidatos ICE (cómo él puede ser alcanzado)
        // Los recibimos aquí y los añadimos a nuestra conexión cuando esté lista
        const unsubIce = game.firebase.getDb().collection('partidas').doc(partidaId)
          .collection('conexiones').doc(this.idLocal)
          .collection('iceCandidatesHost').onSnapshot((snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                if (change.type === 'added') {
                    const cand = change.doc.data();
                    // Si ya tenemos la descripción remota, añadimos el candidato directamente
                    // Si no, lo guardamos en buffer para procesarlo después
                    if (pc.remoteDescription) {
                        pc.addIceCandidate(new RTCIceCandidate(cand));
                    } else {
                        iceBuffer.push(cand);
                    }
                }
            });
          });

        // Guardamos las funciones de desuscripción para limpiar estos listeners más tarde
        info.unsubscribes.push(unsubOffer, unsubIce);
    }

    // MÉTODOS PARA CONEXIÓN MANUAL (SIN FIREBASE)

    /**
     * Crea una oferta WebRTC para conexión manual (sin Firebase).
     * Útil para pruebas locales o conexiones directas LAN.
     * @param game - Instancia del juego para configurar handlers de canal
     * @returns Promesa que resuelve con la oferta codificada en base64
     */
    async crearOfertaManual(game: IGame): Promise<string> {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        const dc = pc.createDataChannel("mazeRPG");
        const guestId = "GUEST_" + Math.random().toString(36).substr(2, 5);

        const info: RemotePlayer = { pc, dc, entidad: null, unsubscribes: [] };
        this.jugadoresRemotos.set(guestId, info);
        this.setupDataChannelHandlers(dc, guestId, game);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        return new Promise((resolve) => {
            pc.onicecandidate = (e) => {
                if (!e.candidate) {
                    // Candidatos recolectados
                    resolve(btoa(JSON.stringify(pc.localDescription)));
                }
            };
            // Timeout de seguridad por si tarda mucho
            setTimeout(() => {
                if (pc.localDescription) resolve(btoa(JSON.stringify(pc.localDescription)));
            }, 2000);
        });
    }

    /**
     * Procesa una respuesta WebRTC recibida manualmente (en base64).
     * @param sdpB64 - Respuesta codificada en base64
     */
    async procesarRespuestaManual(sdpB64: string) {
        try {
            const answer = JSON.parse(atob(sdpB64));
            const [, info] = Array.from(this.jugadoresRemotos.entries())[0]; // El primer invitado en manual
            if (info && info.pc) {
                await info.pc.setRemoteDescription(new RTCSessionDescription(answer));
            }
        } catch (e) {
            console.error("Error al procesar respuesta manual:", e);
            alert("Error al procesar la respuesta. Código inválido.");
        }
    }

    /**
     * Acepta una oferta WebRTC recibida manualmente y genera una respuesta.
     * @param sdpB64 - Oferta codificada en base64
     * @param game - Instancia del juego para configurar handlers de canal
     * @returns Promesa que resuelve con la respuesta codificada en base64
     */
    async aceptarOfertaManual(sdpB64: string, game: IGame): Promise<string> {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        const info: RemotePlayer = { pc, dc: null as any, entidad: null, unsubscribes: [] };

        pc.ondatachannel = (event) => {
            const dc = event.channel;
            info.dc = dc;
            this.jugadoresRemotos.set('host', info);
            this.setupDataChannelHandlers(dc, 'host', game);
        };

        const offer = JSON.parse(atob(sdpB64));
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        return new Promise((resolve) => {
            pc.onicecandidate = (e) => {
                if (!e.candidate) {
                    resolve(btoa(JSON.stringify(pc.localDescription)));
                }
            };
            setTimeout(() => {
                if (pc.localDescription) resolve(btoa(JSON.stringify(pc.localDescription)));
            }, 2000);
        });
    }
}
