export class UIManager {
  private logTextArea: HTMLTextAreaElement | null = null;
  private listaTextosFlotantes: any[] = [];
  public listaMensajesChat: any[] = [];

  constructor() {
    this.logTextArea = document.getElementById('logTextArea') as HTMLTextAreaElement;
  }

  ocultarLobby() {
    const lobby = document.getElementById('lobby');
    if (lobby) lobby.style.display = 'none';
    const canvas = document.getElementById('mazeCanvas');
    if (canvas) canvas.style.display = 'block';
  }

  registrarLogConexion(msg: string) {
    if (this.logTextArea) {
      const timestamp = new Date().toLocaleTimeString();
      this.logTextArea.value += `[${timestamp}] ${msg}\n`;
      this.logTextArea.scrollTop = this.logTextArea.scrollHeight;
    }
    console.log(`[CONN-LOG] ${msg}`);
  }

  toggleChat(game: any) {
    const modal = document.getElementById('chatModal');
    const input = document.getElementById('chatInput') as HTMLInputElement;

    if (modal && modal.style.display === 'flex') {
      const texto = input.value.trim();
      if (texto) {
        this.enviarChat(texto, game);
      }
      input.value = "";
      modal.style.display = 'none';
    } else if (modal && !game.juegoTerminado) {
      modal.style.display = 'flex';
      input.focus();
    }
  }

  enviarChat(texto: string, game: any) {
    this.manejarMensajeChat(game.protagonista.nombre, texto, true, game);
    if (game.network && game.network.activo) {
      game.network.enviarMensaje({ tipo: 'chat', texto: texto, id: game.network.idLocal });
    }
  }

  manejarMensajeChat(nombre: string, texto: string, _esLocal: boolean, game: any) {
    let emisor = game.obtenerEntidadPorNombre(nombre);
    if (emisor) {
      const celda = game.mapaLaberinto[emisor.fila][emisor.columna];
      const tiempoActual = Date.now();
      const tiempoDesdeVisto = tiempoActual - celda.ultimoAvistamiento;
      if (game.config.vistaDebugActivada || (celda.ultimoAvistamiento > 0 && tiempoDesdeVisto < game.config.TIEMPO_DESVANECIMIENTO_NIEBLA)) {
        // En el futuro, podríamos dibujar un bocadillo aquí
      }
    }
    game.registrarEventoLog(`CHAT - ${nombre}: ${texto}`);
  }

  crearTextoFlotanteEnCelda(f: number, c: number, texto: string, color: string, game: any) {
    const offset = game.renderer.obtenerOffsetCamara(game.protagonista, game.config);
    const { colOffset, filaOffset } = offset;
    if (f < filaOffset || f >= filaOffset + game.config.CELDAS_VISIBLES_Y ||
        c < colOffset || c >= colOffset + game.config.CELDAS_VISIBLES_X) return;

    const x = (c - colOffset) * game.config.TAMANO_CELDA + game.config.TAMANO_CELDA / 2;
    const y = (f - filaOffset) * game.config.TAMANO_CELDA + game.config.ALTO_UI_TOP + game.config.TAMANO_CELDA / 2;
    this.listaTextosFlotantes.push({ x, y, texto, color, vida: 60, opacidad: 1.0 });
  }

  actualizarTextosFlotantes() {
    for (let i = this.listaTextosFlotantes.length - 1; i >= 0; i--) {
      const t = this.listaTextosFlotantes[i];
      t.y -= 0.5;
      t.vida--;
      t.opacidad = Math.max(0, t.vida / 60);
      if (t.vida <= 0) this.listaTextosFlotantes.splice(i, 1);
    }
  }

  dibujarTextosFlotantes(ctx: CanvasRenderingContext2D) {
    this.listaTextosFlotantes.forEach(t => {
      ctx.save();
      ctx.globalAlpha = t.opacidad;
      ctx.fillStyle = t.color;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(t.texto, t.x, t.y);
      ctx.restore();
    });
  }
}
