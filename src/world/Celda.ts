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
  golpesCavar: number = 0;
  tipoEscenario: 'ninguno' | 'puerta' | 'trampa' = 'ninguno';
  estadoEscenario: string = 'idle';

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
