import { Celda } from './Celda';
import { mulberry32 } from './generadores';
import { ENEMIGOS_BASE } from './constants';

/**
 * Receta de población de un nodo. Es el punto de extensión: hoy `auto` deriva
 * una población determinista del `gen.seed`; en el futuro un nodo podrá declarar
 * qué quiere (tipo de mobs, densidad, jefes, ninguna…). Ausente ⇒ `auto`.
 */
export interface PoblacionSpec {
  /** `auto` = receta por defecto según tipo de nodo. */
  modo?: 'auto' | 'ninguna' | 'aleatoria' | 'jefe';
  /** Multiplicador de densidad (1 = base). */
  densidad?: number;
  /** Tipos de mob permitidos en este nodo. */
  tipos?: readonly string[];
  /** Semilla explícita (si falta, se usa la del nodo). */
  seed?: number;
}

export interface EnemigoSembrado {
  id: number;
  fila: number;
  columna: number;
  tipo: string;
}

const TIPOS_BASE = ['Esqueleto', 'Orco', 'Goblin', 'Minotauro'] as const;
const AREA_BASE = 80 * 80;

function factorDificultad(dificultad: string): number {
  if (dificultad === 'facil' || dificultad === 'medio') return 0.75;
  if (dificultad === 'locura') return 1.75;
  return 1;
}

/**
 * Población determinista de un nodo: misma semilla + mismas celdas ⇒ misma
 * lista, en cualquier cliente y en cualquier orden de visita. Función pura.
 */
export function generarPoblacion(params: {
  seed: number;
  celdas: Celda[][];
  filas: number;
  columnas: number;
  dificultad: string;
  spec?: PoblacionSpec;
  spawn?: { fila: number; columna: number };
}): EnemigoSembrado[] {
  const { celdas, filas, columnas, dificultad, spec, spawn } = params;
  const modo = spec?.modo ?? 'auto';
  if (modo === 'ninguna') return [];

  const seed = (spec?.seed ?? params.seed) >>> 0;
  const rng = mulberry32(seed);
  const tipos = spec?.tipos && spec.tipos.length > 0 ? spec.tipos : TIPOS_BASE;

  const area = Math.max(1, filas * columnas);
  const escalaArea = Math.max(0.15, Math.min(1, area / AREA_BASE));
  let cantidad = Math.round(ENEMIGOS_BASE * escalaArea * factorDificultad(dificultad) * (spec?.densidad ?? 1));
  if (modo === 'jefe') cantidad = Math.max(1, Math.round(cantidad * 0.5));
  if (modo === 'aleatoria') cantidad = Math.round(cantidad);

  const transitable = (f: number, c: number): boolean => {
    const celda = celdas[f]?.[c];
    return !!celda && celda.esTransitable && !celda.esSalida;
  };
  const cercaSpawn = (f: number, c: number): boolean => {
    if (!spawn) return f < 5 && c < 5;
    return Math.abs(f - spawn.fila) + Math.abs(c - spawn.columna) < 8;
  };

  const salida: EnemigoSembrado[] = [];
  for (let i = 0; i < cantidad; i++) {
    let f = 0;
    let c = 0;
    let intentos = 0;
    do {
      f = Math.floor(rng() * filas);
      c = Math.floor(rng() * columnas);
      intentos++;
    } while ((!transitable(f, c) || cercaSpawn(f, c)) && intentos < 1000);
    if (intentos >= 1000) continue;
    salida.push({ id: i, fila: f, columna: c, tipo: tipos[i % tipos.length] });
  }
  return salida;
}
