export class NetworkManager {
  public idLocal: string;
  public multiplayerActivo: boolean = false;
  public mundoSincronizado: boolean = false;
  public jugadoresRemotos: Map<string, any> = new Map();
  public esHost: boolean = false;
  public idPartidaActual: string | null = null;
  public colaMensajesPendientes: any[] = [];

  constructor() {
    this.idLocal = "L" + Math.random().toString(36).substr(2, 9);
  }

  setupDataChannelHandlers(canal: RTCDataChannel, idEmisor: string, game: any) {
    canal.addEventListener('open', () => {
      this.multiplayerActivo = true;
      game.protagonista.nombre = (document.getElementById('nickInput') as HTMLInputElement).value || "Héroe";
      this.enviarMensaje({ tipo: 'handshake', nick: game.protagonista.nombre, id: this.idLocal });

      if (this.esHost) {
        game.registrarEventoLog(`Jugador conectado (${idEmisor})`);
        this.mundoSincronizado = true;
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
  }

  enviarMensaje(objeto: any, exceptId: string | null = null) {
    const data = JSON.stringify(objeto);
    this.jugadoresRemotos.forEach((j, id) => {
      if (id !== exceptId && j.dc && j.dc.readyState === "open") {
        try {
          j.dc.send(data);
        } catch (e) {
          console.error(`Error enviando a ${id}:`, e);
        }
      }
    });
  }

  async setupWebRTCHost(guestId: string, game: any) {
    if (!guestId) return;
    if (this.jugadoresRemotos.has(guestId)) {
      const existing = this.jugadoresRemotos.get(guestId);
      if (existing.pc && (existing.pc.connectionState === 'connected' || existing.pc.connectionState === 'connecting')) {
        return;
      }
    }

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    const dc = pc.createDataChannel("mazeRPG");
    const iceBuffer: any[] = [];
    const info = { pc, dc, entidad: null, unsubscribes: [] as any[] };
    this.jugadoresRemotos.set(guestId, info);
    this.setupDataChannelHandlers(dc, guestId, game);

    dc.addEventListener('open', () => {
      info.unsubscribes.forEach(unsub => unsub());
      info.unsubscribes = [];
      pc.onicecandidate = null;
      if (this.idPartidaActual) game.limpiarSignalingFirestore(this.idPartidaActual, guestId);
    });

    pc.onicecandidate = (event: any) => {
      if (event.candidate && game.db && this.idPartidaActual) {
        game.db.collection('partidas').doc(this.idPartidaActual)
          .collection('conexiones').doc(guestId)
          .collection('iceCandidatesHost').add(event.candidate.toJSON());
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (game.db && this.idPartidaActual) {
      await game.db.collection('partidas').doc(this.idPartidaActual)
        .collection('conexiones').doc(guestId).set({
          offer: { type: offer.type, sdp: offer.sdp }
        }, { merge: true });
    }

    const unsubAnswer = game.db.collection('partidas').doc(this.idPartidaActual)
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

    const unsubIce = game.db.collection('partidas').doc(this.idPartidaActual)
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

  async setupWebRTCGuest(partidaId: string, game: any) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    const iceBuffer: any[] = [];
    const info = { pc, dc: null, entidad: null, unsubscribes: [] as any[] };

    pc.ondatachannel = (event: any) => {
      const dc = event.channel;
      info.dc = dc as any;
      this.jugadoresRemotos.set('host', info);
      this.setupDataChannelHandlers(dc, 'host', game);
      dc.addEventListener('open', () => {
        info.unsubscribes.forEach(unsub => unsub());
        info.unsubscribes = [];
        pc.onicecandidate = null;
      });
    };

    pc.onicecandidate = (event: any) => {
      if (event.candidate && game.db) {
        game.db.collection('partidas').doc(partidaId)
          .collection('conexiones').doc(this.idLocal)
          .collection('iceCandidatesGuest').add(event.candidate.toJSON());
      }
    };

    if (game.db) {
      await game.db.collection('partidas').doc(partidaId).collection('conexiones').doc(this.idLocal).set({
        id: this.idLocal,
        nick: game.protagonista.nombre
      });
    }

    const unsubOffer = game.db.collection('partidas').doc(partidaId)
      .collection('conexiones').doc(this.idLocal).onSnapshot(async (doc: any) => {
        const data = doc.data();
        if (data && data.offer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          while(iceBuffer.length > 0) {
            pc.addIceCandidate(new RTCIceCandidate(iceBuffer.shift()));
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await game.db.collection('partidas').doc(partidaId)
            .collection('conexiones').doc(this.idLocal).set({
              answer: { type: answer.type, sdp: answer.sdp }
            }, { merge: true });
        }
      });

    const unsubIce = game.db.collection('partidas').doc(partidaId)
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

  iniciarComoHostManual(game: any) {
    this.esHost = true;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    const dc = pc.createDataChannel("mazeRPG");
    const info = { pc, dc, entidad: null, unsubscribes: [] };
    this.jugadoresRemotos.set('manual', info);
    this.setupDataChannelHandlers(dc, 'manual', game);

    pc.onicecandidate = () => {
        const offer = pc.localDescription;
        if (offer) (document.getElementById('manualOfferOut') as HTMLTextAreaElement).value = btoa(JSON.stringify(offer));
    };

    pc.createOffer().then(offer => pc.setLocalDescription(offer));
    game.iniciarMotorJuego();
  }

  procesarRespuestaManual() {
    const answerBase64 = (document.getElementById('manualAnswerIn') as HTMLTextAreaElement).value.trim();
    if (!answerBase64) return;
    try {
        const answer = JSON.parse(atob(answerBase64));
        const info = this.jugadoresRemotos.get('manual');
        if (info && info.pc) info.pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (e) {}
  }

  async procesarOfertaManual(game: any) {
    const offerBase64 = (document.getElementById('manualOfferIn') as HTMLTextAreaElement).value.trim();
    if (!offerBase64) return;
    this.esHost = false;
    try {
        const offer = JSON.parse(atob(offerBase64));
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        const info = { pc, dc: null, entidad: null, unsubscribes: [] };
        pc.ondatachannel = (event: any) => {
            const dc = event.channel;
            info.dc = dc as any;
            this.jugadoresRemotos.set('manual', info);
            this.setupDataChannelHandlers(dc, 'manual', game);
            dc.addEventListener('open', () => {
                game.uiManager.ocultarLobby();
                game.iniciarMotorJuego();
            });
        };
        pc.onicecandidate = () => {
            const answer = pc.localDescription;
            if (answer) (document.getElementById('manualAnswerOut') as HTMLTextAreaElement).value = btoa(JSON.stringify(answer));
        };
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
    } catch (e) {}
  }
}
