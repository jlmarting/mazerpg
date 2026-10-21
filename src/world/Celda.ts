import type { TipoCofre, TipoLlave } from '../core/tesoros';

export interface Muros {
  superior: boolean;
  derecho: boolean;
  inferior: boolean;
  izquierdo: boolean;
}

export class Celda {
  fila: number;
  columna: number;
  ultimoAvistamiento: number;
  esTransitable: boolean;
  muros: Muros;
  visitada: boolean;
  alimento: { tipo: string, pc: number } | null = null;
  burbuja: { nombreSecreto: string, destino: string } | null = null;
  esPortal: boolean = false;
  tienePico: boolean = false;
  /** Cofre de tesoro: ocupa la celda (no transitable) hasta que se abre. */
  cofre: TipoCofre | null = null;
  cofreAbierto: boolean = false;
  /** Llave depositada en el suelo; se recoge al pisar. */
  llave: TipoLlave | null = null;
  /** Celda de salida del mapa (F4). */
  esSalida: boolean = false;
  golpesCavar: number = 0;
  tipoEscenario: 'ninguno' | 'puerta' | 'trampa' = 'ninguno';
  estadoEscenario: string = 'idle';
  conectorId: string | null = null;
  /** Material de suelo de interior (solo casa); null = dungeon. */
  sueloDecor: 'madera' | 'baldosa' | 'alfombra' | null = null;
  /** Mueble decorativo (solo casa); la celda con mueble es no transitable. */
  mueble: string | null = null;

  constructor(fila: number, columna: number) {
    this.fila = fila;
    this.columna = columna;
    this.ultimoAvistamiento = 0;
    this.esTransitable = false;
    this.muros = {
      superior: true,
      derecho: true,
      inferior: true,
      izquierdo: true
    };
    this.visitada = false;
  }
}
