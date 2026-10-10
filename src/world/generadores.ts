import { Celda } from './Celda';
import { generarLaberintoBSP, mulberry32 } from './generation';
import { poblarObjetosAmbiente } from './objetosAmbiente';
import type { GenSpec } from './mundo';

export { mulberry32 };

export type GeneradorFn = (
  rng: () => number,
  filas: number,
  columnas: number,
  params: Record<string, number | string>,
) => Celda[][];

function crearMapaVacio(filas: number, columnas: number): Celda[][] {
  const mapa: Celda[][] = [];
  for (let f = 0; f < filas; f++) {
    mapa[f] = [];
    for (let c = 0; c < columnas; c++) {
      mapa[f][c] = new Celda(f, c);
    }
  }
  return mapa;
}

function conectarTransitables(mapa: Celda[][]): void {
  const filas = mapa.length;
  const columnas = filas > 0 ? mapa[0].length : 0;
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      if (!mapa[f][c].esTransitable) continue;
      if (f + 1 < filas && mapa[f + 1][c].esTransitable) {
        mapa[f][c].muros.inferior = false;
        mapa[f + 1][c].muros.superior = false;
      }
      if (c + 1 < columnas && mapa[f][c + 1].esTransitable) {
        mapa[f][c].muros.derecho = false;
        mapa[f][c + 1].muros.izquierdo = false;
      }
    }
  }
}

export function generarMazmorra(
  rng: () => number,
  filas: number,
  columnas: number,
  _params: Record<string, number | string>,
): Celda[][] {
  const mapa = crearMapaVacio(filas, columnas);
  generarLaberintoBSP(mapa, rng);
  return mapa;
}

export function generarAbierto(
  rng: () => number,
  filas: number,
  columnas: number,
  _params: Record<string, number | string>,
): Celda[][] {
  const mapa = crearMapaVacio(filas, columnas);
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      mapa[f][c].esTransitable = rng() > 0.25;
    }
  }
  conectarTransitables(mapa);
  return mapa;
}

export function generarPlanta(
  rng: () => number,
  filas: number,
  columnas: number,
  _params: Record<string, number | string>,
): Celda[][] {
  const mapa = crearMapaVacio(filas, columnas);
  const paso = 6;
  let anterior: { f: number; c: number } | null = null;

  for (let f0 = 1; f0 + 3 < filas; f0 += paso) {
    for (let c0 = 1; c0 + 3 < columnas; c0 += paso) {
      const alto = 2 + Math.floor(rng() * 3);
      const ancho = 2 + Math.floor(rng() * 3);
      const centro = { f: f0 + Math.floor(alto / 2), c: c0 + Math.floor(ancho / 2) };

      for (let f = f0; f < f0 + alto && f < filas; f++) {
        for (let c = c0; c < c0 + ancho && c < columnas; c++) {
          mapa[f][c].esTransitable = true;
        }
      }

      if (anterior) {
        let fActual = anterior.f;
        while (fActual !== centro.f) {
          fActual += fActual < centro.f ? 1 : -1;
          mapa[fActual][anterior.c].esTransitable = true;
        }
        let cActual = anterior.c;
        while (cActual !== centro.c) {
          cActual += cActual < centro.c ? 1 : -1;
          mapa[centro.f][cActual].esTransitable = true;
        }
      }
      anterior = centro;
    }
  }

  conectarTransitables(mapa);
  return mapa;
}

// --- Planta v2: plano de vivienda contenido (retícula de habitaciones con puertas) ---

/** Tamaño interior de cada habitación (celdas) y grosor de tabique. */
export const ANCHO_HABITACION = 4;
export const ALTO_HABITACION = 3;
export const GROSOR_PARED = 1;

export interface DimensionesPlanta {
  filas: number;
  columnas: number;
}

const TIPOS_HABITACION: ReadonlyArray<{ piezas: string[] }> = [
  { piezas: ['cama'] },
  { piezas: ['chimenea', 'estante'] },
  { piezas: ['mesa', 'silla'] },
  { piezas: ['estante', 'silla'] },
];

/** Dimensiones contenidas que ocupa una casa con la retícula de habitaciones pedida. */
export function dimensionesPlanta(params: Record<string, number | string>): DimensionesPlanta {
  const hx = Math.max(1, Math.floor(Number(params.habitacionesX) || 1));
  const hy = Math.max(1, Math.floor(Number(params.habitacionesY) || 1));
  return {
    filas: hy * (ALTO_HABITACION + GROSOR_PARED) + GROSOR_PARED,
    columnas: hx * (ANCHO_HABITACION + GROSOR_PARED) + GROSOR_PARED,
  };
}

/**
 * Plano de casa: retícula de habitaciones separadas por tabiques con una puerta por
 * tabique compartido. Perímetro exterior cerrado (sin exteriores). Una puerta aleatoria
 * (sembrada) por tabique garantiza que todas las habitaciones quedan conectadas.
 */
export function generarPlantaHabitaciones(
  rng: () => number,
  filas: number,
  columnas: number,
  params: Record<string, number | string>,
): Celda[][] {
  const mapa = crearMapaVacio(filas, columnas);
  const pasoF = ALTO_HABITACION + GROSOR_PARED;
  const pasoC = ANCHO_HABITACION + GROSOR_PARED;
  const hx = Math.max(1, Math.floor((columnas - GROSOR_PARED) / pasoC));
  const hy = Math.max(1, Math.floor((filas - GROSOR_PARED) / pasoF));
  void params;

  const esPared = (f: number, c: number): boolean =>
    f % pasoF < GROSOR_PARED || c % pasoC < GROSOR_PARED;

  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      if (!esPared(f, c)) mapa[f][c].esTransitable = true;
    }
  }

  // Una puerta por tabique compartido (horizontal entre habitaciones vecinas en columna,
  // vertical entre habitaciones vecinas en fila). La puerta es una celda del tabique.
  const puertas: Array<{ f: number; c: number }> = [];
  for (let i = 0; i < hy; i++) {
    for (let j = 0; j < hx; j++) {
      if (j + 1 < hx) {
        const colPared = (j + 1) * pasoC;
        const filaPuerta = i * pasoF + GROSOR_PARED + Math.floor(rng() * ALTO_HABITACION);
        mapa[filaPuerta][colPared].esTransitable = true;
        mapa[filaPuerta][colPared].sueloDecor = 'madera';
        puertas.push({ f: filaPuerta, c: colPared });
      }
      if (i + 1 < hy) {
        const filaPared = (i + 1) * pasoF;
        const colPuerta = j * pasoC + GROSOR_PARED + Math.floor(rng() * ANCHO_HABITACION);
        mapa[filaPared][colPuerta].esTransitable = true;
        mapa[filaPared][colPuerta].sueloDecor = 'madera';
        puertas.push({ f: filaPared, c: colPuerta });
      }
    }
  }

  conectarTransitables(mapa);

  // Suelo decorativo por habitación, alfombras ocasionales y mobiliario determinista.
  const prohibido = new Set<string>();
  for (const d of puertas) {
    prohibido.add(`${d.f},${d.c}`);
    prohibido.add(`${d.f - 1},${d.c}`);
    prohibido.add(`${d.f + 1},${d.c}`);
    prohibido.add(`${d.f},${d.c - 1}`);
    prohibido.add(`${d.f},${d.c + 1}`);
  }
  for (let i = 0; i < hy; i++) {
    for (let j = 0; j < hx; j++) {
      const fila0 = i * pasoF + GROSOR_PARED;
      const col0 = j * pasoC + GROSOR_PARED;
      const material: 'madera' | 'baldosa' = rng() < 0.5 ? 'madera' : 'baldosa';
      const celdasHab: Array<{ f: number; c: number }> = [];
      for (let f = fila0; f < fila0 + ALTO_HABITACION; f++) {
        for (let c = col0; c < col0 + ANCHO_HABITACION; c++) {
          if (mapa[f][c].esTransitable) {
            mapa[f][c].sueloDecor = material;
            celdasHab.push({ f, c });
          }
        }
      }
      const tipo = TIPOS_HABITACION[Math.floor(rng() * TIPOS_HABITACION.length)];
      let colocadas = 0;
      for (const { f, c } of celdasHab) {
        if (colocadas >= tipo.piezas.length) break;
        if (prohibido.has(`${f},${c}`) || mapa[f][c].mueble) continue;
        mapa[f][c].mueble = tipo.piezas[colocadas];
        mapa[f][c].esTransitable = false;
        colocadas++;
      }
      if (rng() < 0.5) {
        const cf = fila0 + Math.floor(ALTO_HABITACION / 2);
        const cc = col0 + Math.floor(ANCHO_HABITACION / 2);
        if (mapa[cf][cc].esTransitable) mapa[cf][cc].sueloDecor = 'alfombra';
      }
    }
  }

  return mapa;
}

export function generarNatural(
  rng: () => number,
  filas: number,
  columnas: number,
  _params: Record<string, number | string>,
): Celda[][] {
  const mapa = crearMapaVacio(filas, columnas);
  let muros: boolean[][] = [];
  for (let f = 0; f < filas; f++) {
    muros[f] = [];
    for (let c = 0; c < columnas; c++) {
      muros[f][c] = f === 0 || c === 0 || f === filas - 1 || c === columnas - 1 ? true : rng() > 0.45;
    }
  }

  for (let iter = 0; iter < 4; iter++) {
    const siguiente: boolean[][] = [];
    for (let f = 0; f < filas; f++) {
      siguiente[f] = [];
      for (let c = 0; c < columnas; c++) {
        let vecinosMuro = 0;
        for (let df = -1; df <= 1; df++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (df === 0 && dc === 0) continue;
            const nf = f + df;
            const nc = c + dc;
            if (nf < 0 || nc < 0 || nf >= filas || nc >= columnas || muros[nf][nc]) vecinosMuro++;
          }
        }
        siguiente[f][c] = f === 0 || c === 0 || f === filas - 1 || c === columnas - 1 ? true : vecinosMuro >= 5;
      }
    }
    muros = siguiente;
  }

  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      mapa[f][c].esTransitable = !muros[f][c];
    }
  }
  conectarTransitables(mapa);
  return mapa;
}

export const GENERADORES: Readonly<Record<string, Readonly<Record<number, GeneradorFn>>>> = {
  mazmorra: { 1: generarMazmorra },
  abierto: { 1: generarAbierto },
  planta: { 1: generarPlanta, 2: generarPlantaHabitaciones },
  natural: { 1: generarNatural },
};

export function generarNodo(gen: GenSpec, filas: number, columnas: number): Celda[][] {
  const versiones = GENERADORES[gen.nombre];
  if (!versiones) {
    throw new Error(`Generador desconocido: ${gen.nombre}`);
  }
  const generador = versiones[gen.version];
  if (!generador) {
    throw new Error(`Versión no soportada para ${gen.nombre}: ${gen.version}`);
  }
  const rng = mulberry32(gen.seed);
  const celdas = generador(rng, filas, columnas, gen.params);
  // Un nodo puede pedir un interior limpio (p.ej. la casa: sin comida/burbujas/portales).
  if (gen.params.sinAmbientales !== 1) {
    poblarObjetosAmbiente(celdas, rng);
  }
  return celdas;
}
