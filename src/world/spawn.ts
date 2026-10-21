import { Celda } from './Celda';

export interface Posicion {
  fila: number;
  columna: number;
}

function celdaLibre(celda: Celda | undefined): boolean {
  if (!celda || !celda.esTransitable) return false;
  if (celda.cofre !== null || celda.llave !== null || celda.esPortal || celda.esSalida) return false;
  if (celda.alimento !== null || celda.burbuja !== null || celda.tienePico) return false;
  return true;
}

/** Celda transitable y libre, a distancia Manhattan ≥ minDist del punto dado. */
export function elegirCeldaLejos(
  celdas: Celda[][],
  desde: Posicion,
  minDist: number,
  rng: () => number = Math.random,
): Posicion | null {
  const filas = celdas.length;
  const columnas = filas > 0 ? celdas[0].length : 0;
  if (filas === 0 || columnas === 0) return null;
  for (let intento = 0; intento < 2000; intento++) {
    const fila = Math.floor(rng() * filas);
    const columna = Math.floor(rng() * columnas);
    if (!celdaLibre(celdas[fila]?.[columna])) continue;
    if (Math.abs(fila - desde.fila) + Math.abs(columna - desde.columna) < minDist) continue;
    return { fila, columna };
  }
  return null;
}

/** Celda para soltar una llave: la del enemigo o un vecino libre. */
export function elegirCeldaParaLlave(
  celdas: Celda[][],
  fila: number,
  columna: number,
): Posicion | null {
  const candidatos: Posicion[] = [
    { fila, columna },
    { fila: fila - 1, columna },
    { fila: fila + 1, columna },
    { fila, columna: columna - 1 },
    { fila, columna: columna + 1 },
  ];
  for (const pos of candidatos) {
    if (celdaLibre(celdas[pos.fila]?.[pos.columna])) return pos;
  }
  return null;
}
