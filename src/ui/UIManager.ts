import { IGame, ActionType, IActionPacket } from '../types';

export class UIManager {
  private logTextArea: HTMLTextAreaElement | null = null;
  private listaTextosFlotantes: any[] = [];
  private notificacionGrande: { texto: string, expira: number, color: string } | null = null;
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

  toggleChat(game: IGame) {
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

  enviarChat(texto: string, game: IGame) {
    this.manejarMensajeChat(game.protagonista.nombre, texto, true, game, (game as any).network.idLocal);

    const packet: IActionPacket = {
        t: Date.now(),
        p: (game as any).network.idLocalNumerico,
        a: ActionType.CHAT,
        d: texto
    };

    if (game.esHost) {
        game.encolarAccion(packet);
    } else if ((game as any).network.activo) {
        (game as any).network.enviarMensaje({ tipo: 'action', a: packet });
    }
  }

  manejarMensajeChat(nombre: string, texto: string, _esLocal: boolean, game: IGame, id?: string) {
    let emisor = (game as any).obtenerEntidadPorId ? (game as any).obtenerEntidadPorId(id) : game.obtenerEntidadPorNombre(nombre);
    if (emisor) {
      const celda = game.mapaLaberinto[emisor.fila][emisor.columna];
      const tiempoActual = Date.now();
      const tiempoDesdeVisto = tiempoActual - celda.ultimoAvistamiento;

      let visible = game.config.vistaDebugActivada;
      if (celda.ultimoAvistamiento > 0 && tiempoDesdeVisto < game.config.TIEMPO_DESVANECIMIENTO_NIEBLA) {
          visible = true;
      }

      if (visible) {
        emisor.bubbleChat = { texto: texto, expira: Date.now() + 4000 };
      }

      // Comandos especiales y Teletransporte de burbuja
      const msgNorm = texto.toLowerCase().trim();
      if (msgNorm === "a mi la guardia") {
        (game as any).teletransportarAliados(emisor, _esLocal);
      }

      // Lógica de burbuja
      if (celda.burbuja && msgNorm === celda.burbuja.destino.toLowerCase()) {
        // Buscar burbuja destino
        let encontrada = false;
        for (let f = 0; f < game.config.NUMERO_FILAS; f++) {
          for (let c = 0; c < game.config.NUMERO_COLUMNAS; c++) {
            const b = game.mapaLaberinto[f][c].burbuja;
            if (b && b.nombreSecreto.toLowerCase() === msgNorm) {
              emisor.fila = f;
              emisor.columna = c;
              this.mostrarNotificacionGrande("¡TELETRANSPORTE!", "#00ffff", 2000);
              game.registrarEventoLog(`${nombre} se ha teletransportado.`);

              if (_esLocal && emisor === game.protagonista) {
                if (game.network && game.network.activo) {
                  game.network.enviarMensaje({
                    tipo: 'posicion',
                    f: emisor.fila,
                    c: emisor.columna,
                    cam: false,
                    id: game.network.idLocal,
                    nick: emisor.nombre,
                    hp: emisor.vidaActual,
                    maxHp: emisor.vidaMaxima
                  });
                }
              }
              encontrada = true;
              break;
            }
          }
          if (encontrada) break;
        }
      }
    }
    game.registrarEventoLog(`CHAT - ${nombre}: ${texto}`);
  }

  crearTextoFlotanteEnCelda(f: number, c: number, texto: string, color: string, game: IGame) {
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

    if (this.notificacionGrande && Date.now() < this.notificacionGrande.expira) {
        ctx.save();
        ctx.fillStyle = this.notificacionGrande.color;
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#000';
        ctx.fillText(this.notificacionGrande.texto, ctx.canvas.width / 2, ctx.canvas.height / 2);
        ctx.restore();
    } else {
        this.notificacionGrande = null;
    }
  }

  mostrarNotificacionGrande(texto: string, color: string = "#fff", duracion: number = 3000) {
    this.notificacionGrande = { texto, expira: Date.now() + duracion, color };
  }
}
