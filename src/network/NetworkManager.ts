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
      this.multiplayerActivo = true;
      const nick = (document.getElementById('nickInput') as HTMLInputElement).value || "Héroe";
      const clase = game.protagonista.clase;
      this.enviarMensaje({ tipo: 'handshake', nick, id: this.idLocal, clase });

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
