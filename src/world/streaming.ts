export type NivelNodo = 'activo' | 'hot' | 'lod' | 'cold';

export interface NodoStreaming {
  id: string;
  transform: { df: number; dc: number };
  filas: number;
  columnas: number;
}

export interface VistaStreaming {
  minFila: number;
  maxFila: number;
  minColumna: number;
  maxColumna: number;
}

export interface SeleccionStreaming {
  niveles: Map<string, NivelNodo>;
  hot: string[];
  lod: string[];
  cold: string[];
}

export interface OpcionesStreaming {
  margenHot?: number;
  margenLod?: number;
  maxHot?: number;
}

function cortaVista(nodo: NodoStreaming, vista: VistaStreaming, margen: number): boolean {
  const minF = vista.minFila - margen;
  const maxF = vista.maxFila + margen;
  const minC = vista.minColumna - margen;
  const maxC = vista.maxColumna + margen;
  return (
    nodo.transform.df < maxF &&
    nodo.transform.df + nodo.filas > minF &&
    nodo.transform.dc < maxC &&
    nodo.transform.dc + nodo.columnas > minC
  );
}

function distanciaCuadrada(nodo: NodoStreaming, centro: { fila: number; columna: number }): number {
  const fila = nodo.transform.df + nodo.filas / 2;
  const columna = nodo.transform.dc + nodo.columnas / 2;
  const df = fila - centro.fila;
  const dc = columna - centro.columna;
  return df * df + dc * dc;
}

/**
 * Clasifica los nodos en activo/hot/lod/cold a partir de la vista de mundo.
 * `hot` incluye el activo y se recorta a `maxHot` por cercanía; los candidatos
 * que no caben pasan a `lod`; el resto de nodos dentro del margen LOD también
 * son `lod`; el resto, `cold`.
 */
export function calcularStreaming(
  nodos: ReadonlyArray<NodoStreaming>,
  activoId: string,
  vista: VistaStreaming,
  opciones: OpcionesStreaming = {},
): SeleccionStreaming {
  const margenHot = Math.max(0, opciones.margenHot ?? 8);
  const margenLod = Math.max(margenHot, opciones.margenLod ?? 40);
  const maxHot = Math.max(1, opciones.maxHot ?? 3);

  const niveles = new Map<string, NivelNodo>();
  const hot: string[] = [];
  const lod: string[] = [];
  const cold: string[] = [];
  if (nodos.length === 0) return { niveles, hot, lod, cold };

  const activo = nodos.find((n) => n.id === activoId) ?? null;
  const centro = activo
    ? {
        fila: activo.transform.df + activo.filas / 2,
        columna: activo.transform.dc + activo.columnas / 2,
      }
    : {
        fila: (vista.minFila + vista.maxFila) / 2,
        columna: (vista.minColumna + vista.maxColumna) / 2,
      };

  if (activo) {
    hot.push(activo.id);
    niveles.set(activo.id, 'activo');
  }

  const candidatos = nodos
    .filter((n) => n.id !== activoId && cortaVista(n, vista, margenHot))
    .sort((a, b) => distanciaCuadrada(a, centro) - distanciaCuadrada(b, centro) || a.id.localeCompare(b.id));

  for (const nodo of candidatos) {
    if (hot.length < maxHot) {
      hot.push(nodo.id);
      niveles.set(nodo.id, 'hot');
    } else {
      lod.push(nodo.id);
      niveles.set(nodo.id, 'lod');
    }
  }

  for (const nodo of nodos) {
    if (niveles.has(nodo.id)) continue;
    if (cortaVista(nodo, vista, margenLod)) {
      lod.push(nodo.id);
      niveles.set(nodo.id, 'lod');
    } else {
      cold.push(nodo.id);
      niveles.set(nodo.id, 'cold');
    }
  }

  return { niveles, hot, lod, cold };
}
