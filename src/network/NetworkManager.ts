import { IGame } from '../types';

export interface RemotePlayer {
    pc: RTCPeerConnection;
    dc: RTCDataChannel;
    entidad: any;
    unsubscribes: (() => void)[];
}

export class NetworkManager {
  public idLocal: string = "L" + Math.random().toString(36).substr(2, 9);
  public multiplayerActivo: boolean = false;
  public esHost: boolean = false;
  public idPartidaActual: string | null = null;
  public jugadoresRemotos: Map<string, RemotePlayer> = new Map();
  public activo: boolean = false;
  public idRealDelHost: string | null = null;
  public latenciaPeer: Map<string, number> = new Map();
  private _intervaloPing: any = null;

  constructor() {}

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
      this.latenciaPeer.set(idEmisor, 0);
      if (!this._intervaloPing) {
          this._intervaloPing = setInterval(() => this.realizarPings(), 5000);
      }
      this.multiplayerActivo = true;
      const nick = (document.getElementById('nickInput') as HTMLInputElement).value || "Héroe";
      this.enviarMensaje({ tipo: 'handshake', nick: nick, id: this.idLocal });

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

  enviarMensajeAPeer(peerId: string, objeto: any) {
      const j = this.jugadoresRemotos.get(peerId);
      if (j && j.dc && j.dc.readyState === "open") {
          try { j.dc.send(JSON.stringify(objeto)); } catch(e) { console.error(e); }
      }
  }

  realizarPings() {
      if (!this.multiplayerActivo) return;
      this.jugadoresRemotos.forEach((_j, id) => {
          this.enviarMensajeAPeer(id, { tipo: 'ping', t: Date.now() });
      });
  }

  async forzarReconexion(game: IGame) {
      game.registrarEventoLog("Iniciando reconexión forzada...");
      if (this.esHost) {
          // El host no suele reconectar, espera que los invitados lo hagan
          game.registrarEventoLog("Como Host, notificando a invitados que refresquen...");
          this.enviarMensaje({ tipo: 'force_reconnect_request' });
      } else {
          // Como invitado, reiniciamos el handshake con el host
          if (this.idPartidaActual) {
              game.registrarEventoLog("Reiniciando handshake con el Host...");
              // Limpiamos rastro previo
              const hostInfo = this.jugadoresRemotos.get('host') || this.jugadoresRemotos.get(this.idRealDelHost || '');
              if (hostInfo && hostInfo.pc) {
                  hostInfo.pc.close();
              }
              this.jugadoresRemotos.delete('host');
              if (this.idRealDelHost) this.jugadoresRemotos.delete(this.idRealDelHost);

              // Volvemos a iniciar
              this.setupWebRTCGuest(this.idPartidaActual, game);
          }
      }
  }

  async setupWebRTCHost(guestId: string, game: IGame) {
    if (!guestId) return;
    if (this.jugadoresRemotos.has(guestId)) {
      const existing = this.jugadoresRemotos.get(guestId)!;
      if (existing.pc) {
          try { existing.pc.close(); } catch(e) {}
      }
    }

    game.ui.registrarLogConexion(`Iniciando PeerConnection para Invitado: ${guestId}`);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    const dc = pc.createDataChannel("mazeRPG");
    const iceBuffer: any[] = [];
    const info: RemotePlayer = { pc, dc, entidad: null, unsubscribes: [] };
    this.jugadoresRemotos.set(guestId, info);
    this.setupDataChannelHandlers(dc, guestId, game);

    dc.addEventListener('open', () => {
      game.ui.registrarLogConexion(`✅ CANAL P2P ABIERTO con ${guestId}.`);
      info.unsubscribes.forEach(unsub => unsub());
      info.unsubscribes = [];
      pc.onicecandidate = null;
      if (this.idPartidaActual) game.firebase.limpiarSignaling(this.idPartidaActual, guestId);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && this.idPartidaActual) {
        game.firebase.getDb().collection('partidas').doc(this.idPartidaActual)
          .collection('conexiones').doc(guestId)
          .collection('iceCandidatesHost').add(event.candidate.toJSON());
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await game.firebase.getDb().collection('partidas').doc(this.idPartidaActual)
      .collection('conexiones').doc(guestId).set({
        offer: { type: offer.type, sdp: offer.sdp }
      }, { merge: true });

    const unsubAnswer = game.firebase.getDb().collection('partidas').doc(this.idPartidaActual)
      .collection('conexiones').doc(guestId).onSnapshot((doc: any) => {
        const data = doc.data();
        if (data && data.answer && !pc.currentRemoteDescription) {
          pc.setRemoteDescription(new RTCSessionDescription(data.answer)).then(() => {
            while(iceBuffer.length > 0) {
              pc.addIceCandidate(new RTCIceCandidate(iceBuffer.shift()));
            }
          });
        }
      });

    const unsubIce = game.firebase.getDb().collection('partidas').doc(this.idPartidaActual)
      .collection('conexiones').doc(guestId)
      .collection('iceCandidatesGuest').onSnapshot((snapshot: any) => {
        snapshot.docChanges().forEach((change: any) => {
          if (change.type === 'added') {
            const cand = change.doc.data();
            if (pc.remoteDescription) {
              pc.addIceCandidate(new RTCIceCandidate(cand));
            } else {
              iceBuffer.push(cand);
            }
          }
        });
      });

    info.unsubscribes.push(unsubAnswer, unsubIce);
  }

  activarEscuchaConexiones(game: IGame) {
      if (!this.idPartidaActual || !this.esHost) return;
      game.firebase.getDb()!.collection('partidas').doc(this.idPartidaActual).collection('conexiones')
          .onSnapshot((snapshot: any) => {
              snapshot.docChanges().forEach((change: any) => {
                  if (change.type === 'added' || change.type === 'modified') {
                      const guestId = change.doc.id;
                      if (guestId !== this.idLocal) {
                          const data = change.doc.data();
                          // Si es un handshake nuevo o una solicitud de reconexión (documento sin offer/answer del host)
                          if (!data.offer && !data.answer) {
                              game.registrarEventoLog(`Detectada solicitud de conexión de ${guestId}. Admitiendo...`);
                              this.setupWebRTCHost(guestId, game);
                          }
                      }
                  }
              });
          });
  }

  async setupWebRTCGuest(partidaId: string, game: IGame) {
    this.idPartidaActual = partidaId;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    const iceBuffer: any[] = [];
    const info: RemotePlayer = { pc, dc: null as any, entidad: null, unsubscribes: [] };

    pc.ondatachannel = (event) => {
      const dc = event.channel;
      info.dc = dc;
      this.jugadoresRemotos.set('host', info);
      this.setupDataChannelHandlers(dc, 'host', game);
      dc.addEventListener('open', () => {
        info.unsubscribes.forEach(unsub => unsub());
        info.unsubscribes = [];
        pc.onicecandidate = null;
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        game.firebase.getDb().collection('partidas').doc(partidaId)
          .collection('conexiones').doc(this.idLocal)
          .collection('iceCandidatesGuest').add(event.candidate.toJSON());
      }
    };

    await game.firebase.getDb().collection('partidas').doc(partidaId).collection('conexiones').doc(this.idLocal).set({
      id: this.idLocal,
      nick: game.protagonista.nombre
    });

    const unsubOffer = game.firebase.getDb().collection('partidas').doc(partidaId)
      .collection('conexiones').doc(this.idLocal).onSnapshot(async (doc: any) => {
        const data = doc.data();
        if (data && data.offer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          while(iceBuffer.length > 0) {
            pc.addIceCandidate(new RTCIceCandidate(iceBuffer.shift()));
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await game.firebase.getDb().collection('partidas').doc(partidaId)
            .collection('conexiones').doc(this.idLocal).set({
              answer: { type: answer.type, sdp: answer.sdp }
            }, { merge: true });
        }
      });

    const unsubIce = game.firebase.getDb().collection('partidas').doc(partidaId)
      .collection('conexiones').doc(this.idLocal)
      .collection('iceCandidatesHost').onSnapshot((snapshot: any) => {
        snapshot.docChanges().forEach((change: any) => {
          if (change.type === 'added') {
            const cand = change.doc.data();
            if (pc.remoteDescription) {
              pc.addIceCandidate(new RTCIceCandidate(cand));
            } else {
              iceBuffer.push(cand);
            }
          }
        });
      });

    info.unsubscribes.push(unsubOffer, unsubIce);
  }

  // MÉTODOS PARA CONEXIÓN MANUAL (SIN FIREBASE)
  async crearOfertaManual(game: IGame): Promise<string> {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    const dc = pc.createDataChannel("mazeRPG");
    const guestId = "GUEST_" + Math.random().toString(36).substr(2, 5);

    const info: RemotePlayer = { pc, dc, entidad: null, unsubscribes: [] };
    this.jugadoresRemotos.set(guestId, info);
    this.setupDataChannelHandlers(dc, guestId, game);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // En modo manual, tenemos que esperar a que los ICE candidates se recolecten
    // para incluirlos en el SDP y que sea un string único copiable.
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
