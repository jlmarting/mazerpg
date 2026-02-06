import { EntidadRPG } from './EntidadRPG';
import { CameraOffset, GameConfig, IGame } from '../types';

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

  dibujar(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig, _mapaLaberinto?: any) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP } = config;
    const x = (this.columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const y = (this.fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;
    const escala = TAMANO_CELDA * 0.6;

    // Intentar obtener el SpriteManager desde el contexto o el objeto global
    const spriteManager = (window as any).game?.renderer?.spriteManager;
    const currentSprite = this.estaCaminando ? `player_${this.clase}_walk` : `player_${this.clase}_idle`;

    ctx.save();

    if (spriteManager && spriteManager.obtenerSprite(currentSprite) && this.estaVivo) {
        spriteManager.dibujarSprite(ctx, currentSprite, x - TAMANO_CELDA / 2, y - TAMANO_CELDA / 2, TAMANO_CELDA, TAMANO_CELDA);
    } else if (!this.estaVivo) {
        // Dibujar Lápida
        ctx.fillStyle = '#888';
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;

        // Base de la lápida
        const w = TAMANO_CELDA * 0.7;
        const h = TAMANO_CELDA * 0.8;
        ctx.beginPath();
        ctx.moveTo(x - w/2, y + h/2);
        ctx.lineTo(x - w/2, y - h/4);
        ctx.arc(x, y - h/4, w/2, Math.PI, 0);
        ctx.lineTo(x + w/2, y + h/2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Inscripción "RIP"
        ctx.fillStyle = '#444';
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('RIP', x, y + 2);
    } else {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        // Cabeza
        ctx.beginPath();
        ctx.arc(x, y - escala / 3, escala / 6, 0, Math.PI * 2);
        ctx.stroke();

        // Cuerpo
        ctx.beginPath();
        ctx.moveTo(x, y - escala / 6);
        ctx.lineTo(x, y + escala / 6);
        ctx.stroke();

        // Animación de piernas
        let desfasePierna = this.estaCaminando ? Math.sin(Date.now() / 100) * (escala / 4) : 0;

        // Pierna izquierda
        ctx.beginPath();
        ctx.moveTo(x, y + escala / 6);
        ctx.lineTo(x - escala / 6 + desfasePierna, y + escala / 2);
        ctx.stroke();

        // Pierna derecha
        ctx.beginPath();
        ctx.moveTo(x, y + escala / 6);
        ctx.lineTo(x + escala / 6 - desfasePierna, y + escala / 2);
        ctx.stroke();

        // Brazos
        ctx.beginPath();
        ctx.moveTo(x - escala / 4, y);
        ctx.lineTo(x + escala / 4, y);
        ctx.stroke();

        // Glow
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.stroke();

        // Inmunidad Glow
        if (Date.now() < this.inmunidadHasta) {
            ctx.beginPath();
            ctx.arc(x, y, TAMANO_CELDA / 2, 0, Math.PI * 2);
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#00ffff';
            ctx.stroke();
        }
    }

    ctx.restore();
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
