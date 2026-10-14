import { ITEMS } from '../config/items';
import type { CestaTrade } from '../core/intercambio';

export type EstadoVentana =
  | 'invitacion'
  | 'propuesta'
  | 'propio-confirmado'
  | 'otro-confirmado'
  | 'ambos-confirmado'
  | 'ocupado'
  | 'cancelado'
  | 'aplicado';

const TEXTOS: Record<EstadoVentana, string> = {
  invitacion: '',
  propuesta: 'Ofertas en la mesa: confirmad ambos cuando estéis de acuerdo.',
  'propio-confirmado': 'Confirmado por ti — esperando al otro…',
  'otro-confirmado': 'El otro confirmó — completa tu confirmación.',
  'ambos-confirmado': '¡Ambos confirmaron!',
  ocupado: 'El otro jugador está ocupado en otro trueque.',
  cancelado: 'Trueque cancelado.',
  aplicado: '¡Trueque aplicado!',
};

/**
 * Render de la ventana de trueque (sin protocolo): el wiring alimenta las
 * secciones y las acciones salen por callbacks.
 */
export class TruequeUI {
  con: string | null = null;
  private estado: EstadoVentana = 'propuesta';
  private cestaMia: CestaTrade = [];
  private cestaOtro: CestaTrade | null = null;
  onOfrecer: (id: string) => void = () => {};
  onMenos: (id: string) => void = () => {};
  onQuitar: (id: string) => void = () => {};
  onConfirmar: () => void = () => {};
  onCancelar: () => void = () => {};
  onAceptarInvitacion: () => void = () => {};
  onRechazarInvitacion: () => void = () => {};

  abrirInvitacion(de: string, nick: string): void {
    this.con = de;
    this.cestaMia = [];
    this.cestaOtro = null;
    const invitor = document.getElementById('truequeInvitor');
    if (invitor) invitor.textContent = nick;
    this.mostrar('truequeInvitacion', true);
    this.mostrar('truequePanel', false);
    const modal = document.getElementById('truequeModal');
    if (modal) modal.style.display = 'flex';
  }

  abrir(con: string): void {
    this.con = con;
    this.cestaMia = [];
    this.cestaOtro = null;
    this.estado = 'propuesta';
    this.mostrar('truequeInvitacion', false);
    this.mostrar('truequePanel', true);
    const modal = document.getElementById('truequeModal');
    if (modal) modal.style.display = 'flex';
    this.pintar();
  }

  cerrar(): void {
    this.con = null;
    this.cestaMia = [];
    this.cestaOtro = null;
    this.estado = 'propuesta';
    const modal = document.getElementById('truequeModal');
    if (modal) modal.style.display = 'none';
  }

  visible(): boolean {
    return document.getElementById('truequeModal')?.style.display === 'flex';
  }

  /** TU INVENTARIO: bulto (copias agrupadas) + mochila (pilas) con botón OFRECER. */
  renderMio(bulto: string[], inventario: Record<string, number>): void {
    const contenedor = document.getElementById('truequeMio');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    const stocks = new Map<string, number>();
    for (const id of bulto) stocks.set(id, (stocks.get(id) ?? 0) + 1);
    for (const [id, n] of Object.entries(inventario)) {
      if (n > 0) stocks.set(id, (stocks.get(id) ?? 0) + n);
    }
    if (stocks.size === 0) {
      contenedor.appendChild(this.plano('(inventario vacío)'));
      return;
    }
    for (const [id, n] of stocks) {
      const fila = document.createElement('div');
      fila.className = 'trueque-fila';
      const nombre = document.createElement('span');
      nombre.className = 'nombre';
      nombre.textContent = `${ITEMS[id]?.nombre ?? id} ×${ITEMS[id]?.apilable ? n : 1}`;
      const ofrecer = document.createElement('button');
      ofrecer.className = 'trueque-mini trueque-ofrecer';
      ofrecer.dataset.id = id;
      ofrecer.textContent = 'OFRECER';
      fila.appendChild(nombre);
      fila.appendChild(ofrecer);
      contenedor.appendChild(fila);
    }
  }

  setCestaMia(cesta: CestaTrade): void {
    this.cestaMia = cesta;
    this.pintar();
  }

  setCestaOtro(cesta: CestaTrade | null): void {
    this.cestaOtro = cesta;
    this.pintar();
  }

  setEstado(estado: EstadoVentana): void {
    this.estado = estado;
    this.pintar();
  }

  /** Delegación de eventos (una escucha por contenedor). */
  conectar(): void {
    document.getElementById('btnTruequeAceptar')?.addEventListener('click', () => this.onAceptarInvitacion());
    document.getElementById('btnTruequeRechazar')?.addEventListener('click', () => this.onRechazarInvitacion());
    document.getElementById('btnTruequeConfirmar')?.addEventListener('click', () => this.onConfirmar());
    document.getElementById('btnTruequeCancelar')?.addEventListener('click', () => this.onCancelar());
    document.getElementById('truequeMio')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.trueque-ofrecer') as HTMLElement | null;
      if (btn?.dataset.id) this.onOfrecer(btn.dataset.id);
    });
    document.getElementById('truequeCesta')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.trueque-mini') as HTMLElement | null;
      if (!btn?.dataset.id) return;
      if (btn.classList.contains('trueque-mas')) this.onOfrecer(btn.dataset.id);
      if (btn.classList.contains('trueque-menos')) this.onMenos(btn.dataset.id);
      if (btn.classList.contains('trueque-x')) this.onQuitar(btn.dataset.id);
    });
  }

  // ─── Internos ───────────────────────────────────────────────────────────────

  private mostrar(id: string, si: boolean): void {
    const el = document.getElementById(id);
    if (el) el.style.display = si ? 'block' : 'none';
  }

  private plano(texto: string): HTMLElement {
    const fila = document.createElement('div');
    fila.className = 'trueque-fila';
    fila.textContent = texto;
    return fila;
  }

  private pintar(): void {
    const estadoEl = document.getElementById('truequeEstado');
    if (estadoEl) estadoEl.textContent = TEXTOS[this.estado] ?? '';
    const confirmar = document.getElementById('btnTruequeConfirmar') as HTMLButtonElement | null;
    if (confirmar) {
      confirmar.disabled = this.estado === 'propio-confirmado' || this.estado === 'ambos-confirmado' || this.estado === 'aplicado';
    }
    this.pintarCesta('truequeCesta', this.cestaMia, true);
    this.pintarCesta('truequeOtro', this.cestaOtro ?? [], false);
  }

  private pintarCesta(idContenedor: string, cesta: CestaTrade, mios: boolean): void {
    const contenedor = document.getElementById(idContenedor);
    if (!contenedor) return;
    contenedor.innerHTML = '';
    if (cesta.length === 0) {
      contenedor.appendChild(this.plano(mios ? '(añade ítems con +)' : '(sin oferta)'));
      return;
    }
    for (const linea of cesta) {
      const fila = document.createElement('div');
      fila.className = 'trueque-fila';
      const nombre = document.createElement('span');
      nombre.className = 'nombre';
      nombre.textContent = `${ITEMS[linea.id]?.nombre ?? linea.id} ×${linea.cantidad}`;
      fila.appendChild(nombre);
      if (mios) {
        const ctrl = document.createElement('span');
        ctrl.className = 'trueque-ctrl';
        const menos = document.createElement('button');
        menos.className = 'trueque-mini trueque-menos';
        menos.dataset.id = linea.id;
        menos.textContent = '−';
        const mas = document.createElement('button');
        mas.className = 'trueque-mini trueque-mas';
        mas.dataset.id = linea.id;
        mas.textContent = '+';
        const x = document.createElement('button');
        x.className = 'trueque-mini trueque-x';
        x.dataset.id = linea.id;
        x.textContent = '✕';
        ctrl.appendChild(menos);
        ctrl.appendChild(mas);
        ctrl.appendChild(x);
        fila.appendChild(ctrl);
      }
      contenedor.appendChild(fila);
    }
  }
}