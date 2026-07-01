import { Celda } from '../world/Celda';
import { NUMERO_FILAS, NUMERO_COLUMNAS } from '../world/constants';

export function algoritmoBusquedaAStar(
  mapaLaberinto: Celda[][],
  filaInicio: number,
  colInicio: number,
  filaFin: number,
  colFin: number
): Celda[] | null {
  const inicio = mapaLaberinto[filaInicio][colInicio];
  const destino = mapaLaberinto[filaFin][colFin];

  let conjuntoAbierto = [inicio];
  let origenDelCamino = new Map<Celda, Celda>();

  let puntuacionG = new Map<Celda, number>();
  puntuacionG.set(inicio, 0);

  let puntuacionF = new Map<Celda, number>();
  puntuacionF.set(inicio, calcularHeuristicaManhattan(inicio, destino));

  let seguridad = 0;
  const MAX_A_STAR = 2000;

  while (conjuntoAbierto.length > 0) {
    seguridad++;
    if (seguridad > MAX_A_STAR) {
      console.warn("A* abortado por seguridad (demasiadas iteraciones)");
      return null;
    }

    let minIdx = 0;
    let minF = puntuacionF.get(conjuntoAbierto[0]) || Infinity;
    for (let i = 1; i < conjuntoAbierto.length; i++) {
      const f = puntuacionF.get(conjuntoAbierto[i]) || Infinity;
      if (f < minF) { minF = f; minIdx = i; }
    }
    let celdaActual = conjuntoAbierto[minIdx];
    conjuntoAbierto[minIdx] = conjuntoAbierto[conjuntoAbierto.length - 1];
    conjuntoAbierto.pop();

    if (celdaActual === destino) {
      return reconstruirRuta(origenDelCamino, celdaActual);
    }

    for (let vecino of obtenerVecinosTransitables(mapaLaberinto, celdaActual)) {
      if (vecino === celdaActual) continue;
      let puntuacionGTentativa = (puntuacionG.get(celdaActual) || 0) + 1;
      if (puntuacionGTentativa < (puntuacionG.get(vecino) || Infinity)) {
        origenDelCamino.set(vecino, celdaActual);
        puntuacionG.set(vecino, puntuacionGTentativa);
        puntuacionF.set(vecino, puntuacionGTentativa + calcularHeuristicaManhattan(vecino, destino));
        if (!conjuntoAbierto.includes(vecino)) {
          conjuntoAbierto.push(vecino);
        }
      }
    }
  }
  return null;
}

function calcularHeuristicaManhattan(celdaA: Celda, celdaB: Celda): number {
  return Math.abs(celdaA.fila - celdaB.fila) + Math.abs(celdaA.columna - celdaB.columna);
}

function obtenerVecinosTransitables(mapaLaberinto: Celda[][], celda: Celda): Celda[] {
  const { fila, columna } = celda;
  let vecinos: Celda[] = [];
  if (!celda.muros.superior && fila > 0 && mapaLaberinto[fila - 1][columna].esTransitable)
    vecinos.push(mapaLaberinto[fila - 1][columna]);
  if (!celda.muros.inferior && fila < NUMERO_FILAS - 1 && mapaLaberinto[fila + 1][columna].esTransitable)
    vecinos.push(mapaLaberinto[fila + 1][columna]);
  if (!celda.muros.izquierdo && columna > 0 && mapaLaberinto[fila][columna - 1].esTransitable)
    vecinos.push(mapaLaberinto[fila][columna - 1]);
  if (!celda.muros.derecho && columna < NUMERO_COLUMNAS - 1 && mapaLaberinto[fila][columna + 1].esTransitable)
    vecinos.push(mapaLaberinto[fila][columna + 1]);
  return vecinos;
}

function reconstruirRuta(origenDelCamino: Map<Celda, Celda>, celdaFinal: Celda): Celda[] {
  let rutaTotal = [celdaFinal];
  let celdaActual = celdaFinal;
  let visitadosEnRuta = new Set<Celda>();
  visitadosEnRuta.add(celdaFinal);

  while (origenDelCamino.has(celdaActual)) {
    let celdaSiguiente = origenDelCamino.get(celdaActual)!;
    if (visitadosEnRuta.has(celdaSiguiente) || celdaSiguiente === celdaActual) break;
    celdaActual = celdaSiguiente;
    visitadosEnRuta.add(celdaActual);
    rutaTotal.unshift(celdaActual);
    if (rutaTotal.length > NUMERO_FILAS * NUMERO_COLUMNAS) break;
  }
  return rutaTotal;
}
