import { Celda } from './Celda';
import { GestorMundo, tipoDesdeNombre } from './GestorMundo';
import { dimensionesPlanta, generarNodo } from './generadores';
import { HousingLocal } from './housing';
import {
  aplicarDelta,
  type ConectorMundo,
  type DeltaMundo,
  type GenSpec,
  type NodoMundo,
} from './mundo';

export type ModoMultijugador = 'firebase' | 'http' | 'manual';

export interface EntornoAutoridad {
  modo: ModoMultijugador;
  esHost: boolean;
  firebaseMpActivo: boolean;
  httpMpActivo: boolean;
}

/**
 * Decide si el lado local es autoritativo (debe crear/sembrar el mundo) segun el
 * gestor de red del modo activo. Solo cede el invitado de un multiplayer activo:
 * firebase e http consultan su propio gestor; manual/solo siempre es autoritativo.
 */
export function esLadoAutoritativo(entorno: EntornoAutoridad): boolean {
  const { modo, esHost, firebaseMpActivo, httpMpActivo } = entorno;
  if (modo === 'http') return esHost || !httpMpActivo;
  if (modo === 'manual') return true;
  return esHost || !firebaseMpActivo;
}

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
  conectorInterVuelta: ConectorMundo;
  casa: NodoMundo;
  portalHousing: ConectorMundo;
  portalHousingVuelta: ConectorMundo;
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

/** Celda transitable más cercana al centro del mapa, distinta de `excluir`. */
function celdaCentral(
  puntos: Array<{ fila: number; columna: number }>,
  excluir: { fila: number; columna: number },
  filas: number,
  columnas: number,
): { fila: number; columna: number } {
  const cf = (filas - 1) / 2;
  const cc = (columnas - 1) / 2;
  let mejor = puntos[0];
  let mejorDist = Infinity;
  for (const p of puntos) {
    if (p.fila === excluir.fila && p.columna === excluir.columna) continue;
    const d = Math.abs(p.fila - cf) + Math.abs(p.columna - cc);
    if (d < mejorDist) {
      mejorDist = d;
      mejor = p;
    }
  }
  return mejor;
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
  /** Casa previamente guardada que el usuario eligió reutilizar (no se regenera). */
  casaPrevia?: NodoMundo | null;
}): SembradoMundo | null {
  const { gestor, housing, idLocal, filas, columnas, casaPrevia } = params;
  const raiz = gestor.mundo.get(gestor.nodoActivoId);
  if (!raiz) return null;

  const origenTransitables = celdasTransitables(raiz.celdas);
  if (origenTransitables.length === 0) return null;
  if (filas <= 0 || columnas <= 0) return null;

  const celdaOrigen = origenTransitables[0];

  // El portal de casa no debe caer en la salida del mapa (esquinas / marcador META):
  // se elige la celda transitable más céntrica, distinta del origen del conector de zona.
  const celdaOrigenCasa = celdaCentral(origenTransitables, celdaOrigen, filas, columnas);

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

  // Espejo de vuelta: desde la celda de llegada del hijo se regresa a la raíz.
  const conectorInterVuelta: ConectorMundo = {
    id: `${conectorInter.id}-vuelta`,
    tipo: 'entrada',
    nodoOrigenId: hijo.id,
    filaO: celdaDestinoInter.fila,
    columnaO: celdaDestinoInter.columna,
    nodoDestinoId: raiz.id,
    filaD: celdaOrigen.fila,
    columnaD: celdaOrigen.columna,
    housingOwnerId: null,
  };
  gestor.registrarPortalPersonal(conectorInterVuelta);

  const idCasa = `casa-${idLocal}`;
  let casa = gestor.mundo.get(idCasa) ?? null;
  if (!casa && casaPrevia) {
    // Casa recuperada del almacenamiento: se adopta tal cual (dims propias).
    casa = casaPrevia;
    gestor.mundo.set(casa.id, casa);
  }
  if (!casa) {
    // Casa contenida: plano de vivienda (retícula de habitaciones), no un mapa exterior.
    const paramsCasa = { habitacionesX: 3, habitacionesY: 2, sinAmbientales: 1 };
    const dimCasa = dimensionesPlanta(paramsCasa);
    const genCasa: GenSpec = {
      nombre: 'planta',
      version: 2,
      seed: semillaDerivada(raiz.gen.seed, idCasa),
      params: paramsCasa,
    };
    casa = {
      id: idCasa,
      padreId: raiz.id,
      transform: { df: 0, dc: 0 },
      filas: dimCasa.filas,
      columnas: dimCasa.columnas,
      tipo: 'personal',
      gen: genCasa,
      celdas: generarNodo(genCasa, dimCasa.filas, dimCasa.columnas),
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

  // Espejo de vuelta de la casa: pisando la celda de llegada se vuelve al mapa.
  const portalHousingVuelta: ConectorMundo = {
    id: `${portalHousing.id}-vuelta`,
    tipo: 'entrada',
    nodoOrigenId: casa.id,
    filaO: celdaDestinoCasa.fila,
    columnaO: celdaDestinoCasa.columna,
    nodoDestinoId: raiz.id,
    filaD: celdaOrigenCasa.fila,
    columnaD: celdaOrigenCasa.columna,
    housingOwnerId: idLocal,
  };
  gestor.registrarPortalPersonal(portalHousingVuelta);

  housing.guardarCasa(casa);

  return {
    nodoActivoId: raiz.id,
    nodoHijo: hijo,
    conectorInter,
    conectorInterVuelta,
    casa,
    portalHousing,
    portalHousingVuelta,
  };
}
