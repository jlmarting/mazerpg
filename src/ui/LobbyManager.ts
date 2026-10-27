import { dividirEnPartes } from '../core/qrPartes';
export type LobbyMode = 'solo' | 'firebase' | 'http' | 'cooperativo';

import type { AparienciaAvatar, ZonaAvatar, RanuraPieza } from '../core/avatarTintes';
import { PALETAS, ORIGEN_ZONA, APARIENCIA_DEFECTO } from '../config/apariencia';
import { TABLA_PIEZAS, RANURAS } from '../core/avatarTintes';
import { aparienciaEfectiva, conservarCoincidencias, sanearPiezas } from '../core/avatarTintes';
import { ITEMS } from '../config/items';
import { RANURAS_EQUIPO, destinoValido, type RanuraEquipo } from '../core/equipo';

export interface CharacterData {
  nombre: string;
  color: string;
  clase: string;
  fuerza: number;
  agilidad: number;
  inteligencia: number;
  personajeCreado: boolean;
  apariencia: AparienciaAvatar;
}

export interface LobbyDelegate {
  onSaveCharacter(nombre: string, color: string, clase: string, apariencia: AparienciaAvatar): void;
  pintarPreviewAvatar(canvas: HTMLCanvasElement, clase: string, apariencia: AparienciaAvatar): void;
  onRerollStats(clase: string): void;
  onStartSolo(dificultad: string): void;
  onHostGame(modo: 'firebase' | 'http' | 'manual', dificultad: string): void;
  onNewManualOffer(): void;
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
  /** Estado de equipo/inventario para el panel (piloto). */
  getEstadoEquipo(): EstadoEquipo;
  equiparItem(id: string): void;
  desequiparRanura(ranura: RanuraEquipo): void;
  usarItem(id: string): void;
  /** Cierra la mochila y abre el mapamundi. */
  abrirMapaDesdeMochila(): void;
}

/** Vista del dominio de equipo que consume el panel. */
export interface EstadoEquipo {
  equipo: Record<RanuraEquipo, string | null>;
  inventario: Record<string, number>;
  /** Equipo en el bulto (disponible para arrastrar a una ranura). */
  disponibles: string[];
  base: { fuerza: number; agilidad: number; inteligencia: number };
  total: { fuerza: number; agilidad: number; inteligencia: number; vida: number };
  peso: number;
  capacidad: number;
  sobrecarga: { ataque: number; defensa: number; movimiento: number };
  clase: string;
  apariencia: AparienciaAvatar;
}

const CLASS_ICONS: Record<string, string> = { guerrero: '\u{1FA96}', explorador: '\u{1F3F9}', mago: '\u{1FA84}' };
const CLASS_NAMES: Record<string, string> = { guerrero: 'GUERRERO', explorador: 'EXPLORADOR', mago: 'MAGO' };
const ETIQUETA_RANURA: Record<RanuraEquipo, string> = {
  cabeza: 'Cabeza', torso: 'Torso', piernas: 'Piernas',
  mano_derecha: 'Mano der.', mano_izquierda: 'Mano izq.', escudo: 'Escudo', accesorio: 'Accesorio',
};
/** Áreas del grid del muñeco (CSS grid-template-areas). */
const AREA_RANURA: Record<RanuraEquipo, string> = {
  cabeza: 'cabeza', torso: 'torso', piernas: 'piernas',
  mano_derecha: 'der', mano_izquierda: 'izq', escudo: 'escudo', accesorio: 'accesorio',
};
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
  /** Tintes elegidos en el modal (se confirman en saveCharacter). */
  private avatarZonas: Record<ZonaAvatar, string> = { ...APARIENCIA_DEFECTO.guerrero.zonas };
  /** Género elegido en el modal (se confirma en saveCharacter). */
  private avatarGenero: 'm' | 'f' = 'm';
  /** Piezas elegidas en el modal (se confirman en saveCharacter). */
  private avatarPiezas: Record<RanuraPieza, string | null> = { pelo: null, torso: null, piernas: null, casco: null };
  /** QR manual en 3 partes (el base64 es demasiado denso para un solo QR). */
  private qrPartes: string[] = [];
  private qrIndice = 0;
  private qrTitulo = '';

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

  showManualMode(rol: 'host' | 'guest' = 'host'): void {
    const lobby = document.getElementById('lobby');
    if (lobby) lobby.style.display = 'flex';
    this.hideElement('lobbyInitial');
    this.showElement('lobbyManual', 'flex');
    // Solo la sección del rol: el host no necesita las casillas del invitado
    // (ni al revés); reduce la saturación del panel.
    const hostSection = document.getElementById('manualHostSection');
    const guestSection = document.getElementById('manualGuestSection');
    if (hostSection) hostSection.style.display = rol === 'host' ? '' : 'none';
    if (guestSection) guestSection.style.display = rol === 'guest' ? '' : 'none';
  }

  /** Cierra el panel manual del host y vuelve a la partida que corre detrás. */
  cerrarPanelManual(): void {
    const lobby = document.getElementById('lobby');
    if (lobby) lobby.style.display = 'none';
    const canvas = document.getElementById('mazeCanvas');
    if (canvas) canvas.style.display = 'block';
    const topMenu = document.getElementById('topMenu');
    if (topMenu) topMenu.style.display = 'block';
    const actionsMenu = document.getElementById('actionsMenu');
    if (actionsMenu) actionsMenu.style.display = 'block';
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
    const ef = aparienciaEfectiva(char.clase, char.apariencia);
    this.avatarZonas = { ...ef.zonas };
    this.avatarGenero = ef.genero;
    this.avatarPiezas = { ...ef.piezas };
    this.selectGenderButton(ef.genero);
    this.renderAvatarRows();
    this.renderPiezaRows();
    this.recalculateStats();
    this.populateStatsDisplay();
  }

  closeCharacterModal(): void {
    this.hideElement('characterModal');
  }

  // --- Panel de equipo y mochila (piloto inventario v1) ---

  openEquipoModal(): void {
    this.showElement('equipoModal', 'flex');
    this.renderEquipo();
  }

  closeEquipoModal(): void {
    this.hideElement('equipoModal');
  }

  /** Item que se está arrastrando y su ranura de origen (para el drag&drop). */
  private arrastrando: string | null = null;
  private slotArrastrado: RanuraEquipo | null = null;

  /** Repinta el panel (muñeco + bulto) desde el estado real del protagonista. */
  renderEquipo(): void {
    const st = this.delegate.getEstadoEquipo();
    const doll = document.getElementById('equipoRanuras');
    const pack = document.getElementById('equipoPack');
    const objetos = document.getElementById('equipoMochila');
    const stats = document.getElementById('equipoStats');
    if (!doll || !pack || !objetos || !stats) return;

    const bono = (t: number, base: number) => (t > base ? ` (${base}→${t})` : '');
    stats.textContent =
      `FUE ${st.total.fuerza}${bono(st.total.fuerza, st.base.fuerza)} · ` +
      `AGI ${st.total.agilidad}${bono(st.total.agilidad, st.base.agilidad)} · ` +
      `INT ${st.total.inteligencia}${bono(st.total.inteligencia, st.base.inteligencia)}` +
      (st.total.vida > 0 ? ` · VIDA +${st.total.vida}` : '') +
      ` · PESO ${st.peso.toFixed(1)}/${st.capacidad}kg` +
      (st.sobrecarga.movimiento > 0 || st.sobrecarga.ataque > 0
        ? ` ⚠ SOBRECARGA (−${st.sobrecarga.ataque} ataque · +${st.sobrecarga.defensa} daño · ×${(1 + st.sobrecarga.movimiento).toFixed(2)} paso)`
        : '');

    // --- Muñeco: ranuras (destino de las piezas) ---
    doll.innerHTML = '';
    for (const ranura of RANURAS_EQUIPO) {
      const cell = document.createElement('div');
      cell.className = 'equipo-slot';
      cell.dataset.ranura = ranura;
      cell.style.gridArea = AREA_RANURA[ranura];
      const nom = document.createElement('span');
      nom.className = 'equipo-slot-nombre';
      nom.textContent = ETIQUETA_RANURA[ranura];
      cell.appendChild(nom);

      const puesto = st.equipo[ranura];
      if (puesto) {
        cell.classList.add('lleno');
        const it = document.createElement('span');
        it.className = 'equipo-slot-item';
        it.textContent = ITEMS[puesto]?.nombre ?? puesto;
        cell.appendChild(it);
        cell.draggable = true;
        cell.addEventListener('dragstart', (e) => {
          this.arrastrando = puesto;
          this.slotArrastrado = ranura;
          (e as DragEvent).dataTransfer?.setData('text/plain', puesto);
          if ((e as DragEvent).dataTransfer) (e as DragEvent).dataTransfer!.effectAllowed = 'move';
        });
        cell.addEventListener('dragend', () => this.limpiarArrastre());
        cell.addEventListener('click', () => { this.delegate.desequiparRanura(ranura); this.renderEquipo(); });
      } else {
        cell.classList.add('vacio');
      }

      cell.addEventListener('dragover', (e) => {
        if (!this.arrastrando) return;
        e.preventDefault();
        const ok = destinoValido(this.arrastrando, ranura);
        cell.classList.toggle('drag-over', ok);
        cell.classList.toggle('drag-invalid', !ok);
        if ((e as DragEvent).dataTransfer) (e as DragEvent).dataTransfer!.dropEffect = ok ? 'move' : 'none';
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('drag-over', 'drag-invalid'));
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('drag-over', 'drag-invalid');
        const id = this.arrastrando || (e as DragEvent).dataTransfer?.getData('text/plain') || '';
        if (id && destinoValido(id, ranura)) {
          this.delegate.equiparItem(id);
          this.renderEquipo();
        }
        this.limpiarArrastre();
      });
      doll.appendChild(cell);
    }

    // --- Bulto: equipo suelto (origen de las piezas) ---
    pack.innerHTML = '';
    pack.classList.remove('drag-over');
    for (const id of st.disponibles) {
      const it = ITEMS[id];
      if (!it) continue;
      const chip = document.createElement('div');
      chip.className = 'equipo-chip';
      chip.textContent = `${it.nombre}${it.manos === 2 ? ' (2 manos)' : ''}`;
      chip.title = it.bonos ? Object.entries(it.bonos).map(([k, v]) => `${k}+${v}`).join(' ') : '';
      chip.draggable = true;
      chip.addEventListener('dragstart', (e) => {
        this.arrastrando = id;
        this.slotArrastrado = null;
        (e as DragEvent).dataTransfer?.setData('text/plain', id);
        if ((e as DragEvent).dataTransfer) (e as DragEvent).dataTransfer!.effectAllowed = 'move';
      });
      chip.addEventListener('dragend', () => this.limpiarArrastre());
      chip.addEventListener('click', () => { this.delegate.equiparItem(id); this.renderEquipo(); });
      pack.appendChild(chip);
    }
    if (st.disponibles.length === 0) {
      const v = document.createElement('span');
      v.style.cssText = 'font-family:monospace;font-size:9px;color:#6b5320;';
      v.textContent = '(sin equipo suelto)';
      pack.appendChild(v);
    }

    // --- Objetos (consumibles/materiales) ---
    objetos.innerHTML = '';
    const entradas = Object.entries(st.inventario);
    if (entradas.length === 0) {
      const vacio = document.createElement('div');
      vacio.className = 'equipo-mochila-row';
      vacio.textContent = '(vacía)';
      objetos.appendChild(vacio);
    }
    for (const [id, n] of entradas) {
      const it = ITEMS[id];
      if (!it) continue;
      const fila = document.createElement('div');
      fila.className = 'equipo-objeto-card';
      const txt = document.createElement('span');
      txt.className = 'equipo-objeto-nombre';
      txt.textContent = `${it.nombre} ×${n}`;
      const peso = document.createElement('span');
      peso.className = 'equipo-objeto-peso';
      peso.textContent = `${(it.peso * n).toFixed(1)} kg`;
      fila.appendChild(txt);
      fila.appendChild(peso);
      if (it.accion === 'abrir_mapa') {
        const btn = document.createElement('button');
        btn.className = 'equipo-mochila-btn';
        btn.textContent = 'VER MAPA';
        btn.addEventListener('click', () => this.delegate.abrirMapaDesdeMochila());
        fila.appendChild(btn);
      } else if (it.tipo === 'consumible') {
        const btn = document.createElement('button');
        btn.className = 'equipo-mochila-btn';
        btn.textContent = 'CONSUMIR';
        btn.addEventListener('click', () => { this.delegate.usarItem(id); this.renderEquipo(); });
        fila.appendChild(btn);
      }
      objetos.appendChild(fila);
    }

    const canvas = document.getElementById('equipoPreview') as HTMLCanvasElement | null;
    if (canvas) this.delegate.pintarPreviewAvatar(canvas, st.clase, st.apariencia);
  }

  /** Limpia el estado de arrastre y los resaltados de drop. */
  private limpiarArrastre(): void {
    this.arrastrando = null;
    this.slotArrastrado = null;
    document.querySelectorAll('.equipo-slot.drag-over, .equipo-slot.drag-invalid, .equipo-pack-grid.drag-over')
      .forEach((el) => el.classList.remove('drag-over', 'drag-invalid'));
  }

  saveCharacter(): void {
    const name = (document.getElementById('charNameInput') as HTMLInputElement).value.trim() || "Héroe";
    const color = (document.getElementById('charColorInput') as HTMLInputElement).value;
    const selectedClass = document.querySelector('.class-btn[data-class].selected')?.getAttribute('data-class') || 'guerrero';
    const apariencia: AparienciaAvatar = { formato: 1, zonas: { ...this.avatarZonas }, genero: this.avatarGenero, piezas: { ...this.avatarPiezas } };
    this.delegate.onSaveCharacter(name, color, selectedClass, apariencia);
    this.closeCharacterModal();
    this.showAccion();
  }

  /** Clase seleccionada ahora mismo en el modal (para tintes y preview). */
  private claseActualModal(): string {
    return document.querySelector('.class-btn[data-class].selected')?.getAttribute('data-class')
      || this.delegate.getCharacterData().clase;
  }

  /** Zonas con tonos mapeados para la clase (piel sin mapear no se muestra en v1). */
  private zonasMapeadas(clase: string): ZonaAvatar[] {
    const origen = ORIGEN_ZONA[clase] ?? ORIGEN_ZONA.guerrero;
    return (['piel', 'pelo', 'torso', 'piernas'] as ZonaAvatar[]).filter((z) => (origen[z] ?? []).length > 0);
  }

  /** Dibuja las filas de swatches y repinta la preview. */
  private renderAvatarRows(): void {
    const cont = document.getElementById('avatarZonas');
    if (!cont) return;
    const clase = this.claseActualModal();
    cont.innerHTML = '';
    const nombres: Record<ZonaAvatar, string> = { piel: 'Piel', pelo: 'Pelo', torso: 'Torso', piernas: 'Piernas' };
    for (const zona of this.zonasMapeadas(clase)) {
      const fila = document.createElement('div');
      fila.className = 'avatar-zona-row';
      const etiqueta = document.createElement('span');
      etiqueta.className = 'avatar-zona-nombre';
      etiqueta.textContent = nombres[zona];
      fila.appendChild(etiqueta);
      for (const hex of PALETAS[zona]) {
        const sw = document.createElement('button');
        sw.className = 'avatar-swatch' + (this.avatarZonas[zona] === hex ? ' selected' : '');
        sw.style.backgroundColor = hex;
        sw.setAttribute('aria-label', `${nombres[zona]} ${hex}`);
        sw.addEventListener('click', () => {
          this.avatarZonas[zona] = hex;
          this.renderAvatarRows();
        });
        fila.appendChild(sw);
      }
      cont.appendChild(fila);
    }
    this.repaintPreview();
  }

  /** La preview muestra el sprite tineado real: lo que ves es lo que viaja. */
  private repaintPreview(): void {
    const canvas = document.getElementById('avatarPreview') as HTMLCanvasElement | null;
    if (!canvas) return;
    this.delegate.pintarPreviewAvatar(canvas, this.claseActualModal(), { formato: 1, zonas: { ...this.avatarZonas }, genero: this.avatarGenero, piezas: { ...this.avatarPiezas } });
  }

  /** Cambio de clase: lo no personalizado sigue al defecto nuevo; el resto se conserva. */
  private rebaseAvatarAClase(prevClase: string, nuevaClase: string): void {
    const prevDef = APARIENCIA_DEFECTO[prevClase] ?? APARIENCIA_DEFECTO.guerrero;
    const nextDef = APARIENCIA_DEFECTO[nuevaClase] ?? APARIENCIA_DEFECTO.guerrero;
    const actual: AparienciaAvatar = { formato: 1, zonas: { ...this.avatarZonas }, genero: this.avatarGenero, piezas: { ...this.avatarPiezas } };
    this.avatarZonas = { ...conservarCoincidencias(prevDef, nextDef, actual).zonas };
    this.renderAvatarRows();
    this.renderPiezaRows();
  }

  private selectGenderButton(genero: 'm' | 'f'): void {
    document.querySelectorAll('.genero-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.getAttribute('data-genero') === genero);
    });
  }

  private onSelectGenero(genero: 'm' | 'f'): void {
    this.avatarGenero = genero;
    this.selectGenderButton(genero);
    // Las piezas incompatibles con el género caen (saneado).
    this.avatarPiezas = sanearPiezas({ ...this.avatarPiezas }, TABLA_PIEZAS, genero);
    this.renderAvatarRows();
    this.renderPiezaRows();
  }

  /** Nombres de variante por ranura para el género actual (v1: una por ranura). */
  private variantesDisponibles(): { ranura: RanuraPieza; variante: string; nombre: string }[] {
    const nombres: Record<string, string> = {
      'pelo-largo': 'Melena', 'peto': 'Peto', 'botas': 'Botas', 'casco': 'Casco',
    };
    const out: { ranura: RanuraPieza; variante: string; nombre: string }[] = [];
    for (const ranura of RANURAS) {
      const id = Object.keys(TABLA_PIEZAS.variantes).find(
        (k) => TABLA_PIEZAS.variantes[k].ranura === ranura && TABLA_PIEZAS.variantes[k].generos.includes(this.avatarGenero));
      if (id) out.push({ ranura, variante: id, nombre: nombres[id] || id });
    }
    return out;
  }

  private renderPiezaRows(): void {
    const cont = document.getElementById('avatarPiezas');
    if (!cont) return;
    cont.innerHTML = '';
    for (const { ranura, variante, nombre } of this.variantesDisponibles()) {
      const btn = document.createElement('button');
      const activa = this.avatarPiezas[ranura] === variante;
      btn.className = 'pieza-toggle' + (activa ? ' selected' : '');
      btn.textContent = `${activa ? '[x]' : '[ ]'} ${nombre}`;
      btn.addEventListener('click', () => {
        this.avatarPiezas[ranura] = this.avatarPiezas[ranura] === variante ? null : variante;
        this.renderPiezaRows();
        this.repaintPreview();
      });
      cont.appendChild(btn);
    }
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
    const selectedClass = document.querySelector('.class-btn[data-class].selected')?.getAttribute('data-class')
      || this.delegate.getCharacterData().clase;
    this.delegate.onRerollStats(selectedClass);
    this.populateStatsDisplay();
  }

  /**
   * Muestra la información en 3 QR secuenciales. El base64 del SDP es
   * demasiado denso para un solo QR legible; cada parte lleva cabecera
   * `MZ3/i/n|` para reensamblarla en el otro lado.
   */
  showQRManual(title: string, data: string): void {
    if (!data) { alert("No hay datos para generar QR"); return; }
    this.qrTitulo = title;
    this.qrPartes = dividirEnPartes(data);
    this.qrIndice = 0;
    this.actualizarQR();
    this.showElement('qrModal', 'flex');
  }

  private actualizarQR(): void {
    const total = this.qrPartes.length;
    if (total === 0) return;
    const parte = this.qrPartes[this.qrIndice] ?? '';
    const qrImage = document.getElementById('modalQRImage') as HTMLImageElement | null;
    if (qrImage) {
      qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&ecc=L&data=${encodeURIComponent(parte)}`;
    }
    const title = document.getElementById('modalQRTitle');
    if (title) title.textContent = this.qrTitulo;
    const label = document.getElementById('modalQRPart');
    if (label) label.textContent = `PARTE ${this.qrIndice + 1}/${total} · escanea esta y pulsa SIGUIENTE`;
    const prev = document.getElementById('btnQRPrev') as HTMLButtonElement | null;
    const next = document.getElementById('btnQRNext') as HTMLButtonElement | null;
    if (prev) prev.disabled = this.qrIndice === 0;
    if (next) next.disabled = this.qrIndice >= total - 1;
  }

  private qrSiguiente(): void {
    if (this.qrIndice < this.qrPartes.length - 1) {
      this.qrIndice++;
      this.actualizarQR();
    }
  }

  private qrAnterior(): void {
    if (this.qrIndice > 0) {
      this.qrIndice--;
      this.actualizarQR();
    }
  }

  closeQRModal(): void {
    this.hideElement('qrModal');
    this.qrPartes = [];
    this.qrIndice = 0;
    this.qrTitulo = '';
  }

  scanQRManual(targetId: string): void {
    const partes: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const parte = prompt(`PARTE ${i}/3 — pega el contenido del QR ${i}:`);
      if (!parte) break;
      partes.push(parte.trim());
    }
    if (partes.length === 0) return;
    const legacyUnico = partes.length === 1 && !partes[0].startsWith('MZ3/');
    if (partes.length < 3 && !legacyUnico) {
      alert('Faltan partes del QR. Repite la captura de las 3 partes (o pega el QR antiguo completo).');
      return;
    }
    const ta = document.getElementById(targetId) as HTMLTextAreaElement | null;
    if (!ta) return;
    ta.value = partes.join('\n');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
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
    document.querySelectorAll('.class-btn[data-class]').forEach(btn => {
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
          <span class="game-list-meta">[HOST] ${p.hostNick} | Jugadores: ${p.numJugadores}</span>
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
    // El dock de acciones es UI de partida: al volver al lobby se oculta.
    const actionDock = document.getElementById('actionDock');
    if (actionDock) actionDock.style.display = 'none';
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
    document.getElementById('btnEquipo')?.addEventListener('click', () => this.openEquipoModal());
    document.getElementById('btnCerrarEquipo')?.addEventListener('click', () => this.closeEquipoModal());

    // Bulto como destino de drop (una sola vez: el elemento persiste entre renders).
    const pack = document.getElementById('equipoPack');
    pack?.addEventListener('dragover', (e) => {
      if (this.slotArrastrado) { e.preventDefault(); pack.classList.add('drag-over'); }
    });
    pack?.addEventListener('dragleave', () => pack.classList.remove('drag-over'));
    pack?.addEventListener('drop', (e) => {
      e.preventDefault();
      pack.classList.remove('drag-over');
      const id = this.arrastrando || (e as DragEvent).dataTransfer?.getData('text/plain') || '';
      let ranura = this.slotArrastrado;
      if (!ranura && id) {
        const st = this.delegate.getEstadoEquipo();
        ranura = RANURAS_EQUIPO.find((r) => st.equipo[r] === id) ?? null;
      }
      if (ranura) { this.delegate.desequiparRanura(ranura); this.renderEquipo(); }
      this.limpiarArrastre();
    });
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
        this.showManualMode('host');
      });
    });
    document.getElementById('btnCoopGuest')?.addEventListener('click', () => this.showManualMode('guest'));
    document.getElementById('btnNuevaOferta')?.addEventListener('click', () => this.delegate.onNewManualOffer());
    document.getElementById('btnJugarManual')?.addEventListener('click', () => this.cerrarPanelManual());

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

    document.querySelectorAll('.genero-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.onSelectGenero(((e.currentTarget as HTMLElement).getAttribute('data-genero') || 'm') as 'm' | 'f');
      });
    });

    document.querySelectorAll('.class-btn[data-class]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const prev = document.querySelector('.class-btn[data-class].selected')?.getAttribute('data-class') || 'guerrero';
        document.querySelectorAll('.class-btn[data-class]').forEach(b => b.classList.remove('selected'));
        (e.currentTarget as HTMLElement).classList.add('selected');
        const next = (e.currentTarget as HTMLElement).getAttribute('data-class') || 'guerrero';
        if (next !== prev) this.rebaseAvatarAClase(prev, next);
        else this.repaintPreview();
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
    document.getElementById('btnQRPrev')?.addEventListener('click', () => this.qrAnterior());
    document.getElementById('btnQRNext')?.addEventListener('click', () => this.qrSiguiente());
    document.getElementById('btnScanQROffer')?.addEventListener('click', () => this.scanQRManual('manualOfferIn'));
    document.getElementById('btnScanQRAnswer')?.addEventListener('click', () => this.scanQRManual('manualAnswerIn'));
  }
}
