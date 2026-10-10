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
