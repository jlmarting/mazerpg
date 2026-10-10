import type { AlmacenamientoLocal } from './housing';
import { leerSnapshotNodo, type DeltaMundo, type GenSpec, type SnapshotNodo } from './mundo';

/** Prefijo de claves del espejo local: mazerpg.mundo.<nodoId> (no pisa mazerpg.casa.*). */
export const PREFIJO_MUNDO = 'mazerpg.mundo.';

/**
 * Contrato del espejo local de un nodo (solo/Firebase-off): espejo del doc de
 * mundos de PersistenciaMundo en almacenamiento local. Los deltas acumulados
 * viajan en `deltas`; `snapshot` guarda las celdas plegadas y la foto de
 * enemigos/escenario del nodo.
 */
export interface DocNodoLocal {
  formato: number;
  gen: GenSpec;
  ownerId: string | null;
  deltas: DeltaMundo[];
  snapshot: SnapshotNodo | null;
  ultimaCompactacionTick: number;
}

function almacenamientoGlobal(): AlmacenamientoLocal | null {
  const global = globalThis as { localStorage?: AlmacenamientoLocal };
  return global.localStorage ?? null;
}

export class EspejoLocal {
  private readonly almacen: AlmacenamientoLocal | null;

  constructor(almacen: AlmacenamientoLocal | null = almacenamientoGlobal()) {
    this.almacen = almacen;
  }

  private clave(nodoId: string): string {
    return `${PREFIJO_MUNDO}${nodoId}`;
  }

  guardarDoc(nodoId: string, doc: DocNodoLocal): void {
    if (!this.almacen) return;
    try {
      this.almacen.setItem(this.clave(nodoId), JSON.stringify(doc));
    } catch (e) {
      // Storage lleno (QuotaExceededError) o no disponible: nunca debe tumbar el juego.
      console.warn('No se pudo persistir el espejo del nodo (almacenamiento lleno o no disponible).', e);
    }
  }

  /** Lectura defensiva: formato ajeno, JSON corrupto o entradas malformadas se descartan. */
  cargarDoc(nodoId: string): DocNodoLocal | null {
    if (!this.almacen) return null;
    const bruto = this.almacen.getItem(this.clave(nodoId));
    if (bruto === null) return null;
    try {
      return this.validarDoc(JSON.parse(bruto));
    } catch {
      return null;
    }
  }

  borrarDoc(nodoId: string): void {
    if (!this.almacen) return;
    try {
      this.almacen.removeItem(this.clave(nodoId));
    } catch {
      // Ignorar: si no se puede borrar, no hay nada más que hacer aquí.
    }
  }

  private validarDoc(bruto: unknown): DocNodoLocal | null {
    if (!bruto || typeof bruto !== 'object') return null;
    const datos = bruto as Record<string, unknown>;
    if (datos.formato !== 1) return null;
    if (!datos.gen || typeof datos.gen !== 'object') return null;
    return {
      formato: 1,
      gen: datos.gen as GenSpec,
      ownerId: typeof datos.ownerId === 'string' ? datos.ownerId : null,
      // Reutiliza el lector tolerante de deltas por celda de mundo.ts.
      deltas: leerSnapshotNodo({ formato: 1, celdas: datos.deltas }).celdas ?? [],
      snapshot:
        datos.snapshot === undefined || datos.snapshot === null
          ? null
          : leerSnapshotNodo(datos.snapshot),
      ultimaCompactacionTick:
        typeof datos.ultimaCompactacionTick === 'number' && Number.isFinite(datos.ultimaCompactacionTick)
          ? datos.ultimaCompactacionTick
          : 0,
    };
  }
}