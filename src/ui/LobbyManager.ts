export type LobbyMode = 'solo' | 'firebase' | 'http' | 'cooperativo';

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
  onSelectMode(modo: LobbyMode): void;
  onCancelConnect(): void;
  getCharacterData(): CharacterData;
  hasSavedSession(): boolean;
  getGameList(modo: 'firebase' | 'http'): Promise<any[]>;
  getSignalingUrlLabel(): string;
  isFirebaseConfigured(): boolean;
  /** ¿Hay una casa guardada que decide reutilizar o descartar antes de arrancar? */
  hayHousingPrevio(): boolean;
  /** Registra la decisión del usuario sobre el housing encontrado. */
  resolverHousingPrevio(usar: boolean): void;
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
  private selectedMode: LobbyMode = 'firebase';
  private pendingDificultadCallback: ((dif: string) => void) | null = null;
  private pendingHousingStart: ((dif: string) => void) | null = null;
  private pendingHousingDiff: string | null = null;

  constructor(delegate: LobbyDelegate) {
    this.delegate = delegate;
    this.setupEventListeners();
    this.showModo();
  }

  setDelegate(delegate: LobbyDelegate): void {
    this.delegate = delegate;
  }

  getSelectedServerMode(): 'firebase' | 'http' {
    return this.selectedMode === 'http' ? 'http' : 'firebase';
  }

  selectMode(modo: LobbyMode): void {
    this.selectedMode = modo;
    this.delegate.onSelectMode(modo);
    this.showPersonaje();
  }

  updateView(): void {
    const char = this.delegate.getCharacterData();
    const hasChar = char.personajeCreado || char.nombre !== "Jugador";

    if (hasChar) {
      this.showElement('characterPreview');
      this.hideElement('charCreationSection');
      this.fillCharacterPreview(char);
      const btnContinuar = document.getElementById('btnContinuarPersonaje');
      if (btnContinuar) {
        btnContinuar.style.display = 'block';
        btnContinuar.textContent = `CONTINUAR CON ${char.nombre.toUpperCase()}`;
      }
    } else {
      this.hideElement('characterPreview');
      this.showElement('charCreationSection');
      this.hideElement('btnContinuarPersonaje');
    }
  }

  showModo(): void {
    this.hideAllLobbyViews();
    this.showElement('lobby', 'flex');
    this.showElement('lobbyInitial', 'block');
    this.showElement('lobbyModo', 'flex');
    this.hideCanvas();
    this.showElement('btnReanudar', 'block', this.delegate.hasSavedSession());
  }

  showPersonaje(): void {
    this.hideAllLobbyViews();
    this.showElement('lobby', 'flex');
    this.showElement('lobbyInitial', 'block');
    this.showElement('lobbyPersonaje', 'flex');
    this.hideCanvas();
    this.updateView();
  }

  showAccion(): void {
    this.hideAllLobbyViews();
    this.showElement('lobby', 'flex');
    this.showElement('lobbyInitial', 'block');
    this.showElement('lobbyAccion', 'flex');
    this.hideCanvas();
    const online = this.selectedMode === 'firebase' || this.selectedMode === 'http';
    this.showElement('accionSolo', 'flex', this.selectedMode === 'solo');
    this.showElement('accionOnline', 'flex', online);
    this.showElement('accionCoop', 'flex', this.selectedMode === 'cooperativo');
    this.applyFirebaseGate();
  }

  private applyFirebaseGate(): void {
    const firebaseOk = this.selectedMode !== 'firebase' || this.delegate.isFirebaseConfigured();
    const btnCrear = document.getElementById('btnCrearPartida') as HTMLButtonElement | null;
    const btnUnirse = document.getElementById('btnUnirseLobby') as HTMLButtonElement | null;
    const warn = document.getElementById('firebaseAccionWarning');
    if (btnCrear) {
      btnCrear.disabled = !firebaseOk;
      btnCrear.title = firebaseOk ? '' : 'Firebase sin configurar: usa UN JUGADOR o COOPERATIVO';
    }
    if (btnUnirse) {
      btnUnirse.disabled = !firebaseOk;
      btnUnirse.title = firebaseOk ? '' : 'Firebase sin configurar: usa UN JUGADOR o COOPERATIVO';
    }
    if (warn) warn.style.display = this.selectedMode === 'firebase' && !firebaseOk ? 'block' : 'none';
  }

  showInitialView(): void {
    this.showModo();
  }

  showManualMode(): void {
    this.hideElement('lobbyInitial');
    this.showElement('lobbyManual', 'flex');
  }

  showGameBrowser(): void {
    this.hideElement('lobbyInitial');
    this.showElement('lobbyFirebase', 'flex');
    this.loadGameList();
  }

  showConnecting(message: string): void {
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
    const buttons = document.querySelectorAll('#lobby button:not(.connecting-cancel)');
    buttons.forEach(b => ((b as HTMLButtonElement).disabled = true));
  }

  hideConnecting(): void {
    const overlay = document.getElementById('connectingOverlay');
    if (overlay) overlay.style.display = 'none';
    const buttons = document.querySelectorAll('#lobby button:not(.connecting-cancel)');
    buttons.forEach(b => ((b as HTMLButtonElement).disabled = false));
    this.applyFirebaseGate();
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
    this.showAccion();
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
    if (!cb) return;
    if (this.delegate.hayHousingPrevio()) {
      // Encadena el aviso de housing encontrado antes de arrancar la partida.
      this.pendingHousingStart = cb;
      this.pendingHousingDiff = difficulty;
      this.showElement('housingModal', 'flex');
      return;
    }
    cb(difficulty);
  }

  selectHousing(usar: boolean): void {
    this.hideElement('housingModal');
    this.delegate.resolverHousingPrevio(usar);
    const start = this.pendingHousingStart;
    const diff = this.pendingHousingDiff;
    this.pendingHousingStart = null;
    this.pendingHousingDiff = null;
    if (start && diff !== null) start(diff);
  }

  async loadGameList(): Promise<void> {
    const listaContainer = document.getElementById('listaPartidas')!;
    listaContainer.innerHTML = '<p class="game-list-loading">Buscando partidas...</p>';
    const firebaseWarning = document.getElementById('firebaseWarning')!;
    const serverMode = this.getSelectedServerMode();
    const isFirebase = serverMode === 'firebase';

    if (isFirebase && !this.delegate.isFirebaseConfigured()) {
      firebaseWarning.style.display = 'block';
    } else {
      firebaseWarning.style.display = 'none';
    }

    try {
      const partidas = await this.delegate.getGameList(serverMode);
      this.renderGameList(partidas);
    } catch {
      listaContainer.innerHTML = '<p class="game-list-empty">Error al cargar partidas.</p>';
    }
  }

  async joinByCode(): Promise<void> {
    const input = document.getElementById('joinCodeInput') as HTMLInputElement;
    const err = document.getElementById('joinCodeError')!;
    const codigo = input.value.trim().toLowerCase();
    if (!codigo) {
      err.textContent = 'Escribe un código.';
      err.style.display = 'block';
      return;
    }
    const modo = this.getSelectedServerMode();
    try {
      const partidas = await this.delegate.getGameList(modo);
      const match = partidas.find((p) => ((p.id || '') as string).toLowerCase() === codigo);
      if (!match) {
        err.textContent = 'No se encontró la partida, pulsa REFRESCAR.';
        err.style.display = 'block';
        return;
      }
      err.style.display = 'none';
      this.delegate.onJoinGame(match.id, modo);
    } catch {
      err.textContent = 'Error al buscar la partida.';
      err.style.display = 'block';
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

  private renderGameList(partidas: any[]): void {
    const listaContainer = document.getElementById('listaPartidas')!;
    listaContainer.innerHTML = "";
    if (partidas.length === 0) {
      listaContainer.innerHTML = `<p class="game-list-empty">No hay partidas disponibles (modo ${this.getSelectedServerMode()}).</p>`;
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
        this.delegate.onJoinGame(id, this.getSelectedServerMode());
      });
    });
  }

  private hideAllLobbyViews(): void {
    this.hideElement('lobbyModo');
    this.hideElement('lobbyPersonaje');
    this.hideElement('lobbyAccion');
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
    if (!el) return;
    el.style.display = condition ? display : 'none';
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
      this.showDifficultyModal((diff) => this.delegate.onHostGame(this.getSelectedServerMode(), diff));
    });
    document.getElementById('btnGenOferta')?.addEventListener('click', () => {
      this.showDifficultyModal((diff) => this.delegate.onHostGame('manual', diff));
    });
    document.getElementById('btnCoopHost')?.addEventListener('click', () => {
      this.showDifficultyModal((diff) => {
        this.delegate.onHostGame('manual', diff);
        this.showManualMode();
      });
    });
    document.getElementById('btnCoopGuest')?.addEventListener('click', () => this.showManualMode());

    document.querySelectorAll('.modo-card').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modo = (e.currentTarget as HTMLElement).getAttribute('data-mode') as LobbyMode;
        this.selectMode(modo);
      });
    });
    document.getElementById('btnContinuarPersonaje')?.addEventListener('click', () => this.showAccion());
    document.getElementById('btnVolverModo')?.addEventListener('click', () => this.showModo());
    document.getElementById('btnVolverPersonaje')?.addEventListener('click', () => this.showPersonaje());

    document.getElementById('btnUnirseLobby')?.addEventListener('click', () => this.showGameBrowser());
    document.getElementById('btnVolverLobbyFirebase')?.addEventListener('click', () => this.showAccion());
    document.getElementById('btnVolverLobbyManual')?.addEventListener('click', () => this.showAccion());

    document.getElementById('btnJoinByCode')?.addEventListener('click', () => this.joinByCode());

    document.getElementById('btnRefrescar')?.addEventListener('click', () => this.loadGameList());

    document.getElementById('btnBackFromDiff')?.addEventListener('click', () => this.closeDifficultyModal());

    document.getElementById('btnHousingUsar')?.addEventListener('click', () => this.selectHousing(true));
    document.getElementById('btnHousingNueva')?.addEventListener('click', () => this.selectHousing(false));

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
