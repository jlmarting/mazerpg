import { EntidadRPG } from './EntidadRPG';
import { IGame } from '../types';

export class Jugador extends EntidadRPG {
  pasosDesdeUltimoDano: number = 0;
  tienePico: boolean = false;
  ultimaCasillaAtacada: {f: number, c: number} | null = null;
  ultimaInteraccion: number = 0;
  ultimaVezHabilidad: { fireball: number, bow: number, food: number, radar: number, whirlwind: number, freeze: number } = { fireball: 0, bow: 0, food: 0, radar: 0, whirlwind: 0, freeze: 0 };
  clase: string = 'guerrero';
  color: string = '#007bff';
  spriteKey: string = 'player_idle';

  constructor(nombre: string = "Jugador") {
    super(0, 0, nombre);
    this.generarStats();
  }

  generarStats(nuevaClase?: string) {
    if (nuevaClase) this.clase = nuevaClase;

    this.fuerza = Math.floor(Math.random() * 10) + 1;
    this.agilidad = Math.floor(Math.random() * 10) + 1;
    this.inteligencia = Math.floor(Math.random() * 10) + 1;

    // Aplicar bonus por clase ANTES del balanceo para que influyan en el resultado final
    if (this.clase === 'guerrero') {
        this.fuerza += 3;
        this.agilidad += 1;
    } else if (this.clase === 'explorador') {
        this.agilidad += 4;
    } else if (this.clase === 'mago') {
        this.inteligencia += 6;
    }

    let sum = this.fuerza + this.agilidad + this.inteligencia;

    if (sum > 24) {
      const exceso = sum - 24;
      if (this.fuerza >= this.agilidad && this.fuerza >= this.inteligencia) {
        this.fuerza -= exceso;
      } else if (this.agilidad >= this.fuerza && this.agilidad >= this.inteligencia) {
        this.agilidad -= exceso;
      } else {
        this.inteligencia -= exceso;
      }
    } else if (sum < 6) {
      if (this.fuerza >= this.agilidad && this.fuerza >= this.inteligencia) {
        this.fuerza = 15;
      } else if (this.agilidad >= this.fuerza && this.agilidad >= this.inteligencia) {
        this.agilidad = 15;
      } else {
        this.inteligencia = 15;
      }
    } else if (sum < 9) {
      if (this.fuerza <= this.agilidad && this.fuerza <= this.inteligencia) {
        this.fuerza = 8;
      } else if (this.agilidad <= this.fuerza && this.agilidad <= this.inteligencia) {
        this.agilidad = 8;
      } else {
        this.inteligencia = 8;
      }
    }

    this.vidaMaxima = Math.floor(10 * ((this.fuerza * 2 + this.agilidad) / 3));
    this.vidaActual = this.vidaMaxima;
  }


  recibirDano(cantidad: number, atacante?: EntidadRPG | null): number {
    if (Date.now() < this.inmunidadHasta) {
        return 0;
    }
    const result = super.recibirDano(cantidad, atacante);
    if (cantidad > 0) {
      this.pasosDesdeUltimoDano = 0;
    }
    return result;
  }

  intentarMover(deltaFila: number, deltaColumna: number, game: IGame): boolean {
    if (!this.estaVivo) return false;

    const ahora = Date.now();
    if (ahora - this.ultimaInteraccion < 100) return false;
    this.ultimaInteraccion = ahora;

    if (game.network && game.network.multiplayerActivo) {
        if (game.esHost) {
            (game as any).colaAcciones.push({ id: game.network.idLocal, accion: { tipo: 'mover', df: deltaFila, dc: deltaColumna } });
        } else {
            game.network.enviarMensaje({ tipo: 'action', accion: { tipo: 'mover', df: deltaFila, dc: deltaColumna } });
        }
        this.estaCaminando = true;
        return true;
    } else {
        // En modo solo, resolvemos inmediatamente usando la lógica de resolución centralizada
        (game as any).resolverAccion(game.network.idLocal, { tipo: 'mover', df: deltaFila, dc: deltaColumna });
        return true;
    }
  }
}
