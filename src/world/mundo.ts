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
        case 'alimento':
          celda.alimento = cambio.valor as Celda['alimento'];
          return true;
        case 'tienePico':
          celda.tienePico = cambio.valor as boolean;
          return true;
        case 'burbuja':
          celda.burbuja = cambio.valor as Celda['burbuja'];
          return true;
      }
      return true;
    case 'conector':
      celda.conectorId = cambio.accion === 'añadir' ? cambio.conector.id : null;
      return true;
  }
}

export function resolverLWW(actual: DeltaMundo | null, entrante: DeltaMundo): DeltaMundo {
  if (!actual) return entrante;
  return entrante.tick >= actual.tick ? entrante : actual;
}
