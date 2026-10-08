type LobbyView = 'initial' | 'manual' | 'browser' | 'connecting';

export interface CharacterData {
  nombre: string;
  color: string;
  clase: string;
  fuerza: number;
  agilidad: number;
  inteligencia: number;
  personajeCreado: boolean;
}

export interface LobbyDelegate {
  onSaveCharacter(nombre: string, color: string, clase: string): void;
  onRerollStats(clase: string): void;
  onStartSolo(dificultad: string): void;
  onHostGame(modo: 'firebase' | 'http' | 'manual', dificultad: string): void;
  onJoinGame(partidaId: string, modo: 'firebase' | 'http'): void;
  onResumeSession(): void;
  onSwitchServerMode(modo: 'firebase' | 'http'): void;
  onCancelConnect(): void;
  getCharacterData(): CharacterData;
  hasSavedSession(): boolean;
  getGameList(modo: 'firebase' | 'http'): Promise<any[]>;
  getCurrentServerMode(): 'firebase' | 'http';
  getSignalingUrlLabel(): string;
  isFirebaseConfigured(): boolean;
}

const CLASS_ICONS: Record<string, string> = { guerrero: '\u{1FA96}', explorador: '\u{1F3F9}', mago: '\u{1FA84}' };
const CLASS_NAMES: Record<string, string> = { guerrero: 'GUERRERO', explorador: 'EXPLORADOR', mago: 'MAGO' };
const FANTASY_NAMES = [
  "Tharos", "Elowen", "Grombrindal", "Luthien", "Drizzt", "Ciri", "Geralt", "Yennefer",
  "Boromir", "Galadriel", "Aragorn", "Legolas", "Gimli", "Saruman", "Gandalf", "Radagast",
  "Elrond", "Glorfindel", "Eowyn", "Faramir", "Theoden", "Denethor", "Beren", "Tinuviel"
];

export class LobbyManager {
  private delegate: LobbyDelegate;
  private currentView: LobbyView = 'initial';
  private selectedServerMode: 'firebase' | 'http' = 'firebase';
  private pendingDificultadCallback: ((dif: string) => void) | null = null;

  constructor(delegate: LobbyDelegate) {
    this.delegate = delegate;
    this.selectedServerMode = delegate.getCurrentServerMode();
    this.setupEventListeners();
    this.updateView();
  }

  setDelegate(delegate: LobbyDelegate): void {
    this.delegate = delegate;
  }

  updateView(): void {
    const char = this.delegate.getCharacterData();
    const hasChar = char.personajeCreado || char.nombre !== "Jugador";
    const hasSession = this.delegate.hasSavedSession();

    if (hasChar) {
      this.showElement('characterPreview');
      this.hideElement('charCreationSection');
      this.showElement('gameOptions', 'flex');
      this.fillCharacterPreview(char);
      this.showElement('btnReanudar', 'block', hasSession);
    } else {
      this.hideElement('characterPreview');
      this.showElement('charCreationSection');
      this.hideElement('gameOptions');
    }
    this.updateServerModeButtons();
  }

  showInitialView(): void {
    this.currentView = 'initial';
    this.hideAllLobbyViews();
    this.showElement('lobbyInitial', 'block');
    this.showElement('lobby', 'flex');
    this.hideCanvas();
    this.updateView();
  }

  showManualMode(): void {
    this.currentView = 'manual';
    this.hideElement('lobbyInitial');
    this.showElement('lobbyManual', 'flex');
  }

  showGameBrowser(): void {
    this.currentView = 'browser';
    this.hideElement('lobbyInitial');
    this.showElement('lobbyFirebase', 'flex');
    this.loadGameList();
  }

  showConnecting(message: string): void {
    this.currentView = 'connecting';
    let overlay = document.getElementById('connectingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'connectingOverlay';
      overlay.className = 'connecting-overlay';
      overlay.innerHTML = `
        <div class="connecting-spinner"></div>
        <p class="connecting-message"></p>
        <button class="connecting-cancel">CANCELAR</button>
      `;
      document.getElementById('lobby')!.appendChild(overlay);
      overlay.querySelector('.connecting-cancel')!.addEventListener('click', () => {
        this.delegate.onCancelConnect();
        this.hideConnecting();
      });
    }
    overlay.querySelector('.connecting-message')!.textContent = message;
    overlay.style.display = 'flex';
    const buttons = document.querySelectorAll('#lobby button, #gameOptions button');
    buttons.forEach(b => ((b as HTMLButtonElement).disabled = true));
  }

  hideConnecting(): void {
    const overlay = document.getElementById('connectingOverlay');
    if (overlay) overlay.style.display = 'none';
    const buttons = document.querySelectorAll('#lobby button, #gameOptions button');
    buttons.forEach(b => ((b as HTMLButtonElement).disabled = false));
  }

  openCharacterModal(): void {
    const char = this.delegate.getCharacterData();
    this.showElement('characterModal', 'flex');
    if (!char.personajeCreado && char.nombre === "Jugador") {
      this.generateRandomName();
    } else {
      (document.getElementById('charNameInput') as HTMLInputElement).value = char.nombre;
      (document.getElementById('charColorInput') as HTMLInputElement).value = char.color;
      this.selectClassButton(char.clase);
    }
    this.recalculateStats();
    this.populateStatsDisplay();
  }

  closeCharacterModal(): void {
    this.hideElement('characterModal');
  }

  saveCharacter(): void {
    const name = (document.getElementById('charNameInput') as HTMLInputElement).value.trim() || "Héroe";
    const color = (document.getElementById('charColorInput') as HTMLInputElement).value;
    const selectedClass = document.querySelector('.class-btn.selected')?.getAttribute('data-class') || 'guerrero';
    this.delegate.onSaveCharacter(name, color, selectedClass);
    this.closeCharacterModal();
    this.updateView();
  }

  showDifficultyModal(callback: (diff: string) => void): void {
    this.pendingDificultadCallback = callback;
    this.showElement('difficultyModal', 'flex');
  }

  closeDifficultyModal(): void {
    this.hideElement('difficultyModal');
    this.pendingDificultadCallback = null;
  }

  selectDifficulty(difficulty: string): void {
    this.hideElement('difficultyModal');
    const cb = this.pendingDificultadCallback;
    this.pendingDificultadCallback = null;
    if (cb) cb(difficulty);
  }

  async loadGameList(): Promise<void> {
    const listaContainer = document.getElementById('listaPartidas')!;
    listaContainer.innerHTML = '<p class="game-list-loading">Buscando partidas...</p>';
    const firebaseWarning = document.getElementById('firebaseWarning')!;
    const isFirebase = this.selectedServerMode === 'firebase';

    if (isFirebase && !this.delegate.isFirebaseConfigured()) {
      firebaseWarning.style.display = 'block';
    } else {
      firebaseWarning.style.display = 'none';
    }

    try {
      const partidas = await this.delegate.getGameList(this.selectedServerMode);
      this.renderGameList(partidas);
    } catch {
      listaContainer.innerHTML = '<p class="game-list-empty">Error al cargar partidas.</p>';
    }
  }

  toggleServerMode(modo: 'firebase' | 'http'): void {
    this.selectedServerMode = modo;
    this.delegate.onSwitchServerMode(modo);
    this.updateServerModeButtons();
    if (this.currentView === 'browser') {
      this.loadGameList();
    }
  }

  generateRandomName(): void {
    const randomName = FANTASY_NAMES[Math.floor(Math.random() * FANTASY_NAMES.length)];
    (document.getElementById('charNameInput') as HTMLInputElement).value = randomName;
  }

  recalculateStats(): void {
    const selectedClass = document.querySelector('.class-btn.selected')?.getAttribute('data-class')
      || this.delegate.getCharacterData().clase;
    this.delegate.onRerollStats(selectedClass);
    this.populateStatsDisplay();
  }

  showQRManual(title: string, data: string): void {
    if (!data) { alert("No hay datos para generar QR"); return; }
    const qrImage = document.getElementById('modalQRImage') as HTMLImageElement;
    qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data)}`;
    document.getElementById('modalQRTitle')!.textContent = title;
    this.showElement('qrModal', 'flex');
  }

  closeQRModal(): void {
    this.hideElement('qrModal');
  }

  scanQRManual(targetId: string): void {
    const data = prompt("Pega aquí el contenido del código QR:");
    if (data) (document.getElementById(targetId) as HTMLTextAreaElement).value = data;
  }

  get manualOfferOut(): string {
    return (document.getElementById('manualOfferOut') as HTMLTextAreaElement).value;
  }
  set manualOfferOut(value: string) {
    (document.getElementById('manualOfferOut') as HTMLTextAreaElement).value = value;
  }
  get manualAnswerIn(): string {
    return (document.getElementById('manualAnswerIn') as HTMLTextAreaElement).value;
  }
  get manualOfferIn(): string {
    return (document.getElementById('manualOfferIn') as HTMLTextAreaElement).value;
  }
  get manualAnswerOut(): string {
    return (document.getElementById('manualAnswerOut') as HTMLTextAreaElement).value;
  }
  set manualAnswerOut(value: string) {
    (document.getElementById('manualAnswerOut') as HTMLTextAreaElement).value = value;
  }

  private fillCharacterPreview(char: CharacterData): void {
    document.getElementById('previewName')!.textContent = char.nombre;
    const colorDiv = document.getElementById('previewColor')!;
    colorDiv.style.backgroundColor = char.color;
    colorDiv.style.color = char.color;
    document.getElementById('previewClassIcon')!.textContent = CLASS_ICONS[char.clase] || '\u{1F464}';
    document.getElementById('previewClassName')!.textContent = CLASS_NAMES[char.clase] || 'AVENTURERO';
    const previewPortrait = document.getElementById('previewPortrait');
    if (previewPortrait) previewPortrait.dataset.clase = char.clase;
    document.getElementById('previewFue')!.textContent = char.fuerza.toString();
    document.getElementById('previewAgi')!.textContent = char.agilidad.toString();
    document.getElementById('previewInt')!.textContent = char.inteligencia.toString();
  }

  private populateStatsDisplay(): void {
    const char = this.delegate.getCharacterData();
    document.getElementById('charFue')!.textContent = char.fuerza.toString();
    document.getElementById('charAgi')!.textContent = char.agilidad.toString();
    document.getElementById('charInt')!.textContent = char.inteligencia.toString();
  }

  private selectClassButton(clase: string): void {
    document.querySelectorAll('.class-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.getAttribute('data-class') === clase);
    });
    const modalPortrait = document.getElementById('modalPortrait');
    if (modalPortrait) modalPortrait.dataset.clase = clase;
  }

  private updateServerModeButtons(): void {
    const btnFirebase = document.getElementById('btnServidorFirebase');
    const btnHttp = document.getElementById('btnServidorHttp');
    const info = document.getElementById('serverModeInfo');
    if (!btnFirebase || !btnHttp || !info) return;
    const isFirebase = this.selectedServerMode === 'firebase';
    btnFirebase.classList.toggle('active', isFirebase);
    btnHttp.classList.toggle('active', !isFirebase);
    info.textContent = isFirebase ? 'Modo: Firebase' : `Modo: Servidor Local (${this.delegate.getSignalingUrlLabel()})`;
  }

  private renderGameList(partidas: any[]): void {
    const listaContainer = document.getElementById('listaPartidas')!;
    listaContainer.innerHTML = "";
    if (partidas.length === 0) {
      listaContainer.innerHTML = `<p class="game-list-empty">No hay partidas disponibles (modo ${this.selectedServerMode}).</p>`;
      return;
    }
    partidas.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'game-list-item';
      item.innerHTML = `
        <div class="game-list-info">
          <strong class="game-list-name">${p.nombre || p.id}</strong>
          <span class="game-list-meta">Host: ${p.hostNick} | Jugadores: ${p.numJugadores}</span>
        </div>
        <button class="join-btn" data-id="${p.id}">UNIRSE</button>
      `;
      listaContainer.appendChild(item);
    });

    listaContainer.querySelectorAll('.join-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id')!;
        this.delegate.onJoinGame(id, this.selectedServerMode);
      });
    });
  }

  private hideAllLobbyViews(): void {
    this.hideElement('lobbyInitial');
    this.hideElement('lobbyManual');
    this.hideElement('lobbyFirebase');
  }

  private hideCanvas(): void {
    const canvas = document.getElementById('mazeCanvas');
    if (canvas) canvas.style.display = 'none';
    const topMenu = document.getElementById('topMenu');
    if (topMenu) topMenu.style.display = 'none';
    const actionsMenu = document.getElementById('actionsMenu');
    if (actionsMenu) actionsMenu.style.display = 'none';
  }

  private showElement(id: string, display: string = 'block', condition: boolean = true): void {
    const el = document.getElementById(id);
    if (el && condition) el.style.display = display;
  }

  private hideElement(id: string): void {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  private setupEventListeners(): void {
    document.getElementById('btnOpenCharacterModal')?.addEventListener('click', () => this.openCharacterModal());
    document.getElementById('btnEditCharacter')?.addEventListener('click', () => this.openCharacterModal());
    document.getElementById('btnRandomName')?.addEventListener('click', () => this.generateRandomName());
    document.getElementById('btnCharReroll')?.addEventListener('click', () => this.recalculateStats());
    document.getElementById('btnSaveCharacter')?.addEventListener('click', () => this.saveCharacter());
    document.getElementById('btnReanudar')?.addEventListener('click', () => this.delegate.onResumeSession());

    document.getElementById('btnSolo')?.addEventListener('click', () => {
      this.showDifficultyModal((diff) => this.delegate.onStartSolo(diff));
    });
    document.getElementById('btnCrearPartida')?.addEventListener('click', () => {
      this.showDifficultyModal((diff) => this.delegate.onHostGame(this.selectedServerMode, diff));
    });
    document.getElementById('btnGenOferta')?.addEventListener('click', () => {
      this.showDifficultyModal((diff) => this.delegate.onHostGame('manual', diff));
    });

    document.getElementById('btnUnirseLobby')?.addEventListener('click', () => this.showGameBrowser());
    document.getElementById('btnLobbyManual')?.addEventListener('click', () => this.showManualMode());
    document.getElementById('btnVolverLobbyFirebase')?.addEventListener('click', () => this.showInitialView());
    document.getElementById('btnVolverLobbyManual')?.addEventListener('click', () => this.showInitialView());

    document.getElementById('btnServidorFirebase')?.addEventListener('click', () => this.toggleServerMode('firebase'));
    document.getElementById('btnServidorHttp')?.addEventListener('click', () => this.toggleServerMode('http'));

    document.getElementById('btnRefrescar')?.addEventListener('click', () => this.loadGameList());

    document.getElementById('btnBackFromDiff')?.addEventListener('click', () => this.closeDifficultyModal());

    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const diff = (e.currentTarget as HTMLElement).getAttribute('data-diff')!;
        this.selectDifficulty(diff);
      });
    });

    document.querySelectorAll('.class-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('selected'));
        (e.currentTarget as HTMLElement).classList.add('selected');
        this.recalculateStats();
      });
    });

    document.getElementById('btnShowOfferQR')?.addEventListener('click', () => {
      this.showQRManual('OFERTA', this.manualOfferOut);
    });
    document.getElementById('btnShowAnswerQR')?.addEventListener('click', () => {
      this.showQRManual('RESPUESTA', this.manualAnswerOut);
    });
    document.getElementById('btnCloseQRModal')?.addEventListener('click', () => this.closeQRModal());
    document.getElementById('btnScanQROffer')?.addEventListener('click', () => this.scanQRManual('manualOfferIn'));
    document.getElementById('btnScanQRAnswer')?.addEventListener('click', () => this.scanQRManual('manualAnswerIn'));
  }
}
