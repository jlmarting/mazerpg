export class UIManager {
  constructor(game: any) {
    this.setupListeners(game);
  }

  private setupListeners(game: any) {
    document.querySelector("button[onclick='empezarSolo()']")?.addEventListener('click', (e) => {
      e.preventDefault();
      game.empezarSolo();
    });

    document.querySelector("button[onclick='iniciarComoHostFirebase()']")?.addEventListener('click', (e) => {
      e.preventDefault();
      game.iniciarComoHostFirebase();
    });

    document.querySelector("button[onclick='mostrarLobbyFirebase()']")?.addEventListener('click', (e) => {
      e.preventDefault();
      game.mostrarLobbyFirebase();
    });

    document.querySelector("button[onclick='mostrarLobbyManual()']")?.addEventListener('click', (e) => {
      e.preventDefault();
      game.mostrarLobbyManual();
    });

    document.getElementById('btnAceptarJugadores')?.addEventListener('click', () => {
      game.admitirCandidatos();
    });

    // Manual lobby buttons
    document.querySelector("#manualHostSection button")?.addEventListener('click', () => game.iniciarComoHostManual());
    document.querySelector("#manualHostSection button:nth-of-type(2)")?.addEventListener('click', () => game.procesarRespuestaManual());
    document.querySelector("#manualGuestSection button")?.addEventListener('click', () => game.procesarOfertaManual());

    // ... add more as needed
  }

  toggleDebugManual(game: any) {
    game.vistaDebugActivada = !game.vistaDebugActivada;
    game.registrarEventoLog(`Modo Desarrollo ${game.vistaDebugActivada ? 'ACTIVADO' : 'DESACTIVADO'}`);
    this.registrarLogConexion(`Debug toggled: ${game.vistaDebugActivada}`);
  }

  toggleLogPanel() {
    document.getElementById('logPanel')?.classList.toggle('visible');
  }

  registrarLogConexion(msg: string) {
    const area = document.getElementById('logTextArea') as HTMLTextAreaElement;
    if (!area) return;
    const timestamp = new Date().toLocaleTimeString();
    const fullMsg = `[${timestamp}] ${msg}\n`;
    area.value += fullMsg;
    area.scrollTop = area.scrollHeight;
    console.log(`[CONN-LOG] ${msg}`);
  }

  toggleChat(game: any) {
    const modal = document.getElementById('chatModal');
    const input = document.getElementById('chatInput') as HTMLInputElement;
    if (!modal || !input) return;

    if (modal.style.display === 'flex') {
      const texto = input.value.trim();
      if (texto) {
        game.enviarChat(texto);
      }
      input.value = "";
      modal.style.display = 'none';
    } else {
      if (game.juegoTerminado) return;
      modal.style.display = 'flex';
      input.focus();
    }
  }

  ocultarLobby() {
    const lobby = document.getElementById('lobby');
    const canvas = document.getElementById('mazeCanvas');
    if (lobby) lobby.style.display = 'none';
    if (canvas) canvas.style.display = 'block';
  }
}
