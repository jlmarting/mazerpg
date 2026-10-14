import { ITEMS, type ItemDef } from '../config/items';
import type { CestaTrade } from '../core/intercambio';

/** Añade (o fusiona) una línea de cesta, clampada por stock y por apilable. */
export function anadirLinea(
  cesta: CestaTrade,
  id: string,
  n: number,
  stockMax: number,
  cat: Record<string, ItemDef> = ITEMS,
): CestaTrade {
  const item = cat[id];
  if (!item || n <= 0 || stockMax <= 0) return [...cesta];
  const indice = cesta.findIndex((l) => l.id === id);
  if (indice < 0) {
    const nueva: CestaTrade = [...cesta, { id, cantidad: 0 }];
    return fijarCantidad(nueva, id, n, item.apilable ? stockMax : 1, cat);
  }
  return fijarCantidad(cesta, id, cesta[indice].cantidad + n, item.apilable ? stockMax : 1, cat);
}

function fijarCantidad(cesta: CestaTrade, id: string, cantidad: number, max: number, cat: Record<string, ItemDef>): CestaTrade {
  return cesta.map((l) => (l.id === id ? { id: l.id, cantidad: Math.min(max, Math.max(1, cantidad), cat[l.id]?.apilable ? max : 1) } : l));
}

/** Elimina la línea del id (sin mutar la entrada). */
export function quitarLinea(cesta: CestaTrade, id: string): CestaTrade {
  return cesta.filter((l) => l.id !== id);
}

/** ¿La cesta ya alcanzó el máximo disponible de ese id? */
export function agotado(cesta: CestaTrade, id: string, stockMax: number): boolean {
  const linea = cesta.find((l) => l.id === id);
  return (linea?.cantidad ?? 0) >= stockMax;
}