import { Celda } from './Celda';
import { GestorMundo, tipoDesdeNombre } from './GestorMundo';
import { dimensionesPlanta, generarNodo } from './generadores';
import { eliminarMurosEntre } from './generation';
import { HousingLocal } from './housing';
import {
  aplicarDelta,
  leerSnapshotNodo,
  rehidratarHistoria,
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
  const celdas = generarNodo(persistido.gen, filas, columnas);
  // Fase 2 (spec §1, ciclo 5): gen -> deltas plegados en snapshot.celdas (ya
  // consolidados por celda, se aplican en orden de array) -> deltas restantes
  // con tick > ultimaCompactacionTick. Un snapshot corrupto/sin formato degrada
  // a fase 1: gen + todos los deltas (sin perder durabilidad).
  const snapshotBruto = persistido.snapshot;
  const esFormatoUno =
    !!snapshotBruto &&
    typeof snapshotBruto === 'object' &&
    (snapshotBruto as Record<string, unknown>).formato === 1;
  const ultimaCompactacionTick = persistido.ultimaCompactacionTick ?? 0;
  if (esFormatoUno) {
    for (const delta of leerSnapshotNodo(snapshotBruto).celdas ?? []) {
      aplicarDelta(celdas, delta);
    }
    for (const delta of persistido.deltas) {
      if (delta.tick > ultimaCompactacionTick) aplicarDelta(celdas, delta);
    }
  } else {
    for (const delta of persistido.deltas) {
      aplicarDelta(celdas, delta);
    }
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
  gestor.reconstruirConectoresDesdeDeltas(nodo.id, persistido.deltas);
  return nodo;
}

/**
 * I1 (spec §1 ciclo 5, §3c): rehidratación de la historia del nodo destino tras
 * un cruce en el lado con persistenciaMundo. El destino llega materializado por
 * gen (`atravesar` -> `materializarDestino`) y sus deltas/snapshot en Firestore
 * quedan huérfanos; aquí se aplican sobre las celdas ya materializadas, ANTES
 * de que el mapa/objetos viajen al invitado (`enviarMapaAlInvitado`). El guard
 * anti-race (`nodoActivoId !== destinoId -> return`) es del llamador, invocado
 * justo antes. Sin persistenciaMundo (solo) lo cubre el espejo local: no se
 * duplica. Devuelve true solo si aplicó historia (nodo + doc + historia).
 */
export function rehidratarNodoTrasCruce(
  gestor: GestorMundo,
  destinoId: string,
  persistido: NodoPersistidoLike | null | undefined,
): boolean {
  const nodo = gestor.mundo.get(destinoId);
  if (!nodo || !persistido) return false;
  const plegadas = leerSnapshotNodo(persistido.snapshot).celdas ?? [];
  if (plegadas.length === 0 && (persistido.deltas ?? []).length === 0) return false;
  rehidratarHistoria(nodo.celdas, persistido);
  gestor.reconstruirConectoresDesdeDeltas(destinoId, persistido.deltas ?? []);
  return true;
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

/** Celda transitable más cercana (Manhattan) a un objetivo, o null si no hay. */
function celdaMasCercana(
  puntos: Array<{ fila: number; columna: number }>,
  fila: number,
  columna: number,
): { fila: number; columna: number } | null {
  let mejor: { fila: number; columna: number } | null = null;
  let mejorDist = Infinity;
  for (const p of puntos) {
    const d = Math.abs(p.fila - fila) + Math.abs(p.columna - columna);
    if (d < mejorDist) {
      mejorDist = d;
      mejor = p;
    }
  }
  return mejor;
}

/** Abre un camino en L (vertical y luego horizontal) entre dos celdas. */
function abrirCamino(
  celdas: Celda[][],
  desde: { fila: number; columna: number },
  hasta: { fila: number; columna: number },
): void {
  let f = desde.fila;
  let c = desde.columna;
  const marcar = (fila: number, columna: number): void => {
    const celda = celdas[fila]?.[columna];
    if (celda) celda.esTransitable = true;
  };
  marcar(f, c);
  while (f !== hasta.fila) {
    const nf = f + Math.sign(hasta.fila - f);
    const a = celdas[f]?.[c];
    const b = celdas[nf]?.[c];
    if (!a || !b) break;
    b.esTransitable = true;
    eliminarMurosEntre(a, b);
    f = nf;
  }
  while (c !== hasta.columna) {
    const nc = c + Math.sign(hasta.columna - c);
    const a = celdas[f]?.[c];
    const b = celdas[f]?.[nc];
    if (!a || !b) break;
    b.esTransitable = true;
    eliminarMurosEntre(a, b);
    c = nc;
  }
  marcar(hasta.fila, hasta.columna);
}

/**
 * Prepara una celda de borde para una costura y garantiza que sea alcanzable
 * desde el interior: elige la celda transitable más cercana y abre un camino.
 * `indiceObjetivo` es la fila (este/oeste) o columna (norte/sur) preferida.
 */
function prepararCeldaCostura(
  celdas: Celda[][],
  lado: 'norte' | 'sur' | 'este' | 'oeste',
  indiceObjetivo: number,
): { fila: number; columna: number } {
  const filas = celdas.length;
  const columnas = filas > 0 ? celdas[0].length : 0;
  let objetivo: { fila: number; columna: number };
  switch (lado) {
    case 'este':
      objetivo = { fila: Math.max(0, Math.min(filas - 1, indiceObjetivo)), columna: columnas - 1 };
      break;
    case 'oeste':
      objetivo = { fila: Math.max(0, Math.min(filas - 1, indiceObjetivo)), columna: 0 };
      break;
    case 'sur':
      objetivo = { fila: filas - 1, columna: Math.max(0, Math.min(columnas - 1, indiceObjetivo)) };
      break;
    case 'norte':
      objetivo = { fila: 0, columna: Math.max(0, Math.min(columnas - 1, indiceObjetivo)) };
      break;
  }

  const puntos = celdasTransitables(celdas);
  if (puntos.length === 0) {
    const celda = celdas[objetivo.fila]?.[objetivo.columna];
    if (celda) celda.esTransitable = true;
    return objetivo;
  }
  const desde = celdaMasCercana(puntos, objetivo.fila, objetivo.columna) ?? puntos[0];
  abrirCamino(celdas, desde, objetivo);
  return objetivo;
}

/**
 * Costura continua (B): además del conector canónico, registra un conector por
 * cada fila del borde este/oeste donde AMBOS lados son transitables. Así se
 * puede franquear en toda la franja de contacto con suelo en ambos nodos.
 */
function sembrarCosturaContinuaEste(
  gestor: GestorMundo,
  anterior: NodoMundo,
  nodo: NodoMundo,
  idBase: string,
  filaCanonica: number,
): void {
  const filas = Math.min(anterior.filas, nodo.filas);
  const colO = anterior.columnas - 1;
  // El transform relativo del destino fija el desfase de filas entre rejillas;
  // ignorarlo producía conectores con objetivo inválido (cruce roto).
  const dfRel = nodo.transform.df;
  for (let r = 0; r < filas; r++) {
    if (r === filaCanonica) continue;
    const filaD = r - dfRel;
    if (filaD < 0 || filaD >= nodo.filas) continue;
    const cO = anterior.celdas[r]?.[colO];
    const cD = nodo.celdas[filaD]?.[0];
    if (!cO || !cD || !cO.esTransitable || !cD.esTransitable) continue;
    const idIda = `${idBase}-c${r}`;
    if (gestor.conectores.has(idIda)) continue;
    gestor.registrarConector({
      id: idIda,
      tipo: 'salida',
      nodoOrigenId: anterior.id,
      filaO: r,
      columnaO: colO,
      nodoDestinoId: nodo.id,
      filaD,
      columnaD: 0,
      housingOwnerId: null,
      lado: 'este',
    });
    gestor.registrarConector({
      id: `${idIda}-vuelta`,
      tipo: 'entrada',
      nodoOrigenId: nodo.id,
      filaO: filaD,
      columnaO: 0,
      nodoDestinoId: anterior.id,
      filaD: r,
      columnaD: colO,
      housingOwnerId: null,
      lado: 'oeste',
    });
  }
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

  // Costura al este: se elige la celda transitable más cercana al borde derecho,
  // se talla un camino hasta el borde (para que sea alcanzable jugando) y se
  // prepara la llegada en el borde izquierdo del hijo a la misma fila.
  const cercanoEste = celdaMasCercana(
    origenTransitables,
    Math.floor(filas / 2),
    columnas - 1,
  ) ?? origenTransitables[0];
  const celdaOrigen = prepararCeldaCostura(raiz.celdas, 'este', cercanoEste.fila);
  const filaOrigen = celdaOrigen.fila;

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

  const filaDestino = Math.max(0, Math.min(hijo.filas - 1, filaOrigen));
  const celdaDestinoInter = prepararCeldaCostura(hijo.celdas, 'oeste', filaDestino);

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
    lado: 'este',
  };
  gestor.registrarConector(conectorInter);

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
    lado: 'oeste',
  };
  gestor.registrarConector(conectorInterVuelta);
  sembrarCosturaContinuaEste(gestor, raiz, hijo, conectorInter.id, celdaOrigen.fila);

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
  portalHousing.lado = null;
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
    lado: null,
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

/**
 * F4b: cadena determinista de zonas al este de `origenZona1`. Crea
 * `zona-abierto-2..N` con costuras este/oeste y transforms derivados; es
 * idempotente (no duplica nodos ni conectores).
 */
export function sembrarCadenaZonas(
  gestor: GestorMundo,
  origenZona1: NodoMundo,
  cantidad: number = 3,
  dimsZona: { filas: number; columnas: number } = { filas: 40, columnas: 40 },
): NodoMundo[] {
  const creadas: NodoMundo[] = [];
  let anterior = origenZona1;
  let filaEntrada = filaDeEntrada(gestor, origenZona1);

  for (let n = 2; n <= 1 + cantidad; n++) {
    const id = `zona-abierto-${n}`;
    let nodo = gestor.mundo.get(id) ?? null;
    if (!nodo) {
      const gen: GenSpec = {
        nombre: 'abierto',
        version: 1,
        seed: semillaDerivada(anterior.gen.seed, id),
        params: {},
      };
      nodo = {
        id,
        padreId: anterior.id,
        transform: { df: 0, dc: 0 },
        filas: dimsZona.filas,
        columnas: dimsZona.columnas,
        tipo: 'abierto',
        gen,
        celdas: generarNodo(gen, dimsZona.filas, dimsZona.columnas),
        ownerId: null,
      };
      gestor.mundo.set(nodo.id, nodo);
    }

    const idIda = `conector-zona-abierto-${n}`;
    if (!gestor.conectores.has(idIda)) {
      const filaO = Math.max(0, Math.min(anterior.filas - 1, filaEntrada));
      const filaD = Math.max(0, Math.min(nodo.filas - 1, filaEntrada));
      const origen = prepararCeldaCostura(anterior.celdas, 'este', filaO);
      const destino = prepararCeldaCostura(nodo.celdas, 'oeste', filaD);
      const ida: ConectorMundo = {
        id: idIda,
        tipo: 'salida',
        nodoOrigenId: anterior.id,
        filaO: origen.fila,
        columnaO: origen.columna,
        nodoDestinoId: nodo.id,
        filaD: destino.fila,
        columnaD: destino.columna,
        housingOwnerId: null,
        lado: 'este',
      };
      gestor.registrarConector(ida);
      const vuelta: ConectorMundo = {
        id: `${idIda}-vuelta`,
        tipo: 'entrada',
        nodoOrigenId: nodo.id,
        filaO: destino.fila,
        columnaO: destino.columna,
        nodoDestinoId: anterior.id,
        filaD: origen.fila,
        columnaD: origen.columna,
        housingOwnerId: null,
        lado: 'oeste',
      };
      gestor.registrarConector(vuelta);
      sembrarCosturaContinuaEste(gestor, anterior, nodo, idIda, origen.fila);
      filaEntrada = destino.fila;
    } else {
      const ida = gestor.conectores.get(idIda)!;
      filaEntrada = ida.filaD;
    }

    creadas.push(nodo);
    anterior = nodo;
  }
  return creadas;
}

/** Fila por la que se entra a una zona (su costura oeste); fallback al centro. */
function filaDeEntrada(gestor: GestorMundo, nodo: NodoMundo): number {
  for (const conector of gestor.conectores.values()) {
    if (conector.nodoDestinoId === nodo.id && conector.lado === 'este') return conector.filaD;
    if (conector.nodoOrigenId === nodo.id && conector.lado === 'oeste') return conector.filaO;
  }
  return Math.floor(nodo.filas / 2);
}
