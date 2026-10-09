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
  planta: { 1: generarPlanta },
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
  poblarObjetosAmbiente(celdas, rng);
  return celdas;
}
