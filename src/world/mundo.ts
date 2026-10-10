import { Celda } from './Celda';

export const FMT_DELTA = 1;

export interface GenSpec {
  nombre: string;
  version: number;
  seed: number;
  params: Record<string, number | string>;
}

export interface NodoMundo {
  id: string;
  padreId: string | null;
  transform: { df: number; dc: number };
  filas: number;
  columnas: number;
  tipo: 'mazmorra' | 'abierto' | 'planta' | 'natural' | 'personal';
  gen: GenSpec;
  celdas: Celda[][];
  ownerId: string | null;
}

export interface ConectorMundo {
  id: string;
  tipo: 'portal' | 'escalera' | 'salida' | 'entrada';
  nodoOrigenId: string;
  filaO: number;
  columnaO: number;
  nodoDestinoId: string;
  filaD: number;
  columnaD: number;
  housingOwnerId: string | null;
}

export type DeltaCambio =
  | { tipo: 'cavar' }
  | { tipo: 'escenario'; tipoEscenario: 'puerta' | 'trampa' | 'ninguno'; estado: string }
  | { tipo: 'objeto'; campo: 'alimento' | 'tienePico' | 'burbuja'; valor: unknown | null }
  | { tipo: 'decor'; campo: 'sueloDecor' | 'mueble'; valor: string | null }
  | { tipo: 'conector'; accion: 'añadir' | 'quitar'; conector: ConectorMundo };

export interface DeltaMundo {
  fmt: 1;
  nodoId: string;
  fila: number;
  columna: number;
  autoria: string;
  tick: number;
  cambio: DeltaCambio;
}

export interface EnemigoFoto {
  id: string;
  fila: number;
  columna: number;
  nombre: string;
  tipo: string;
  vidaActual: number;
  vidaMaxima: number;
}

export interface EscenarioFoto {
  fila: number;
  columna: number;
  tipoEscenario: string;
  estadoEscenario: string;
}

export interface SnapshotNodo {
  formato: 1;
  enemigos?: EnemigoFoto[];
  escenario?: EscenarioFoto[];
  celdas?: DeltaMundo[];
}

function esEnemigoFoto(bruto: unknown): bruto is EnemigoFoto {
  if (!bruto || typeof bruto !== 'object') return false;
  const foto = bruto as Record<string, unknown>;
  return (
    typeof foto.id === 'string' &&
    typeof foto.nombre === 'string' &&
    typeof foto.tipo === 'string' &&
    typeof foto.fila === 'number' && Number.isFinite(foto.fila) && foto.fila >= 0 &&
    typeof foto.columna === 'number' && Number.isFinite(foto.columna) && foto.columna >= 0 &&
    typeof foto.vidaActual === 'number' && Number.isFinite(foto.vidaActual) &&
    typeof foto.vidaMaxima === 'number' && Number.isFinite(foto.vidaMaxima) && foto.vidaMaxima >= 0
  );
}

function esEscenarioFoto(bruto: unknown): bruto is EscenarioFoto {
  if (!bruto || typeof bruto !== 'object') return false;
  const foto = bruto as Record<string, unknown>;
  return (
    typeof foto.fila === 'number' && Number.isFinite(foto.fila) && foto.fila >= 0 &&
    typeof foto.columna === 'number' && Number.isFinite(foto.columna) && foto.columna >= 0 &&
    typeof foto.tipoEscenario === 'string' &&
    typeof foto.estadoEscenario === 'string'
  );
}

function esDeltaEnCeldas(bruto: unknown): bruto is DeltaMundo {
  if (!bruto || typeof bruto !== 'object') return false;
  const delta = bruto as Record<string, unknown>;
  return (
    delta.fmt === FMT_DELTA &&
    typeof delta.nodoId === 'string' &&
    typeof delta.fila === 'number' && Number.isFinite(delta.fila) &&
    typeof delta.columna === 'number' && Number.isFinite(delta.columna) &&
    typeof delta.autoria === 'string' &&
    typeof delta.tick === 'number' && Number.isFinite(delta.tick) &&
    !!delta.cambio && typeof delta.cambio === 'object'
  );
}

/**
 * Lectura tolerante de un snapshot de nodo: solo acepta el formato versionado
 * (formato 1). Un formato futuro se ignora en piezas y un snapshot corrupto se
 * normaliza a vacío; las entradas malformadas de cada lista se descartan.
 */
export function leerSnapshotNodo(bruto: unknown): SnapshotNodo {
  const leido: SnapshotNodo = { formato: 1 };
  if (!bruto || typeof bruto !== 'object') return leido;
  const datos = bruto as Record<string, unknown>;
  if (typeof datos.formato === 'number' && datos.formato !== 1) return leido;
  if (Array.isArray(datos.enemigos)) leido.enemigos = datos.enemigos.filter(esEnemigoFoto);
  if (Array.isArray(datos.escenario)) leido.escenario = datos.escenario.filter(esEscenarioFoto);
  if (Array.isArray(datos.celdas)) leido.celdas = datos.celdas.filter(esDeltaEnCeldas);
  return leido;
}

/**
 * Restauración fiel de enemigos desde el snapshot del nodo: posiciones y vidas
 * tal cual (los muertos con vidaActual 0 siguen muertos para el llamador, que
 * es quien decide `estaVivo`). Con `dims` (M3) se acota la foto a la rejilla
 * del destino: las entradas fuera de rango se DESCARTAN (no se inventa
 * posición — un enemigo fuera de rejilla no se reubica). Devuelve [] si no
 * hay foto; el llamador entonces deja la siembra por gen como está.
 */
export function restaurarEnemigos<T>(
  snapshot: unknown,
  crear: (foto: EnemigoFoto) => T,
  dims?: { filas: number; columnas: number },
): T[] {
  const foto = leerSnapshotNodo(snapshot);
  if (!foto.enemigos) return [];
  const reconstruidos: T[] = [];
  for (const d of foto.enemigos) {
    if (dims) {
      const fuera =
        d.fila < 0 || d.columna < 0 ||
        d.fila >= dims.filas || d.columna >= dims.columnas;
      if (fuera) continue;
    }
    const vidaMaxima = Math.max(0, Math.floor(d.vidaMaxima));
    const vidaActual = Math.min(Math.max(0, Math.floor(d.vidaActual)), vidaMaxima);
    reconstruidos.push(
      crear({
        id: d.id,
        fila: d.fila,
        columna: d.columna,
        nombre: d.nombre,
        tipo: d.tipo,
        vidaActual,
        vidaMaxima,
      }),
    );
  }
  return reconstruidos;
}

/**
 * Clave de plegado LWW: (fila, columna, tipo, campo). Los deltas del MISMO
 * tipo+campo sobre la misma celda compiten entre sí; los tipos/campos DISTINTOS
 * de la misma celda son ortogonales y coexisten (cavar + objeto.alimento +
 * decor.mueble + escenario). Notas: dentro de 'objeto' (y 'decor') el campo es
 * parte de la clave; 'cavar'/'conector' no tienen campo (clave solo tipo, un
 * celda tiene un conector); 'escenario' escribe un único par (tipoEscenario,
 * estado) por celda, así que todos sus deltas se pliegan entre sí y el ganador
 * conserva la pareja del último.
 */
function clavePlegado(delta: DeltaMundo): string {
  const cambio = delta.cambio;
  switch (cambio.tipo) {
    case 'objeto':
    case 'decor':
      return `${delta.fila}:${delta.columna}:${cambio.tipo}:${cambio.campo}`;
    case 'cavar':
    case 'escenario':
    case 'conector':
      return `${delta.fila}:${delta.columna}:${cambio.tipo}`;
  }
}

/**
 * Fusión LWW de listas de deltas con clave (fila, columna, tipo, campo) usando
 * resolverLWW: la lista posterior pisa a la anterior solo con tick >= (empate
 * -> entrante). Sin efectos ortogonales perdidos: al aplicar el plegado sobre
 * el gen, cada campo/escenario de la celda recupera su último writer.
 */
export function consolidarCeldasLWW(listas: DeltaMundo[][]): DeltaMundo[] {
  const porClave = new Map<string, DeltaMundo>();
  for (const lista of listas) {
    for (const delta of lista) {
      const clave = clavePlegado(delta);
      porClave.set(clave, resolverLWW(porClave.get(clave) ?? null, delta));
    }
  }
  return Array.from(porClave.values());
}

export function aplicarDelta(celdas: Celda[][], delta: DeltaMundo): boolean {
  const { fila, columna } = delta;
  if (fila < 0 || fila >= celdas.length) return false;
  const filaCeldas = celdas[fila];
  if (!filaCeldas || columna < 0 || columna >= filaCeldas.length) return false;
  const celda = filaCeldas[columna];
  if (!celda) return false;

  const cambio = delta.cambio;
  switch (cambio.tipo) {
    case 'cavar':
      celda.esTransitable = true;
      return true;
    case 'escenario':
      celda.tipoEscenario = cambio.tipoEscenario;
      celda.estadoEscenario = cambio.estado;
      return true;
    case 'objeto':
      switch (cambio.campo) {
        case 'alimento': {
          const valor = cambio.valor;
          if (valor === null) {
            celda.alimento = null;
            return true;
          }
          if (
            typeof valor === 'object' &&
            typeof (valor as { tipo?: unknown }).tipo === 'string' &&
            typeof (valor as { pc?: unknown }).pc === 'number'
          ) {
            celda.alimento = {
              tipo: (valor as { tipo: string }).tipo,
              pc: (valor as { pc: number }).pc,
            };
            return true;
          }
          return false;
        }
        case 'tienePico':
          if (typeof cambio.valor !== 'boolean') return false;
          celda.tienePico = cambio.valor;
          return true;
        case 'burbuja': {
          const valor = cambio.valor;
          if (valor === null) {
            celda.burbuja = null;
            return true;
          }
          if (
            typeof valor === 'object' &&
            typeof (valor as { nombreSecreto?: unknown }).nombreSecreto === 'string' &&
            typeof (valor as { destino?: unknown }).destino === 'string'
          ) {
            celda.burbuja = {
              nombreSecreto: (valor as { nombreSecreto: string }).nombreSecreto,
              destino: (valor as { destino: string }).destino,
            };
            return true;
          }
          return false;
        }
      }
      return true;
    case 'decor': {
      const valor = cambio.valor || null;
      if (cambio.campo === 'sueloDecor') {
        if (valor !== null && valor !== 'madera' && valor !== 'baldosa' && valor !== 'alfombra') {
          return false;
        }
        celda.sueloDecor = valor;
      } else {
        celda.mueble = valor;
      }
      return true;
    }
    case 'conector':
      celda.conectorId = cambio.accion === 'añadir' ? cambio.conector.id : null;
      return true;
  }
}

export function resolverLWW(actual: DeltaMundo | null, entrante: DeltaMundo): DeltaMundo {
  if (!actual) return entrante;
  return entrante.tick >= actual.tick ? entrante : actual;
}

export function conTickAutor(
  base: Omit<DeltaMundo, 'tick'>,
  tickAutor: number | null | undefined,
  fallbackTick: number,
): DeltaMundo {
  return { ...base, tick: tickAutor ?? fallbackTick };
}

/**
 * Contrato mínimo de historia rehidratable: el doc del espejo local
 * (DocNodoLocal) y el nodo persistido de Firestore (NodoPersistidoLike) lo
 * cumplen estructuralmente. El `snapshot` viaja crudo (unknown) desde
 * Firestore y se valida con la lectura tolerante.
 */
export interface HistoriaNodo {
  snapshot?: unknown;
  deltas?: DeltaMundo[] | null;
}

/**
 * Rehidratación de un nodo (espejo local y materialización tras cruce en
 * Firebase, mismo ciclo que materializarNodo): primero las celdas ya plegadas
 * del snapshot (una por celda+tipo+campo, consolidadas) y después los deltas
 * no plegados ordenados por tick, para que el último writer gane por campo.
 * Entradas malformadas se descartan y los fuera de rango se ignoran.
 */
export function rehidratarHistoria(
  nodoCeldas: Celda[][],
  historia: HistoriaNodo | null | undefined,
): void {
  const plegadas = leerSnapshotNodo(historia?.snapshot).celdas ?? [];
  for (const delta of plegadas) aplicarDelta(nodoCeldas, delta);
  const brutas = leerSnapshotNodo({ formato: FMT_DELTA, celdas: historia?.deltas ?? [] }).celdas ?? [];
  for (const delta of brutas.slice().sort((a, b) => a.tick - b.tick)) aplicarDelta(nodoCeldas, delta);
}
