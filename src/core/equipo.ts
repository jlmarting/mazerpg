/**
 * Dominio de equipamiento e inventario — piloto v1.
 *
 * Módulo puro (sin DOM): modelos, reglas y agregaciones. Todo lo que muta
 * estado devuelve copias nuevas. Las reglas de empuñadura viven aquí
 * (`equipar` resuelve los conflictos de forma determinista):
 *   - Arma a dos manos (`manos: 2`): ocupa `mano_derecha` y desaloja escudo y mano izquierda.
 *   - Escudo: exige mano libre → desaloja un arma a dos manos.
 *   - Arma a una mano: convive con escudo.
 *
 * Puente visual: `piezasDeEquipo` traduce la armadura equipada a las piezas
 * del avatar (compositor de `core/avatarTintes`) para que el equipo se vea.
 */
import { ITEMS, type Bonos, type ItemDef, type RanuraEquipo } from '../config/items';
import { TABLA_PIEZAS, type RanuraPieza } from './avatarTintes';

export type { RanuraEquipo, Bonos, ItemDef } from '../config/items';

export type Equipo = Record<RanuraEquipo, string | null>;
export type Inventario = Record<string, number>;

export const RANURAS_EQUIPO: RanuraEquipo[] = [
  'cabeza', 'torso', 'piernas', 'mano_derecha', 'mano_izquierda', 'escudo', 'accesorio',
];

/** Capacidad de mochila (suma de pesos, kg) — valor por defecto del piloto. */
export const CAPACIDAD_BASE = 20;

/** Capacidad máxima de carga según la fuerza efectiva (kg). */
export function capacidadMaxima(fuerza: number): number {
  return 10 + 2 * fuerza;
}

/**
 * Penalización por sobrecarga: nula hasta la mitad de la capacidad; desde ahí
 * crece (lineal, acotada a 1) y golpea ataque, defensa y coste de movimiento.
 */
export function penalizacionSobrecarga(
  peso: number,
  capacidadMax: number,
): { ataque: number; defensa: number; movimiento: number } {
  const mitad = capacidadMax / 2;
  if (capacidadMax <= 0 || peso <= mitad) return { ataque: 0, defensa: 0, movimiento: 0 };
  const s = Math.min(1, (peso - mitad) / (capacidadMax - mitad));
  return { ataque: Math.ceil(3 * s), defensa: Math.ceil(3 * s), movimiento: s };
}

export function equipoVacio(): Equipo {
  return { cabeza: null, torso: null, piernas: null, mano_derecha: null, mano_izquierda: null, escudo: null, accesorio: null };
}

/** Sanea un equipo crudo: id desconocido, tipo no-equipo o ranura cruzada → null. */
export function sanearEquipo(raw: unknown, cat: Record<string, ItemDef> = ITEMS): Equipo {
  const out = equipoVacio();
  if (typeof raw !== 'object' || raw === null) return out;
  const obj = raw as Record<string, unknown>;
  for (const ranura of RANURAS_EQUIPO) {
    const v = obj[ranura];
    if (typeof v !== 'string') continue;
    const item = cat[v];
    if (item && item.tipo === 'equipo' && item.ranura === ranura) out[ranura] = v;
  }
  return out;
}

/** Sanea una mochila cruda: solo consumibles/materiales con cantidad > 0. */
export function sanearInventario(raw: unknown, cat: Record<string, ItemDef> = ITEMS): Inventario {
  const out: Inventario = {};
  if (typeof raw !== 'object' || raw === null) return out;
  const obj = raw as Record<string, unknown>;
  for (const [id, n] of Object.entries(obj)) {
    const item = cat[id];
    if (!item || item.tipo === 'equipo') continue;
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) continue;
    out[id] = Math.floor(n);
  }
  return out;
}

/**
 * Equipa un item resolviendo conflictos de forma determinista.
 * No-equipo o desconocido → devuelve el equipo sin cambios.
 */
export function equipar(equipo: Equipo, id: string, cat: Record<string, ItemDef> = ITEMS): Equipo {
  const item = cat[id];
  if (!item || item.tipo !== 'equipo' || !item.ranura) return { ...equipo };
  const out: Equipo = { ...equipo };
  const ranura = item.ranura;
  out[ranura] = id;

  if (item.manos === 2) {
    if (ranura === 'mano_derecha') out.mano_izquierda = null;
    out.escudo = null;
  } else if (ranura === 'escudo') {
    const der = out.mano_derecha ? cat[out.mano_derecha] : undefined;
    if (der?.manos === 2) {
      out.mano_derecha = null;
      out.mano_izquierda = null;
    }
  } else if (ranura === 'mano_derecha' || ranura === 'mano_izquierda') {
    const der = out.mano_derecha ? cat[out.mano_derecha] : undefined;
    if (der?.manos === 2) {
      out.mano_derecha = null;
      out.mano_izquierda = null;
      out[ranura] = id;
    }
  }
  return out;
}

/** Vacía una ranura (no toca el resto). */
export function desequipar(equipo: Equipo, ranura: RanuraEquipo): Equipo {
  if (!RANURAS_EQUIPO.includes(ranura)) return { ...equipo };
  return { ...equipo, [ranura]: null };
}

/** Suma de bonos del equipo equipado (todas las características presentes, 0 si no hay). */
export function bonosEquipo(equipo: Equipo, cat: Record<string, ItemDef> = ITEMS): Required<Bonos> {
  const total: Required<Bonos> = { fuerza: 0, agilidad: 0, inteligencia: 0, vida: 0 };
  for (const ranura of RANURAS_EQUIPO) {
    const id = equipo[ranura];
    if (!id) continue;
    const b = cat[id]?.bonos;
    if (!b) continue;
    total.fuerza += b.fuerza ?? 0;
    total.agilidad += b.agilidad ?? 0;
    total.inteligencia += b.inteligencia ?? 0;
    total.vida += b.vida ?? 0;
  }
  return total;
}

/** Stats base + bonos de equipo, sin mutar la base. */
export function aplicarBonos(
  base: { fuerza: number; agilidad: number; inteligencia: number },
  bonos: Bonos,
): { fuerza: number; agilidad: number; inteligencia: number; vida: number } {
  return {
    fuerza: base.fuerza + (bonos.fuerza ?? 0),
    agilidad: base.agilidad + (bonos.agilidad ?? 0),
    inteligencia: base.inteligencia + (bonos.inteligencia ?? 0),
    vida: bonos.vida ?? 0,
  };
}

/** Peso total = equipo puesto + contenido de la mochila. */
export function pesoTotal(equipo: Equipo, inv: Inventario, cat: Record<string, ItemDef> = ITEMS): number {
  let peso = 0;
  for (const ranura of RANURAS_EQUIPO) {
    const id = equipo[ranura];
    if (id && cat[id]) peso += cat[id].peso;
  }
  for (const [id, n] of Object.entries(inv)) {
    if (cat[id]) peso += cat[id].peso * n;
  }
  return peso;
}

export function excedeCapacidad(equipo: Equipo, inv: Inventario, cat: Record<string, ItemDef> = ITEMS): boolean {
  return pesoTotal(equipo, inv, cat) > CAPACIDAD_BASE;
}

/** Añade a la mochila (solo consumibles/materiales). Devuelve copia nueva. */
export function anadirAlInventario(inv: Inventario, id: string, n: number, cat: Record<string, ItemDef> = ITEMS): Inventario {
  const item = cat[id];
  if (!item || item.tipo === 'equipo' || n <= 0) return { ...inv };
  return { ...inv, [id]: (inv[id] ?? 0) + Math.floor(n) };
}

/** Consume de una pila; agotada, se borra. No altera si no hay stock. */
export function consumir(inv: Inventario, id: string, n: number = 1): Inventario {
  const actual = inv[id] ?? 0;
  if (actual <= 0 || n <= 0) return { ...inv };
  const out = { ...inv };
  const resto = actual - Math.floor(n);
  if (resto > 0) out[id] = resto;
  else delete out[id];
  return out;
}

/** Daño de las armas empuñadas (suma de `dano`; el pico resta, la espada 0). */
export function danoArma(equipo: Equipo, cat: Record<string, ItemDef> = ITEMS): number {
  let d = 0;
  for (const ranura of RANURAS_EQUIPO) {
    const id = equipo[ranura];
    if (id && cat[id]) d += cat[id].dano ?? 0;
  }
  return d;
}

/** ¿Este item puede ir en esta ranura? (para el drag&drop: soltar solo donde encaja). */
export function destinoValido(id: string, ranura: RanuraEquipo, cat: Record<string, ItemDef> = ITEMS): boolean {
  const item = cat[id];
  return !!item && item.tipo === 'equipo' && item.ranura === ranura;
}

/** Puente visual: piezas del avatar que impone la armadura equipada.
 *  El item declara la variante (`pieza`); su ranura se resuelve con la tabla real. */
export function piezasDeEquipo(equipo: Equipo, cat: Record<string, ItemDef> = ITEMS): Record<RanuraPieza, string | null> {
  const piezas: Record<RanuraPieza, string | null> = { pelo: null, torso: null, piernas: null, casco: null };
  for (const ranura of RANURAS_EQUIPO) {
    const id = equipo[ranura];
    if (!id) continue;
    const variante = cat[id]?.pieza;
    if (!variante) continue;
    const meta = TABLA_PIEZAS.variantes[variante];
    if (meta && (['pelo', 'torso', 'piernas', 'casco'] as readonly string[]).includes(meta.ranura)) {
      piezas[meta.ranura as RanuraPieza] = variante;
    }
  }
  return piezas;
}
