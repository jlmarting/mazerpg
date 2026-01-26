import { EntidadRPG } from './EntidadRPG';
import { algoritmoBusquedaAStar } from '../utils/pathfinding';

export class EnemigoNPC extends EntidadRPG {
  id: number;
  tipo: string;
  ultimaVezActuadoIA: number = 0;
  radioDeVisionIA: number = 5;

  constructor(fila: number, columna: number, nombre: string, tipo: string, id: number) {
    super(fila, columna, nombre);
    this.id = id;
    this.tipo = tipo;
  }

  actualizarIA(game: any) {
    if (!this.estaVivo || this.enCombateCon || game.juegoTerminado) return;
    const ahora = Date.now();
    if (ahora - this.ultimaVezActuadoIA < 800) return;

    let objective = game.protagonista;
    const ruta = algoritmoBusquedaAStar(game.mapaLaberinto, this.fila, this.columna, objective.fila, objective.columna);
    if (ruta && ruta.length > 1 && ruta.length < this.radioDeVisionIA) {
      this.fila = ruta[1].fila;
      this.columna = ruta[1].columna;
    }
    this.ultimaVezActuadoIA = ahora;
  }

  dibujar(ctx: CanvasRenderingContext2D, offset: { colOffset: number, filaOffset: number }, config: any) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP } = config;
    const x = (this.columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const y = (this.fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;
    const escala = TAMANO_CELDA * 0.4;
    ctx.fillStyle = '#f00';
    ctx.beginPath();
    ctx.arc(x, y, escala, 0, Math.PI * 2);
    ctx.fill();
  }

  recibirDano(cantidad: number): number {
    this.vidaActual = Math.max(0, this.vidaActual - cantidad);
    if (this.vidaActual <= 0) this.estaVivo = false;
    return cantidad;
  }
}
