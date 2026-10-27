/**
 * Tabla de botín (piloto de loot). `rng` inyectable para tests deterministas.
 * El botín se otorga al derrotar enemigos: 1–2 tiradas ponderadas.
 */

export interface EntradaBotin {
  id: string;
  peso: number;
  /** Consumibles/materiales: rango de cantidad por tirada. */
  cantidad?: [number, number];
}

export const TABLA_BOTIN: EntradaBotin[] = [
  { id: 'flecha', peso: 38, cantidad: [2, 5] },
  { id: 'pocion_vida', peso: 25 },
  { id: 'daga', peso: 10 },
  { id: 'casco_hierro', peso: 8 },
  { id: 'peto_cuero', peso: 7 },
  { id: 'botas_veloces', peso: 4 },
  { id: 'escudo_madera', peso: 3 },
  { id: 'espada_corta', peso: 2 },
  { id: 'pocima_resurreccion', peso: 2 },
  { id: 'anillo_fuerza', peso: 1 },
];

export interface Botin {
  id: string;
  cantidad: number;
}

/** Rango inclusivo de monedas por tipo de enemigo (decisión 2026-10-21). */
export const ORO_POR_TIPO: Record<string, readonly [number, number]> = {
  Goblin: [1, 3],
  Esqueleto: [2, 4],
  Orco: [3, 6],
  Minotauro: [5, 10],
  Balrog: [25, 50],
};

export const ORO_POR_DEFECTO: readonly [number, number] = [1, 2];

/** Sortea monedas para un tipo; `rng` inyectable para tests deterministas. */
export function sortearOro(tipo: string, rng: () => number = Math.random): number {
  const [min, max] = ORO_POR_TIPO[tipo] ?? ORO_POR_DEFECTO;
  return min + Math.floor(rng() * (max - min + 1));
}

/** Sortea `veces` items de la tabla (ponderado). `rng` en [0,1). */
export function elegirBotin(rng: () => number = Math.random, veces: number = 1, tabla: EntradaBotin[] = TABLA_BOTIN): Botin[] {
  const total = tabla.reduce((s, e) => s + e.peso, 0);
  const salida: Botin[] = [];
  for (let i = 0; i < veces; i++) {
    let t = rng() * total;
    let elegido = tabla[tabla.length - 1];
    for (const e of tabla) {
      t -= e.peso;
      if (t < 0) { elegido = e; break; }
    }
    const cant = elegido.cantidad
      ? elegido.cantidad[0] + Math.floor(rng() * (elegido.cantidad[1] - elegido.cantidad[0] + 1))
      : 1;
    salida.push({ id: elegido.id, cantidad: cant });
  }
  return salida;
}
