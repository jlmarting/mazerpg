import { Celda } from './Celda';
import { GestorMundo, tipoDesdeNombre } from './GestorMundo';
import { generarNodo } from './generadores';
import { HousingLocal } from './housing';
import {
  aplicarDelta,
  type ConectorMundo,
  type DeltaMundo,
  type GenSpec,
  type NodoMundo,
} from './mundo';

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

export interface SembradoMundo {
  nodoActivoId: string;
  nodoHijo: NodoMundo;
  conectorInter: ConectorMundo;
  casa: NodoMundo;
  portalHousing: ConectorMundo;
}

function celdasTransitables(celdas: Celda[][]): Array<{ fila: number; columna: number }> {
  const puntos: Array<{ fila: number; columna: number }> = [];
  for (let f = 0; f < celdas.length; f++) {
    const fila = celdas[f];
    for (let c = 0; c < fila.length; c++) {
      if (fila[c].esTransitable) puntos.push({ fila: f, columna: c });
    }
  }
  return puntos;
}

function hashCadena(texto: string): number {
  let hash = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function semillaDerivada(base: number, etiqueta: string): number {
  const seed = (base ^ hashCadena(etiqueta)) >>> 0;
  return seed === base ? (seed + 1) >>> 0 : seed;
}

/**
 * C1: siembra mínima y determinista de la fase 1 para que la travesía de nodos
 * y el portal de housing sean alcanzables en el juego real:
 *  - un conector de salida desde un celda transitable del nodo activo hacia un
 *    nodo hijo generado con otro generador (`abierto`);
 *  - un nodo personal (casa) del dueño local y su portal en el nodo activo.
 * Ambos extremos quedan en celdas transitables. Idempotente por nodo/conector.
 */
export function sembrarMundoBase(params: {
  gestor: GestorMundo;
  housing: HousingLocal;
  idLocal: string;
  filas: number;
  columnas: number;
}): SembradoMundo | null {
  const { gestor, housing, idLocal, filas, columnas } = params;
  const raiz = gestor.mundo.get(gestor.nodoActivoId);
  if (!raiz) return null;

  const origenTransitables = celdasTransitables(raiz.celdas);
  if (origenTransitables.length === 0) return null;
  if (filas <= 0 || columnas <= 0) return null;

  const celdaOrigen = origenTransitables[0];

  let celdaOrigenCasa = origenTransitables[origenTransitables.length - 1];
  if (celdaOrigenCasa.fila === celdaOrigen.fila && celdaOrigenCasa.columna === celdaOrigen.columna) {
    const alternativas = [
      { fila: 0, columna: 0 },
      { fila: 0, columna: columnas - 1 },
      { fila: filas - 1, columna: 0 },
      { fila: filas - 1, columna: columnas - 1 },
    ];
    celdaOrigenCasa =
      alternativas.find((p) => p.fila !== celdaOrigen.fila || p.columna !== celdaOrigen.columna) ??
      { fila: 0, columna: 0 };
    raiz.celdas[celdaOrigenCasa.fila][celdaOrigenCasa.columna].esTransitable = true;
  }

  const idHijo = 'zona-abierto-1';
  let hijo = gestor.mundo.get(idHijo);
  if (!hijo) {
    const genHijo: GenSpec = {
      nombre: 'abierto',
      version: 1,
      seed: semillaDerivada(raiz.gen.seed, idHijo),
      params: {},
    };
    hijo = {
      id: idHijo,
      padreId: raiz.id,
      transform: { df: 0, dc: 0 },
      filas,
      columnas,
      tipo: 'abierto',
      gen: genHijo,
      celdas: generarNodo(genHijo, filas, columnas),
      ownerId: null,
    };
    gestor.mundo.set(hijo.id, hijo);
  }

  const destinoTransitables = celdasTransitables(hijo.celdas);
  const celdaDestinoInter = destinoTransitables[0] ?? { fila: 0, columna: 0 };

  const conectorInter: ConectorMundo = {
    id: 'conector-zona-abierto-1',
    tipo: 'salida',
    nodoOrigenId: raiz.id,
    filaO: celdaOrigen.fila,
    columnaO: celdaOrigen.columna,
    nodoDestinoId: hijo.id,
    filaD: celdaDestinoInter.fila,
    columnaD: celdaDestinoInter.columna,
    housingOwnerId: null,
  };
  gestor.registrarConector(conectorInter);
  raiz.celdas[celdaOrigen.fila][celdaOrigen.columna].esPortal = true;

  const idCasa = `casa-${idLocal}`;
  let casa = gestor.mundo.get(idCasa);
  if (!casa) {
    const genCasa: GenSpec = {
      nombre: 'planta',
      version: 1,
      seed: semillaDerivada(raiz.gen.seed, idCasa),
      params: {},
    };
    casa = {
      id: idCasa,
      padreId: raiz.id,
      transform: { df: 0, dc: 0 },
      filas,
      columnas,
      tipo: 'personal',
      gen: genCasa,
      celdas: generarNodo(genCasa, filas, columnas),
      ownerId: idLocal,
    };
    gestor.mundo.set(casa.id, casa);
  }

  const casaTransitables = celdasTransitables(casa.celdas);
  const celdaDestinoCasa = casaTransitables[0] ?? { fila: 0, columna: 0 };

  const portalHousing = housing.crearPortalPersonal(
    casa,
    celdaDestinoCasa,
    raiz.id,
    celdaOrigenCasa,
  );
  gestor.registrarPortalPersonal(portalHousing);
  housing.guardarCasa(casa);

  return { nodoActivoId: raiz.id, nodoHijo: hijo, conectorInter, casa, portalHousing };
}
