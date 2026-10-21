import { Celda } from './Celda';
import type { SalaBSP } from './generation';
import type { TipoCofre, TipoLlave } from '../core/tesoros';

export interface CofreColocado {
  tipo: TipoCofre;
  fila: number;
  columna: number;
}

export interface LlaveColocada {
  tipo: TipoLlave;
  fila: number;
  columna: number;
}

export interface ResultadoTesoros {
  cofres: CofreColocado[];
  llaves: LlaveColocada[];
}

interface Posicion {
  fila: number;
  columna: number;
}

function barajar<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function esTransitable(celdas: Celda[][], fila: number, columna: number): boolean {
  return !!celdas[fila]?.[columna]?.esTransitable;
}

function vecinosTransitables(celdas: Celda[][], fila: number, columna: number): number {
  let total = 0;
  for (const [df, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    if (esTransitable(celdas, fila + df, columna + dc)) total++;
  }
  return total;
}

/** Flood fill sobre celdas transitables: el mapa no puede quedar partido por un cofre. */
function conectado(celdas: Celda[][]): boolean {
  const total = celdas.flat().filter((celda) => celda.esTransitable).length;
  if (total === 0) return true;
  let inicio: Celda | null = null;
  for (const fila of celdas) {
    for (const celda of fila) {
      if (celda.esTransitable) { inicio = celda; break; }
    }
    if (inicio) break;
  }
  if (!inicio) return true;
  const vistos = new Set<string>([`${inicio.fila},${inicio.columna}`]);
  const pila: Celda[] = [inicio];
  while (pila.length > 0) {
    const celda = pila.pop()!;
    for (const [df, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const vecina = celdas[celda.fila + df]?.[celda.columna + dc];
      if (!vecina || !vecina.esTransitable) continue;
      const clave = `${vecina.fila},${vecina.columna}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      pila.push(vecina);
    }
  }
  return vistos.size === total;
}

/** Celdas libres de una sala: transitable, sin objetos ambientales ni tesoro. */
function celdasLibres(celdas: Celda[][], sala: SalaBSP): Posicion[] {
  const libres: Posicion[] = [];
  for (let fila = sala.fila; fila < sala.fila + sala.alto; fila++) {
    for (let columna = sala.columna; columna < sala.columna + sala.ancho; columna++) {
      const celda = celdas[fila]?.[columna];
      if (!celda || !celda.esTransitable) continue;
      if (celda.cofre !== null || celda.llave !== null) continue;
      if (celda.alimento !== null || celda.burbuja !== null || celda.tienePico) continue;
      if (celda.esPortal || celda.tipoEscenario !== 'ninguno') continue;
      libres.push({ fila, columna });
    }
  }
  return libres;
}

function colocarCofre(
  celdas: Celda[][],
  salas: SalaBSP[],
  tipo: TipoCofre,
  rng: () => number,
): CofreColocado | null {
  for (const sala of barajar(salas, rng)) {
    for (const pos of barajar(celdasLibres(celdas, sala), rng)) {
      if (vecinosTransitables(celdas, pos.fila, pos.columna) < 2) continue;
      const celda = celdas[pos.fila][pos.columna];
      celda.cofre = tipo;
      celda.cofreAbierto = false;
      celda.esTransitable = false;
      if (conectado(celdas)) return { tipo, ...pos };
      celda.cofre = null;
      celda.esTransitable = true;
    }
  }
  return null;
}

function colocarLlave(
  celdas: Celda[][],
  salas: SalaBSP[],
  tipo: TipoLlave,
  rng: () => number,
): LlaveColocada | null {
  for (const sala of barajar(salas, rng)) {
    for (const pos of barajar(celdasLibres(celdas, sala), rng)) {
      celdas[pos.fila][pos.columna].llave = tipo;
      return { tipo, ...pos };
    }
  }
  return null;
}

/**
 * Poblamiento determinista de tesoros: 1–5 cofres de hierro, 0–3 de acero y una
 * llave reutilizable por tipo con cofres. Los cofres bloquean su celda.
 */
export function poblarTesoros(
  celdas: Celda[][],
  salas: SalaBSP[],
  rng: () => number,
): ResultadoTesoros {
  const validas = salas.filter((sala) => sala.alto >= 3 && sala.ancho >= 3);
  if (validas.length === 0) return { cofres: [], llaves: [] };

  const numHierro = 1 + Math.floor(rng() * 5);
  const numAcero = Math.floor(rng() * 4);
  const numTitanio = Math.floor(rng() * 2);
  const cofres: CofreColocado[] = [];

  for (let i = 0; i < numHierro; i++) {
    const cofre = colocarCofre(celdas, validas, 'hierro', rng);
    if (cofre) cofres.push(cofre);
  }
  for (let i = 0; i < numAcero; i++) {
    const cofre = colocarCofre(celdas, validas, 'acero', rng);
    if (cofre) cofres.push(cofre);
  }
  for (let i = 0; i < numTitanio; i++) {
    const cofre = colocarCofre(celdas, validas, 'titanio', rng);
    if (cofre) cofres.push(cofre);
  }

  const llaves: LlaveColocada[] = [];
  if (cofres.some((cofre) => cofre.tipo === 'hierro')) {
    const llave = colocarLlave(celdas, validas, 'hierro', rng);
    if (llave) llaves.push(llave);
  }
  if (cofres.some((cofre) => cofre.tipo === 'acero')) {
    const llave = colocarLlave(celdas, validas, 'acero', rng);
    if (llave) llaves.push(llave);
  }

  return { cofres, llaves };
}
