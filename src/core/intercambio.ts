import { ITEMS, type ItemDef } from '../config/items';
import {
  capacidadMaxima,
  pesoTotal,
  consumir,
  anadirAlInventario,
  type Equipo,
  type Inventario,
} from './equipo';

export type CestaTrade = { id: string; cantidad: number }[];

export type OfertaTrade = { de: string; da: CestaTrade; pide: CestaTrade };

export type EstadoTrade = 'propuesta' | 'confirmada_uno' | 'confirmada_ambos' | 'aplicada' | 'cancelada';

/** Estado que el intercambio necesita de cada parte (capacidad según fuerza efectiva). */
export type EstadoParte = { equipo: Equipo; bulto: string[]; inventario: Inventario; fuerza: number };

export type CambiosParte = { bulto: string[]; inventario: Inventario };

function esLineaCesta(raw: unknown): raw is { id: string; cantidad: number } {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as { id?: unknown; cantidad?: unknown };
  if (typeof obj.id !== 'string' || obj.id === '') return false;
  if (!(ITEMS as Record<string, ItemDef>)[obj.id]) return false;
  if (typeof obj.cantidad !== 'number' || !Number.isFinite(obj.cantidad) || obj.cantidad <= 0) return false;
  return true;
}

/** Filtra líneas basura, dedup-suma por id y trunca lo NO-apilable a 1. */
export function sanearCesta(raw: unknown, cat: Record<string, ItemDef> = ITEMS): CestaTrade {
  if (!Array.isArray(raw)) return [];
  const suma = new Map<string, number>();
  for (const linea of raw) {
    if (!esLineaCesta(linea)) continue;
    suma.set(linea.id, (suma.get(linea.id) ?? 0) + Math.floor(linea.cantidad));
  }
  const cesta: CestaTrade = [];
  for (const [id, n] of suma) {
    const item = cat[id];
    if (!item) continue;
    cesta.push({ id, cantidad: item.apilable ? n : 1 });
  }
  return cesta;
}

/** ¿La cesta está cubierta por lo que la parte posee? (equipo por copias del bulto). */
export function validarDisposicion(
  cesta: CestaTrade,
  bulto: string[],
  inventario: Inventario,
  cat: Record<string, ItemDef> = ITEMS,
): boolean {
  for (const { id, cantidad } of cesta) {
    const item = cat[id];
    if (!item) return false;
    if (item.comerciable === false) return false;
    if (item.tipo === 'equipo') {
      const copias = bulto.filter((x) => x === id).length;
      if (copias < cantidad) return false;
    } else {
      if ((inventario[id] ?? 0) < cantidad) return false;
    }
  }
  return true;
}

/** Clave canónica de cesta (id#cantidad ordenados) — solo con cestas ya saneadas. */
function claveCesta(c: CestaTrade): string {
  return JSON.stringify([...c].map((l) => `${l.id}#${l.cantidad}`).sort());
}

/**
 * Aplica el trueque de forma atómica: o ambas partes pueden cumplir y recibir
 * (capacidad incluida), o devuelve `null` sin tocar nada.
 */
export function aplicarIntercambio(
  a: OfertaTrade,
  b: OfertaTrade,
  estadoA: EstadoParte,
  estadoB: EstadoParte,
  cat: Record<string, ItemDef> = ITEMS,
): { a: CambiosParte; b: CambiosParte } | null {
  const daA = sanearCesta(a.da, cat);
  const daB = sanearCesta(b.da, cat);
  const pideA = sanearCesta(a.pide, cat);
  const pideB = sanearCesta(b.pide, cat);

  // Las cestas cruzadas deben casar (conjuntos id#cantidad idénticos).
  if (claveCesta(daA) !== claveCesta(pideB)) return null;
  if (claveCesta(daB) !== claveCesta(pideA)) return null;

  if (!validarDisposicion(daA, estadoA.bulto, estadoA.inventario, cat)) return null;
  if (!validarDisposicion(daB, estadoB.bulto, estadoB.inventario, cat)) return null;

  const camA = salidaYEntrada(estadoA, daA, daB, cat);
  const camB = salidaYEntrada(estadoB, daB, daA, cat);

  // Capacidad de recepción: el peso cuenta equipo puesto + mochila (patrón existente).
  if (pesoTotal(estadoA.equipo, camA.inventario, cat) > capacidadMaxima(estadoA.fuerza)) return null;
  if (pesoTotal(estadoB.equipo, camB.inventario, cat) > capacidadMaxima(estadoB.fuerza)) return null;

  return { a: camA, b: camB };
}

/** Entrega su `da` y recibe el `da` de la otra parte (sin tocar el original). */
function salidaYEntrada(estado: EstadoParte, da: CestaTrade, recibido: CestaTrade, cat: Record<string, ItemDef>): CambiosParte {
  let bulto = [...estado.bulto];
  let inv: Inventario = { ...estado.inventario };
  for (const { id, cantidad } of da) {
    if (cat[id]?.tipo === 'equipo') {
      for (let n = 0; n < cantidad; n++) {
        const idx = bulto.indexOf(id);
        if (idx >= 0) bulto.splice(idx, 1);
      }
    } else {
      inv = consumir(inv, id, cantidad);
    }
  }
  for (const { id, cantidad } of recibido) {
    if (cat[id]?.tipo === 'equipo') {
      for (let n = 0; n < cantidad; n++) bulto.push(id);
    } else {
      inv = anadirAlInventario(inv, id, cantidad);
    }
  }
  return { bulto, inventario: inv };
}