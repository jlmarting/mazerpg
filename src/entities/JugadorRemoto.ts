import { EntidadRPG } from './EntidadRPG';
import type { AparienciaAvatar } from '../core/avatarTintes';
import type { InventarioGuardado } from '../core/inventario';

export class JugadorRemoto extends EntidadRPG {
  public id: string;
  public clase: string = 'guerrero';
  public apariencia?: AparienciaAvatar;
  /** Equipo/mochila del remoto (recibido por red; sin uso visual aún). */
  public inventario?: InventarioGuardado;
  constructor(fila: number, columna: number, nombre: string, id: string) {
    super(fila, columna, nombre);
    this.id = id;
  }


  recibirDano(cantidad: number, _atacante?: EntidadRPG | null): number {
    return super.recibirDano(cantidad, _atacante);
  }
}
