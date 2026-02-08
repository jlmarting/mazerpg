import { EntidadRPG } from './EntidadRPG';

export class JugadorRemoto extends EntidadRPG {
  public id: string;
  public clase: string = 'guerrero';
  constructor(fila: number, columna: number, nombre: string, id: string) {
    super(fila, columna, nombre);
    this.id = id;
  }


  recibirDano(cantidad: number, _atacante?: EntidadRPG | null): number {
    return super.recibirDano(cantidad, _atacante);
  }
}
