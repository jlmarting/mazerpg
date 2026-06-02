import { IGame } from '../types';
import { SignalingClient, SignalPayload } from './SignalingClient';

export interface RemotePlayer {
    pc: RTCPeerConnection;
    dc: RTCDataChannel;
    entidad: any;
}

export class NetworkManagerHttp {
    public idLocal: string = "L" + Math.random().toString(36).substr(2, 9);
    public multiplayerActivo: boolean = false;
    public esHost: boolean = false;
    public idPartidaActual: string | null = null;
    public jugadoresRemotos: Map<string, RemotePlayer> = new Map();
    public activo: boolean = false;
    public signaling: SignalingClient | null = null;

    private iceBuffers: Map<string, any[]> = new Map();
    private unsubscribes: Map<string, () => void> = new Map();

    constructor() {}

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
        canal.addEventListener('open', () => {
            this.activo = true;
            this.multiplayerActivo = true;
            const nick = (document.getElementById('nickInput') as HTMLInputElement).value || "Héroe";
            const clase = game.protagonista.clase;
            const stats = { fue: game.protagonista.fuerza, agi: game.protagonista.agilidad, int: game.protagonista.inteligencia };
            this.enviarMensaje({ tipo: 'handshake', nick, id: this.idLocal, clase, stats });

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

    private async enviarSenal(toId: string, payload: SignalPayload) {
        if (!this.signaling || !this.idPartidaActual) return;
        await this.signaling.enviarSenal(this.idPartidaActual, this.idLocal, toId, payload);
    }

    async setupWebRTCHost(guestId: string, game: IGame) {
        if (!guestId || !this.signaling) return;
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
        this.iceBuffers.set(guestId, iceBuffer);
        const info: RemotePlayer = { pc, dc, entidad: null };
        this.jugadoresRemotos.set(guestId, info);
        this.setupDataChannelHandlers(dc, guestId, game);

        dc.addEventListener('open', () => {
            game.ui.registrarLogConexion(`✅ CANAL P2P ABIERTO con ${guestId}.`);
            pc.onicecandidate = null;
            if (this.idPartidaActual) this.signaling!.limpiarSignaling(this.idPartidaActual, guestId);
        });

        pc.onicecandidate = (event) => {
            if (event.candidate && this.idPartidaActual) {
                this.enviarSenal('*', { type: 'ice', data: event.candidate.toJSON() });
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await this.enviarSenal('*', { type: 'offer', data: { type: offer.type, sdp: offer.sdp } });

        const unsub = this.signaling.onSignal((fromId, payload) => {
            if (fromId !== guestId) return;

            if (payload.type === 'answer' && !pc.currentRemoteDescription) {
                pc.setRemoteDescription(new RTCSessionDescription(payload.data)).then(() => {
                    while(iceBuffer.length > 0) {
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
    }

    async setupWebRTCGuest(partidaId: string, game: IGame) {
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

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.enviarSenal('host', { type: 'ice', data: event.candidate.toJSON() });
            }
        };

        const unsub = this.signaling.onSignal(async (_fromId, payload) => {
            if (payload.type === 'offer' && !pc.currentRemoteDescription) {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.data));
                
                while(iceBuffer.length > 0) {
                    pc.addIceCandidate(new RTCIceCandidate(iceBuffer.shift()));
                }
                
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await this.enviarSenal(this.idLocal, { type: 'answer', data: { type: answer.type, sdp: answer.sdp } });
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
        this.unsubscribes.forEach(unsub => unsub());
        this.unsubscribes.clear();
        this.jugadoresRemotos.forEach((j) => {
            j.dc?.close();
            j.pc.close();
        });
        this.jugadoresRemotos.clear();
        this.multiplayerActivo = false;
        this.activo = false;
        if (this.signaling) {
            this.signaling.desconectar();
        }
    }
}
