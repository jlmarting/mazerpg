import type { NodoMundo } from '../world/mundo';
import {
  calcularLayoutMapa,
  proyectarMapa,
  type LayoutMapa,
  type NodoMapa,
} from '../world/mapamundi';

export interface EntradaMapaUI {
  nodos: NodoMundo[];
  descubiertos: ReadonlySet<string>;
  activoId: string;
  jugador: { fila: number; columna: number };
  casaActiva: boolean;
}

const COLOR_TIPO: Record<string, string> = {
  mazmorra: '#2c3e50',
  abierto: '#1e8449',
  planta: '#7d3c98',
  natural: '#117a65',
};

/** Overlay del mapamundi: nodos, terreno LOD de lo descubierto, costuras y jugador. */
export class MapamundiUI {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly overlay: HTMLElement | null;
  private readonly info: HTMLElement | null;
  public abierto: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.overlay = document.getElementById('worldMapOverlay');
    this.info = document.getElementById('worldMapInfo');
  }

  abrir(entrada: EntradaMapaUI): void {
    if (this.overlay) this.overlay.style.display = 'flex';
    this.abierto = true;
    this.dibujar(entrada);
  }

  cerrar(): void {
    if (this.overlay) this.overlay.style.display = 'none';
    this.abierto = false;
  }

  actualizar(entrada: EntradaMapaUI): void {
    if (this.abierto) this.dibujar(entrada);
  }

  private dibujar(entrada: EntradaMapaUI): void {
    const ctx = this.ctx;
    const ancho = this.canvas.width;
    const alto = this.canvas.height;
    ctx.clearRect(0, 0, ancho, alto);
    ctx.fillStyle = '#0b0f18';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.imageSmoothingEnabled = false;

    const nodosMapa: NodoMapa[] = entrada.nodos.map((nodo) => ({
      id: nodo.id,
      tipo: nodo.tipo,
      transform: nodo.transform,
      filas: nodo.filas,
      columnas: nodo.columnas,
    }));
    const layout = calcularLayoutMapa(nodosMapa, entrada.descubiertos, ancho, alto, 28);
    if (!layout) {
      ctx.fillStyle = '#7f8ea8';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Sin mundo que mostrar todavía.', ancho / 2, alto / 2);
      ctx.textAlign = 'left';
      if (this.info) this.info.textContent = 'Sin mundo';
      return;
    }

    for (const ln of layout.nodos) {
      const nodo = entrada.nodos.find((n) => n.id === ln.nodo.id);
      if (!nodo) continue;
      if (ln.descubierto) {
        this.dibujarTerreno(nodo, ln, layout);
        this.dibujarEtiqueta(ln, false);
      } else {
        ctx.fillStyle = '#0d141d';
        ctx.fillRect(ln.x, ln.y, ln.w, ln.h);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.strokeRect(ln.x, ln.y, ln.w, ln.h);
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('?', ln.x + ln.w / 2, ln.y + ln.h / 2 + 8);
        ctx.textAlign = 'left';
      }
      if (ln.nodo.id === entrada.activoId) {
        ctx.strokeStyle = '#ffdd57';
        ctx.lineWidth = 2;
        ctx.strokeRect(ln.x - 1, ln.y - 1, ln.w + 2, ln.h + 2);
      }
    }

    this.dibujarCosturas(layout);
    this.dibujarCasa(entrada, layout);

    if (!entrada.casaActiva) {
      const p = proyectarMapa(layout, entrada.jugador.fila, entrada.jugador.columna);
      ctx.fillStyle = '#00e5ff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    const espaciales = entrada.nodos.filter((n) => n.tipo !== 'personal');
    const descubiertos = espaciales.filter((n) => entrada.descubiertos.has(n.id)).length;
    const activo = entrada.nodos.find((n) => n.id === entrada.activoId);
    if (this.info) {
      this.info.textContent = `Activo: ${activo?.id ?? '—'} (${activo?.tipo ?? '—'}) · Descubiertos: ${descubiertos}/${espaciales.length}${entrada.casaActiva ? ' · Estás en tu casa' : ''}`;
    }
  }

  private dibujarTerreno(nodo: NodoMundo, ln: LayoutMapa['nodos'][number], layout: LayoutMapa): void {
    const ctx = this.ctx;
    const paso = layout.escala;
    const px = Math.max(1, Math.ceil(paso));
    const base = COLOR_TIPO[nodo.tipo] ?? '#2c3e50';

    ctx.fillStyle = base;
    ctx.fillRect(ln.x, ln.y, ln.w, ln.h);

    for (let f = 0; f < nodo.filas; f++) {
      const fila = nodo.celdas[f];
      if (!fila) continue;
      for (let c = 0; c < nodo.columnas; c++) {
        const celda = fila[c];
        if (!celda) continue;
        let color = celda.esTransitable ? base : '#0f1722';
        if (celda.esPortal) color = '#f1c40f';
        else if (celda.cofre) color = '#f39c12';
        else if (celda.llave) color = '#f1c40f';
        else if (celda.alimento) color = '#2ecc71';
        else if (celda.tienePico) color = '#95a5a6';
        else if (celda.muros.superior && celda.muros.derecho && celda.muros.inferior && celda.muros.izquierdo && !celda.esTransitable) color = '#0f1722';
        ctx.fillStyle = color;
        ctx.fillRect(ln.x + c * paso, ln.y + f * paso, px, px);
      }
    }

    ctx.strokeStyle = '#1f2d3d';
    ctx.lineWidth = 1;
    ctx.strokeRect(ln.x, ln.y, ln.w, ln.h);
    this.dibujarEtiqueta(ln, true);
  }

  private dibujarEtiqueta(ln: LayoutMapa['nodos'][number], conEtiqueta: boolean): void {
    if (!conEtiqueta) return;
    const ctx = this.ctx;
    const texto = ln.nodo.id;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    const ancho = ctx.measureText(texto).width;
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(ln.x + 2, ln.y + 2, ancho + 6, 13);
    ctx.fillStyle = '#e8f0ff';
    ctx.fillText(texto, ln.x + 5, ln.y + 12);
  }

  private dibujarCosturas(layout: LayoutMapa): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#00d1ff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    for (let i = 0; i < layout.nodos.length; i++) {
      for (let j = i + 1; j < layout.nodos.length; j++) {
        const a = layout.nodos[i];
        const b = layout.nodos[j];
        const solapaFila = Math.max(a.y, b.y) < Math.min(a.y + a.h, b.y + b.h);
        const solapaColumna = Math.max(a.x, b.x) < Math.min(a.x + a.w, b.x + b.w);
        if (Math.abs(a.x + a.w - b.x) < 1 && solapaFila) {
          const y1 = Math.max(a.y, b.y);
          const y2 = Math.min(a.y + a.h, b.y + b.h);
          ctx.beginPath();
          ctx.moveTo(a.x + a.w, y1);
          ctx.lineTo(a.x + a.w, y2);
          ctx.stroke();
        } else if (Math.abs(b.x + b.w - a.x) < 1 && solapaFila) {
          const y1 = Math.max(a.y, b.y);
          const y2 = Math.min(a.y + a.h, b.y + b.h);
          ctx.beginPath();
          ctx.moveTo(a.x, y1);
          ctx.lineTo(a.x, y2);
          ctx.stroke();
        } else if (Math.abs(a.y + a.h - b.y) < 1 && solapaColumna) {
          const x1 = Math.max(a.x, b.x);
          const x2 = Math.min(a.x + a.w, b.x + b.w);
          ctx.beginPath();
          ctx.moveTo(x1, a.y + a.h);
          ctx.lineTo(x2, a.y + a.h);
          ctx.stroke();
        } else if (Math.abs(b.y + b.h - a.y) < 1 && solapaColumna) {
          const x1 = Math.max(a.x, b.x);
          const x2 = Math.min(a.x + a.w, b.x + b.w);
          ctx.beginPath();
          ctx.moveTo(x1, a.y);
          ctx.lineTo(x2, a.y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  private dibujarCasa(entrada: EntradaMapaUI, _layout: LayoutMapa): void {
    const casa = entrada.nodos.find((n) => n.tipo === 'personal');
    if (!casa) return;
    const ctx = this.ctx;
    ctx.font = '20px serif';
    ctx.textAlign = 'right';
    ctx.fillText('🏠', this.canvas.width - 20, 30);
    ctx.font = '10px monospace';
    ctx.fillStyle = entrada.casaActiva ? '#ffdd57' : '#f1c40f';
    ctx.fillText(entrada.casaActiva ? 'Casa (activa)' : 'Casa: portal', this.canvas.width - 20, 46);
    ctx.textAlign = 'left';
  }
}
