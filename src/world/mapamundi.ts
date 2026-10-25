import type { NodoMundo } from './mundo';

export interface NodoMapa {
  id: string;
  tipo: NodoMundo['tipo'];
  transform: { df: number; dc: number };
  filas: number;
  columnas: number;
}

export interface NodoMapaLayout {
  nodo: NodoMapa;
  x: number;
  y: number;
  w: number;
  h: number;
  descubierto: boolean;
}

export interface LayoutMapa {
  escala: number;
  offset: { x: number; y: number };
  bounds: { minFila: number; maxFila: number; minColumna: number; maxColumna: number };
  nodos: NodoMapaLayout[];
}

const ESCALA_MAX = 6;
const ESCALA_MIN = 1;

/**
 * Proyecta los nodos no personales en un canvas de mapa. La casa (personal) no
 * es geometría espacial; el llamador la dibuja como icono.
 */
export function calcularLayoutMapa(
  nodos: ReadonlyArray<NodoMapa>,
  descubiertos: ReadonlySet<string>,
  ancho: number,
  alto: number,
  padding: number = 24,
): LayoutMapa | null {
  const espaciales = nodos.filter((n) => n.tipo !== 'personal');
  if (espaciales.length === 0) return null;

  const minFila = Math.min(...espaciales.map((n) => n.transform.df)) - 1;
  const minColumna = Math.min(...espaciales.map((n) => n.transform.dc)) - 1;
  const maxFila = Math.max(...espaciales.map((n) => n.transform.df + n.filas)) + 1;
  const maxColumna = Math.max(...espaciales.map((n) => n.transform.dc + n.columnas)) + 1;
  const columnasMundo = Math.max(1, maxColumna - minColumna);
  const filasMundo = Math.max(1, maxFila - minFila);

  const utilAncho = Math.max(1, ancho - padding * 2);
  const utilAlto = Math.max(1, alto - padding * 2);
  const escala = Math.min(
    ESCALA_MAX,
    Math.max(ESCALA_MIN, Math.min(utilAncho / columnasMundo, utilAlto / filasMundo)),
  );
  const offset = {
    x: padding + (utilAncho - columnasMundo * escala) / 2,
    y: padding + (utilAlto - filasMundo * escala) / 2,
  };

  return {
    escala,
    offset,
    bounds: { minFila, maxFila, minColumna, maxColumna },
    nodos: espaciales.map((nodo) => ({
      nodo,
      x: offset.x + (nodo.transform.dc - minColumna) * escala,
      y: offset.y + (nodo.transform.df - minFila) * escala,
      w: nodo.columnas * escala,
      h: nodo.filas * escala,
      descubierto: descubiertos.has(nodo.id),
    })),
  };
}

export function proyectarMapa(
  layout: LayoutMapa,
  fila: number,
  columna: number,
): { x: number; y: number } {
  return {
    x: layout.offset.x + (columna - layout.bounds.minColumna) * layout.escala,
    y: layout.offset.y + (fila - layout.bounds.minFila) * layout.escala,
  };
}
