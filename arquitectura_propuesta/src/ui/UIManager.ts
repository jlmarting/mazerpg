export class UIManager {
  ocultarLobby() {
    const lobby = document.getElementById('lobby');
    if (lobby) lobby.style.display = 'none';
  }
  registrarLogConexion(msg: string) {
    console.log("[LOG]", msg);
  }
  toggleChat(game: any) {
    // ...
  }
}
