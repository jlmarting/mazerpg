import { Celda } from './Celda';
import { eliminarMurosEntre } from './generation';
import type { ConectorMundo, NodoMundo } from './mundo';

export type LadoCostura = 'norte' | 'sur' | 'este' | 'oeste';
export type LadoConector = LadoCostura | null;

export interface DimsNodo {
  filas: number;
  columnas: number;
}

export interface TransformMundo {
  df: number;
  dc: number;
}

const DIRECCION: Record<LadoCostura, { df: number; dc: number }> = {
  norte: { df: -1, dc: 0 },
  sur: { df: 1, dc: 0 },
  oeste: { df: 0, dc: -1 },
  este: { df: 0, dc: 1 },
};

export function ladoOpuesto(lado: LadoCostura): LadoCostura {
  switch (lado) {
    case 'norte':
      return 'sur';
    case 'sur':
      return 'norte';
    case 'este':
      return 'oeste';
    case 'oeste':
      return 'este';
  }
}

export function direccionDeLado(lado: LadoCostura): { df: number; dc: number } {
  return { ...DIRECCION[lado] };
}

/**
 * Infiere el lado de una costura continua a partir de las celdas del conector.
 * Solo es costura si la salida está en un borde del origen y la llegada en el
 * borde opuesto del destino. `portal` nunca es costura (housing/teletransporte).
 */
export function inferirLadoConector(
  conector: Pick<ConectorMundo, 'tipo' | 'filaO' | 'columnaO' | 'filaD' | 'columnaD'>,
  dimsOrigen: DimsNodo,
  dimsDestino: DimsNodo,
): LadoConector {
  if (conector.tipo === 'portal') return null;
  if (dimsOrigen.filas <= 0 || dimsOrigen.columnas <= 0 || dimsDestino.filas <= 0 || dimsDestino.columnas <= 0) {
    return null;
  }

  if (conector.columnaO === dimsOrigen.columnas - 1 && conector.columnaD === 0) return 'este';
  if (conector.columnaO === 0 && conector.columnaD === dimsDestino.columnas - 1) return 'oeste';
  if (conector.filaO === dimsOrigen.filas - 1 && conector.filaD === 0) return 'sur';
  if (conector.filaO === 0 && conector.filaD === dimsDestino.filas - 1) return 'norte';
  return null;
}

/**
 * Coloca el nodo destino fuera del origen, con la celda de llegada adyacente a
 * la celda del conector. Devuelve el transform relativo (esquina superior
 * izquierda del destino relativa al origen) o null si el conector no es una
 * costura ubicable en bordes opuestos.
 */
export function colocarNodoDestino(
  conector: ConectorMundo,
  dimsOrigen: DimsNodo,
  dimsDestino: DimsNodo,
): TransformMundo | null {
  const lado = conector.lado ?? inferirLadoConector(conector, dimsOrigen, dimsDestino);
  if (!lado) return null;
  if (inferirLadoConector(conector, dimsOrigen, dimsDestino) !== lado) return null;

  switch (lado) {
    case 'este':
      return { df: conector.filaO - conector.filaD, dc: dimsOrigen.columnas };
    case 'oeste':
      return { df: conector.filaO - conector.filaD, dc: -dimsDestino.columnas };
    case 'sur':
      return { df: dimsOrigen.filas, dc: conector.columnaO - conector.columnaD };
    case 'norte':
      return { df: -dimsDestino.filas, dc: conector.columnaO - conector.columnaD };
  }
}

/**
 * Suma los transforms de la cadena padre→hijo. Si falta un padre, el transform
 * acumulado se trata como absoluto (degradación limpia). Corta ciclos.
 */
export function transformAbsoluto(
  mundo: ReadonlyMap<string, NodoMundo>,
  nodoId: string,
): TransformMundo {
  let df = 0;
  let dc = 0;
  const vistos = new Set<string>();
  let actual = mundo.get(nodoId);
  while (actual) {
    df += actual.transform.df;
    dc += actual.transform.dc;
    if (actual.padreId === null) break;
    if (vistos.has(actual.id)) break;
    vistos.add(actual.id);
    actual = mundo.get(actual.padreId);
  }
  return { df, dc };
}

/**
 * Celda local del destino al cruzar una costura. Asume que la entidad está en
 * la celda del conector y se mueve `(df, dc)`. Devuelve null si el lado no
 * coincide con el movimiento o si la celda cae fuera del destino.
 */
export function celdaDestinoEnCostura(
  conector: ConectorMundo,
  transformOrigen: TransformMundo,
  transformDestino: TransformMundo,
  df: number,
  dc: number,
  dimsDestino: DimsNodo,
): { fila: number; columna: number } | null {
  const lado = conector.lado ?? null;
  if (!lado) return null;
  const direccion = DIRECCION[lado];
  if (direccion.df !== df || direccion.dc !== dc) return null;

  const worldF = transformOrigen.df + conector.filaO + df;
  const worldC = transformOrigen.dc + conector.columnaO + dc;
  const fila = worldF - transformDestino.df;
  const columna = worldC - transformDestino.dc;
  if (fila < 0 || fila >= dimsDestino.filas || columna < 0 || columna >= dimsDestino.columnas) {
    return null;
  }
  return { fila, columna };
}

/**
 * Nodos cuyo AABB corta el viewport (más un margen de una celda). Los transforms
 * de entrada deben ser absolutos.
 */
export function nodosVisibles(
  nodos: ReadonlyArray<{
    id: string;
    transform: TransformMundo;
    filas: number;
    columnas: number;
  }>,
  offsetMundo: { colOffset: number; filaOffset: number },
  config: { CELDAS_VISIBLES_X: number; CELDAS_VISIBLES_Y: number },
): string[] {
  const minF = offsetMundo.filaOffset - 1;
  const maxF = offsetMundo.filaOffset + config.CELDAS_VISIBLES_Y + 1;
  const minC = offsetMundo.colOffset - 1;
  const maxC = offsetMundo.colOffset + config.CELDAS_VISIBLES_X + 1;
  const visibles: string[] = [];
  for (const nodo of nodos) {
    const finF = nodo.transform.df + nodo.filas;
    const finC = nodo.transform.dc + nodo.columnas;
    const corta =
      nodo.transform.df < maxF &&
      finF > minF &&
      nodo.transform.dc < maxC &&
      finC > minC;
    if (corta) visibles.push(nodo.id);
  }
  return visibles;
}

const MURO_POR_LADO: Record<LadoCostura, keyof Celda['muros']> = {
  norte: 'superior',
  sur: 'inferior',
  este: 'derecho',
  oeste: 'izquierdo',
};

/**
 * Abre una celda de costura en un nodo generado en el invitado: la hace
 * transitable, quita el muro del lado de la costura y abre un paso hacia el
 * interior (misma semántica que `GestorMundo.abrirCostura`).
 */
export function abrirCeldaCostura(
  celdas: Celda[][],
  costura: { lado: LadoCostura; fila: number; columna: number; interior: LadoCostura },
): void {
  const celda = celdas[costura.fila]?.[costura.columna];
  if (!celda) return;
  celda.esTransitable = true;
  celda.muros[MURO_POR_LADO[costura.lado]] = false;

  const direccion = direccionDeLado(costura.interior);
  const fila = costura.fila + direccion.df;
  const columna = costura.columna + direccion.dc;
  const vecino = celdas[fila]?.[columna];
  if (vecino) {
    vecino.esTransitable = true;
    eliminarMurosEntre(celda, vecino);
  }
}
