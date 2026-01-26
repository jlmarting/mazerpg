export class NetworkManager {
  public idLocal: string = "L" + Math.random().toString(36).substr(2, 9);
  public multiplayerActivo: boolean = false;
  public esHost: boolean = false;
  public idPartidaActual: string | null = null;
  public jugadoresRemotos: Map<string, any> = new Map();

  enviarMensaje(objeto: any, exceptId: string | null = null) {
    const data = JSON.stringify(objeto);
    this.jugadoresRemotos.forEach((j, id) => {
      if (id !== exceptId && j.dc && j.dc.readyState === "open") {
        try { j.dc.send(data); } catch (e) {}
      }
    });
  }

  async setupWebRTCHost(guestId: string, game: any) {
     // Implementation ...
  }

  async setupWebRTCGuest(partidaId: string, game: any) {
     // Implementation ...
  }
}
