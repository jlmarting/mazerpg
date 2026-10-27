import { IGame } from '../types';
import { aparienciaEfectiva } from '../core/avatarTintes';
import { SignalingClient, SignalPayload } from './SignalingClient';
import { diagMpActivo, diagMpContar } from './diagnosticoMp';

export interface RemotePlayer {
    pc: RTCPeerConnection;
    dc: RTCDataChannel;
    entidad: any;
    /** Marca de creación para distinguir conexiones en curso de las atascadas. */
    creadoEn?: number;
}

export class NetworkManagerHttp {
    public idLocal: string;
    public playerId: string;
    public hostEpoch: number = 1;
    public multiplayerActivo: boolean = false;
    public esHost: boolean = false;
    public idPartidaActual: string | null = null;
    public jugadoresRemotos: Map<string, RemotePlayer> = new Map();
    public activo: boolean = false;
    /** true mientras una reconexión planificada está desmontando/montando peers. */
    public reconectando: boolean = false;
    public signaling: SignalingClient | null = null;

    private iceBuffers: Map<string, any[]> = new Map(); // TODO(jl): entries never removed — clean up on channel open or disconnect
    private unsubscribes: Map<string, () => void> = new Map();

    constructor(idLocal?: string, playerId?: string) {
        this.idLocal = idLocal ?? ("L" + Math.random().toString(36).substr(2, 9));
        this.playerId = playerId ?? this.idLocal;
    }

    setSignaling(signaling: SignalingClient) {
        this.signaling = signaling;
    }

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

    setupDataChannelHandlers(canal: RTCDataChannel, idEmisor: string, game: IGame) {
        let estuvoAbierto = false;
        canal.addEventListener('open', () => {
            estuvoAbierto = true;
            this.activo = true;
            this.multiplayerActivo = true;
            // Robustez: asegura la entidad remota aunque el handshake se pierda.
            (game as any).asegurarEntidadRemota?.(idEmisor);
            const nick = (document.getElementById('nickInput') as HTMLInputElement).value || "Héroe";
            const clase = game.protagonista.clase;
            const stats = { fue: game.protagonista.fuerza, agi: game.protagonista.agilidad, int: game.protagonista.inteligencia };
            const apariencia = aparienciaEfectiva(game.protagonista.clase || 'guerrero', game.protagonista.apariencia);
            // Solo el invitado inicia el handshake; el host responde al recibirlo.
            if (!this.esHost) {
                this.enviarMensaje({
                    tipo: 'handshake', nick, id: this.idLocal,
                    playerId: this.playerId, hostEpoch: this.hostEpoch,
                    clase, stats, apariencia,
                });
            }

            if (this.esHost) {
                game.registrarEventoLog(`Jugador conectado (${idEmisor})`);
            } else {
                // Guest: iniciar motor de juego cuando se conecta al Host
                game.registrarEventoLog('Conectado al Host. Iniciando juego...');
                game.iniciarMotorJuego();
            }
        });

        canal.onmessage = (evento) => {
            try {
                const mensaje = JSON.parse(evento.data);
                if (diagMpActivo()) {
                    diagMpContar(`rec:${mensaje?.tipo ?? '?'}`, 1);
                    if (mensaje?.tipo === 'snapshot') {
                        diagMpContar('bytesSnapshotRec', typeof evento.data === 'string' ? evento.data.length : 0);
                    }
                }
                game.procesarMensajeMultiplayer(mensaje, idEmisor);
            } catch(e) {
                console.error("Error al procesar mensaje P2P:", e);
            }
        };

        canal.addEventListener('close', () => {
            const actual = this.jugadoresRemotos.get(idEmisor);
            // Cierre de un canal viejo reemplazado por un reintento: no borrar
            // la entrada nueva ni disparar una elección de host.
            if (actual && actual.dc && actual.dc !== canal) return;
            game.registrarEventoLog(`Jugador desconectado (${idEmisor})`);
            this.jugadoresRemotos.delete(idEmisor);
            const unsubCierre = this.unsubscribes.get(idEmisor);
            if (unsubCierre) { unsubCierre(); this.unsubscribes.delete(idEmisor); }
            this.iceBuffers.delete(idEmisor);
            try { game.cancelarTruequesDe(idEmisor); } catch {}
            if (estuvoAbierto && this.esHost && this.idPartidaActual) {
                void this.signaling?.removeGuest(this.idPartidaActual, idEmisor);
            }

            if (idEmisor === 'host' && !this.esHost) {
                game.registrarEventoLog("El Host se ha desconectado. Iniciando elección de nuevo Host...");
                game.iniciarEleccionHost();
            }

            if (this.jugadoresRemotos.size === 0 && !this.esHost && !this.reconectando) {
                this.activo = false;
                this.multiplayerActivo = false;
            }
        });
    }

    /** Desmonta peers, unsubs y buffers sin tocar la partida ni la sesión. */
    reiniciarPeers(): void {
        this.signaling?.reiniciarSenales();
        this.unsubscribes.forEach((unsub) => { try { unsub(); } catch { /* noop */ } });
        this.unsubscribes.clear();
        this.jugadoresRemotos.forEach((j) => {
            try { j.dc?.close(); } catch { /* noop */ }
            try { j.pc?.close(); } catch { /* noop */ }
        });
        this.jugadoresRemotos.clear();
        this.iceBuffers.clear();
        this.activo = false;
        this.multiplayerActivo = false;
    }

    private async enviarSenal(toId: string, payload: SignalPayload) {
        if (!this.signaling || !this.idPartidaActual) return;
        await this.signaling.enviarSenal(this.idPartidaActual, this.idLocal, toId, payload);
    }

    async setupWebRTCHost(guestId: string, game: IGame) {
        if (!guestId || !this.signaling) return;
        if (this.jugadoresRemotos.has(guestId)) {
            const existing = this.jugadoresRemotos.get(guestId)!;
            const conectado = existing.pc?.connectionState === 'connected' || existing.dc?.readyState === 'open';
            const enCurso = existing.pc?.connectionState === 'connecting' || existing.pc?.connectionState === 'new';
            const edad = Date.now() - (existing.creadoEn ?? 0);
            if (conectado || (enCurso && edad < 8000)) return;
            // Conexión atascada: desmontar y reintentar con una oferta nueva.
            const unsubViejo = this.unsubscribes.get(guestId);
            if (unsubViejo) { unsubViejo(); this.unsubscribes.delete(guestId); }
            try { existing.dc?.close(); } catch { /* noop */ }
            try { existing.pc?.close(); } catch { /* noop */ }
            this.jugadoresRemotos.delete(guestId);
            this.iceBuffers.delete(guestId);
        }

        game.ui.registrarLogConexion(`Iniciando PeerConnection para Invitado: ${guestId}`);
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        const dc = pc.createDataChannel("mazeRPG");
        const iceBuffer: any[] = [];
        this.iceBuffers.set(guestId, iceBuffer);
        const info: RemotePlayer = { pc, dc, entidad: null, creadoEn: Date.now() };
        this.jugadoresRemotos.set(guestId, info);
        this.setupDataChannelHandlers(dc, guestId, game);

        dc.addEventListener('open', () => {
            game.ui.registrarLogConexion(`✅ CANAL P2P ABIERTO con ${guestId}.`);
            // Envío robusto del mundo: no depende de la cadena de handshake.
            (game as any).enviarMapaAlInvitado(guestId);
            const unsub = this.unsubscribes.get(guestId);
            if (unsub) { unsub(); this.unsubscribes.delete(guestId); }
            pc.onicecandidate = null;
            this.iceBuffers.delete(guestId);
            if (this.idPartidaActual) this.signaling!.limpiarSignaling(this.idPartidaActual, guestId);
        });

        pc.onicecandidate = (event) => {
            if (event.candidate && this.idPartidaActual) {
                this.enviarSenal(guestId, { type: 'ice', data: event.candidate.toJSON() });
            }
        };

        // El listener de answer/ICE debe existir ANTES de enviar la oferta: la
        // respuesta puede llegar en el siguiente poll y la bandeja se vacía.
        const unsub = this.signaling.onSignal((fromId, payload) => {
            if (fromId !== guestId) return;

            if (payload.type === 'answer' && !pc.currentRemoteDescription) {
                pc.setRemoteDescription(new RTCSessionDescription(payload.data)).then(() => {
                    while (iceBuffer.length > 0) {
                        pc.addIceCandidate(new RTCIceCandidate(iceBuffer.shift()));
                    }
                });
            } else if (payload.type === 'ice') {
                if (pc.remoteDescription) {
                    pc.addIceCandidate(new RTCIceCandidate(payload.data));
                } else {
                    iceBuffer.push(payload.data);
                }
            }
        });
        this.unsubscribes.set(guestId, unsub);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await this.enviarSenal(guestId, { type: 'offer', data: { type: offer.type, sdp: offer.sdp } });
    }

    async setupWebRTCGuest(partidaId: string, game: IGame, hostEsperado?: string | null) {
        if (!this.signaling) return;
        
        this.idPartidaActual = partidaId;
        this.signaling.setPartidaActual(partidaId);
        
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        const iceBuffer: any[] = [];
        this.iceBuffers.set('host', iceBuffer);
        const info: RemotePlayer = { pc, dc: null as any, entidad: null };

        pc.ondatachannel = (event) => {
            const dc = event.channel;
            info.dc = dc;
            this.jugadoresRemotos.set('host', info);
            this.setupDataChannelHandlers(dc, 'host', game);
            
            dc.addEventListener('open', () => {
                const unsub = this.unsubscribes.get('host');
                if (unsub) { unsub(); this.unsubscribes.delete('host'); }
                pc.onicecandidate = null;
            });
        };

        let hostId: string | null = null;
        pc.onicecandidate = (event) => {
            if (event.candidate && hostId) {
                this.enviarSenal(hostId, { type: 'ice', data: event.candidate.toJSON() });
            }
        };

        const unsub = this.signaling.onSignal(async (fromId, payload) => {
            if (payload.type === 'offer' && !pc.currentRemoteDescription) {
                // Una oferta vieja del host difunto no debe secuestrar la reunión.
                if (hostEsperado && fromId !== hostEsperado) return;
                hostId = fromId; // el buzón del host es su id real (fromId de la offer)
                await pc.setRemoteDescription(new RTCSessionDescription(payload.data));

                while(iceBuffer.length > 0) {
                    pc.addIceCandidate(new RTCIceCandidate(iceBuffer.shift()));
                }

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await this.enviarSenal(hostId, { type: 'answer', data: { type: answer.type, sdp: answer.sdp } });
            } else if (payload.type === 'ice') {
                if (pc.remoteDescription) {
                    pc.addIceCandidate(new RTCIceCandidate(payload.data));
                } else {
                    iceBuffer.push(payload.data);
                }
            }
        });
        this.unsubscribes.set('host', unsub);

        this.signaling.iniciarPolling(this.idLocal);
    }

    iniciarPollingParaGuest(_game?: IGame) {
        if (!this.signaling) return;
        this.signaling.iniciarPolling(this.idLocal);
    }

    detenerPolling() {
        if (this.signaling) {
            this.signaling.detenerPolling();
        }
    }

    desconectar() {
        this.detenerPolling();
        this.reiniciarPeers();
        if (this.signaling) {
            this.signaling.desconectar();
        }
    }
}
