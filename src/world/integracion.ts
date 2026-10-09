import { Celda } from './Celda';
import { GestorMundo, tipoDesdeNombre } from './GestorMundo';
import { generarNodo } from './generadores';
import { aplicarDelta, type DeltaMundo, type GenSpec, type NodoMundo } from './mundo';

export interface NodoPersistidoLike {
  gen: GenSpec;
  ownerId: string | null;
  deltas: DeltaMundo[];
  snapshot?: unknown;
  ultimaCompactacionTick?: number;
}

export interface PersistenciaMundoLike {
  listarNodos(): Promise<string[]>;
  cargarNodo(nodoId: string): Promise<NodoPersistidoLike | null>;
  guardarNodo(nodoId: string, gen: GenSpec, ownerId: string | null): Promise<void>;
}

export interface ArranqueMundoParams {
  gestor: GestorMundo;
  persistencia: PersistenciaMundoLike | null;
  filas: number;
  columnas: number;
  genPorDefecto: GenSpec;
}

export type PlanArranque = { tipo: 'crear' } | { tipo: 'cargar'; nodoId: string };

export interface ResultadoArranque {
  nodo: NodoMundo;
  cargado: boolean;
}

export function planificarArranque(nodos: string[]): PlanArranque {
  if (nodos.length === 0) return { tipo: 'crear' };
  const nodoId = nodos.includes('raiz') ? 'raiz' : nodos[0];
  return { tipo: 'cargar', nodoId };
}

export function celdasCompatibilidad(gestor: GestorMundo, respaldo: Celda[][]): Celda[][] {
  const nodo = gestor.mundo.get(gestor.nodoActivoId);
  return nodo ? nodo.celdas : respaldo;
}

export function aplicarDeltaConPersistencia(
  gestor: GestorMundo,
  respaldo: Celda[][],
  delta: DeltaMundo,
  esHost: boolean,
  persistir: (delta: DeltaMundo) => void,
): boolean {
  const aplicado = gestor.nodoActivoId
    ? gestor.aplicarDelta(delta)
    : aplicarDelta(respaldo, delta);
  if (!aplicado) return false;
  if (esHost) persistir(delta);
  return true;
}

function materializarNodo(
  gestor: GestorMundo,
  nodoId: string,
  persistido: NodoPersistidoLike,
  filas: number,
  columnas: number,
): NodoMundo {
  // Fase 1: el formato del snapshot de compactación no está definido, así que un nodo
  // compactado no se puede reconstruir. Se rechaza explícitamente en lugar de perder
  // silenciosamente los cambios compactados (el llamador cae a un mundo nuevo).
  if ((persistido.ultimaCompactacionTick ?? 0) > 0) {
    throw new Error(`Nodo ${nodoId} compactado: snapshot no soportado en fase 1`);
  }
  const celdas = generarNodo(persistido.gen, filas, columnas);
  for (const delta of persistido.deltas) {
    aplicarDelta(celdas, delta);
  }
  const nodo: NodoMundo = {
    id: nodoId,
    padreId: null,
    transform: { df: 0, dc: 0 },
    filas,
    columnas,
    tipo: tipoDesdeNombre(persistido.gen.nombre),
    gen: persistido.gen,
    celdas,
    ownerId: persistido.ownerId,
  };
  gestor.mundo.set(nodo.id, nodo);
  gestor.nodoActivoId = nodo.id;
  return nodo;
}

export async function arrancarMundoGestor(params: ArranqueMundoParams): Promise<ResultadoArranque> {
  const { gestor, persistencia, filas, columnas, genPorDefecto } = params;

  if (persistencia) {
    const nodos = await persistencia.listarNodos();
    const plan = planificarArranque(nodos);
    if (plan.tipo === 'cargar') {
      const persistido = await persistencia.cargarNodo(plan.nodoId);
      if (persistido) {
        return { nodo: materializarNodo(gestor, plan.nodoId, persistido, filas, columnas), cargado: true };
      }
    }
  }

  const raiz = gestor.crearMundoInicial(genPorDefecto, filas, columnas);
  if (persistencia) {
    await persistencia.guardarNodo(raiz.id, raiz.gen, raiz.ownerId);
  }
  return { nodo: raiz, cargado: false };
}
