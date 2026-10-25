import { IGame } from '../types';
import { aparienciaEfectiva } from '../core/avatarTintes';
import { extraerSdpManual } from './manualSdp';

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
    /** Canal de datos para envío y recepción de mensajes */
    dc: RTCDataChannel;
    /** Referencia a la entidad del jugador en el juego (se asigna después del handshake) */
    entidad: any;
    /** Funciones de desuscripción para limpiar listeners de Firebase cuando sea necesario */
    unsubscribes: (() => void)[];
    /** Token opaco de la conexión manual (oferta/respuesta) */
    token?: string;
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
    /**
     * Alias provisional→real para el coop manual: el host crea la conexión
     * bajo un id `GUEST_*` y el DataChannel sigue emitiendo con ese id hasta
     * que llega el handshake; este mapa enruta los mensajes al id real.
     */
    public aliasRemoto: Map<string, string> = new Map();

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
            const apariencia = aparienciaEfectiva(game.protagonista.clase || 'guerrero', game.protagonista.apariencia);
            this.enviarMensaje({ tipo: 'handshake', nick, id: this.idLocal, clase, stats, apariencia });

            if (this.esHost) {
                game.registrarEventoLog(`Jugador conectado (${idEmisor})`);
            }
        });

        canal.onmessage = (evento) => {
            try {
                const mensaje = JSON.parse(evento.data);
                // Coop manual: el DataChannel se creó con un id provisional
                // (`GUEST_*`); el handshake lo migra y el alias enruta el resto.
                const idResuelto = this.aliasRemoto.get(idEmisor) ?? idEmisor;
                game.procesarMensajeMultiplayer(mensaje, idResuelto);
            } catch(e) {
                console.error("Error al procesar mensaje P2P:", e);
            }
        };

        canal.addEventListener('close', () => {
            const idResuelto = this.aliasRemoto.get(idEmisor) ?? idEmisor;
            game.registrarEventoLog(`Jugador desconectado (${idResuelto})`);
            this.jugadoresRemotos.delete(idResuelto);
            this.aliasRemoto.delete(idEmisor);
            try { game.cancelarTruequesDe(idResuelto); } catch {}

            if ((idEmisor === 'host' || idResuelto === this.idRealDelHost) && !this.esHost) {
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
     * Espera a que el ICE gathering termine y devuelve la descripción local
     * codificada como base64 de `{ token, sdp }`. El handler de ICE se asigna
     * antes de `setLocalDescription` (si se asigna después se pierden los
     * primeros candidatos). El timeout evita bloquear el flujo si el gathering
     * no llega a completarse.
     */
    private esperarDescripcionLocal(pc: RTCPeerConnection, token: string | null): Promise<string> {
        return new Promise((resolve) => {
            let resuelto = false;
            const terminar = (): void => {
                if (resuelto || !pc.localDescription) return;
                resuelto = true;
                resolve(btoa(JSON.stringify({ token, sdp: pc.localDescription })));
            };
            pc.onicecandidate = (e) => {
                if (!e.candidate) terminar();
            };
            pc.addEventListener('icecandidateerror', (e) => {
                console.warn('ICE candidate error (manual):', e);
            });
            setTimeout(terminar, 4000);
        });
    }

    /**
     * Crea una oferta WebRTC para conexión manual (sin Firebase).
     * Devuelve base64 de `{ token, sdp }`; el token permite emparejar la
     * respuesta con esta conexión cuando el host tiene varios invitados.
     */
    async crearOfertaManual(game: IGame): Promise<string> {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        const dc = pc.createDataChannel("mazeRPG");
        const token = Math.random().toString(36).slice(2, 10);
        const guestId = `GUEST_${token}`;

        const info: RemotePlayer = { pc, dc, entidad: null, unsubscribes: [], token };
        this.jugadoresRemotos.set(guestId, info);
        this.setupDataChannelHandlers(dc, guestId, game);

        const espera = this.esperarDescripcionLocal(pc, token);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        return espera;
    }

    /**
     * Procesa una respuesta WebRTC recibida manualmente (base64 de
     * `{ token, sdp }` o SDP plano legacy). Con token empareja la respuesta con
     * su oferta; sin token cae al primer `GUEST_*` (compatibilidad 1:1).
     */
    async procesarRespuestaManual(sdpB64: string): Promise<{ ok: boolean; error?: string }> {
        try {
            const payload = extraerSdpManual(JSON.parse(atob(sdpB64)));
            if (!payload) {
                return { ok: false, error: 'El código pegado no es una respuesta válida. Pega la RESPUESTA completa del invitado (no la oferta).' };
            }
            if (payload.sdp.type === 'offer') {
                return { ok: false, error: 'Eso es una OFERTA, no una RESPUESTA. Pega la respuesta que generó el invitado.' };
            }
            if (payload.sdp.type !== 'answer') {
                return { ok: false, error: `El código no es una respuesta WebRTC (type=${payload.sdp.type}).` };
            }
            const token = payload.token;
            const entradas = Array.from(this.jugadoresRemotos.entries());
            let entrada: [string, RemotePlayer] | undefined;
            if (token) {
                entrada = entradas.find(([, info]) => info.token === token);
            }
            if (!entrada) {
                // Legacy 1:1: sin token, primera conexión manual pendiente.
                entrada = entradas.find(([id]) => id.startsWith('GUEST_')) ?? entradas[0];
            }
            if (!entrada || !entrada[1].pc) {
                return { ok: false, error: token
                    ? `No hay una oferta pendiente con el token ${token}. Genera NUEVA OFERTA y pide la respuesta de esa oferta.`
                    : 'No hay conexiones manuales pendientes. Genera una NUEVA OFERTA.' };
            }
            if (entrada[1].pc.remoteDescription) {
                return { ok: false, error: token
                    ? `El token ${token} ya está conectado. Genera NUEVA OFERTA para otro invitado y usa la respuesta nueva.`
                    : 'Esa conexión ya está conectada. Genera NUEVA OFERTA para otro invitado.' };
            }
            await entrada[1].pc.setRemoteDescription(new RTCSessionDescription(payload.sdp as RTCSessionDescriptionInit));
            return { ok: true };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error('Error al procesar respuesta manual:', e);
            return { ok: false, error: `No se pudo procesar la respuesta: ${msg}` };
        }
    }

    /**
     * Acepta una oferta WebRTC recibida manualmente y genera la respuesta.
     * Acepta base64 de `{ token, sdp }` o SDP plano legacy; la respuesta lleva
     * el mismo token para que el host la empareje.
     */
    async aceptarOfertaManual(sdpB64: string, game: IGame): Promise<string> {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        const info: RemotePlayer = { pc, dc: null as any, entidad: null, unsubscribes: [] };

        let payload;
        try {
            payload = extraerSdpManual(JSON.parse(atob(sdpB64)));
        } catch {
            throw new Error('Oferta manual inválida: no es base64/JSON. Revisa que hayas pegado la oferta completa.');
        }
        if (!payload) {
            throw new Error('Oferta manual inválida: falta el SDP. Revisa que hayas pegado la oferta completa.');
        }
        if (payload.sdp.type !== 'offer') {
            throw new Error(`El código no es una oferta WebRTC (type=${payload.sdp.type}).`);
        }
        const token = payload.token;
        const sdp = payload.sdp;
        info.token = token ?? undefined;

        pc.ondatachannel = (event) => {
            const dc = event.channel;
            info.dc = dc;
            this.jugadoresRemotos.set('host', info);
            this.setupDataChannelHandlers(dc, 'host', game);
        };

        await pc.setRemoteDescription(new RTCSessionDescription(sdp as RTCSessionDescriptionInit));
        const espera = this.esperarDescripcionLocal(pc, token);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        return espera;
    }
}
