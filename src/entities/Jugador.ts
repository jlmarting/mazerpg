import { EntidadRPG } from './EntidadRPG';
import { CameraOffset, GameConfig, IGame } from '../types';

export class Jugador extends EntidadRPG {
  pasosDesdeUltimoDano: number = 0;

  constructor(nombre: string = "Jugador") {
    super(0, 0, nombre);
  }

  dibujar(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP } = config;
    const x = (this.columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const y = (this.fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;
    const escala = TAMANO_CELDA * 0.6;

    ctx.save();

    if (!this.estaVivo) {
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
        ctx.strokeStyle = '#007bff';
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
        ctx.shadowColor = '#007bff';
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

    const sigFila = this.fila + deltaFila;
    const sigColumna = this.columna + deltaColumna;

    let jugadorRemotoEnCasilla: any = null;
    let jugadorId: string = "";
    game.network.jugadoresRemotos.forEach((v: any, k: string) => {
        if (v.entidad && v.entidad.fila === sigFila && v.entidad.columna === sigColumna) {
            jugadorRemotoEnCasilla = v.entidad;
            jugadorId = k;
        }
    });

    if (jugadorRemotoEnCasilla) {
        const interactions = (this.consecutiveInteractions.get(jugadorId) || 0) + 1;
        if (interactions >= 2 && this.estaVivo && jugadorRemotoEnCasilla.estaVivo) {
            this.consecutiveInteractions.set(jugadorId, 0);
            if (this.vidaActual > 1) {
                this.vidaActual -= 1;
                jugadorRemotoEnCasilla.vidaActual = Math.min(jugadorRemotoEnCasilla.vidaMaxima, jugadorRemotoEnCasilla.vidaActual + 1);
                game.registrarEventoLog(`Has transferido 1 HP a ${jugadorRemotoEnCasilla.nombre}`);
                game.ui.crearTextoFlotanteEnCelda(this.fila, this.columna, "-1 HP", "#ff0000", game);
                game.ui.crearTextoFlotanteEnCelda(jugadorRemotoEnCasilla.fila, jugadorRemotoEnCasilla.columna, "+1 HP", "#00ff00", game);

                if (game.network && game.network.activo) {
                    game.network.enviarMensaje({
                        tipo: 'hp_transfer',
                        fromId: game.network.idLocal,
                        toId: jugadorId,
                        amount: 1
                    });
                    game.network.enviarMensaje({
                        tipo: 'hp_loss',
                        id: game.network.idLocal,
                        amount: 1
                    });
                }
            } else {
                game.registrarEventoLog("No tienes suficiente vida para transferir.");
            }
        } else {
            this.consecutiveInteractions.set(jugadorId, interactions);
            game.registrarEventoLog(`Interacción con ${jugadorRemotoEnCasilla.nombre} (${interactions}/2)`);
        }
        return false;
    }

    this.consecutiveInteractions.forEach((_v, k) => {
        if (k !== jugadorId) this.consecutiveInteractions.set(k, 0);
    });

    const enemigoEnCasilla = game.listaDeEnemigos.find((e: any) => e.fila === sigFila && e.columna === sigColumna && e.estaVivo);
    if (enemigoEnCasilla) {
      if (this.enCombateCon === enemigoEnCasilla) {
        game.resolverRondaDeCombate(this, enemigoEnCasilla);
      } else {
        game.iniciarCombate(this, enemigoEnCasilla);
      }
      return false;
    }

    if (this.enCombateCon) {
      if (!game.intentarRehuirCombate(this)) {
        return false;
      }
    }

    if (sigFila < 0 || sigFila >= game.config.NUMERO_FILAS || sigColumna < 0 || sigColumna >= game.config.NUMERO_COLUMNAS) return false;

    const celdaActual = game.mapaLaberinto[this.fila][this.columna];
    let esMovimientoValido = false;

    if (deltaFila === -1 && !celdaActual.muros.superior && game.mapaLaberinto[sigFila][sigColumna].esTransitable) esMovimientoValido = true;
    if (deltaFila === 1 && !celdaActual.muros.inferior && game.mapaLaberinto[sigFila][sigColumna].esTransitable) esMovimientoValido = true;
    if (deltaColumna === -1 && !celdaActual.muros.izquierdo && game.mapaLaberinto[sigFila][sigColumna].esTransitable) esMovimientoValido = true;
    if (deltaColumna === 1 && !celdaActual.muros.derecho && game.mapaLaberinto[sigFila][sigColumna].esTransitable) esMovimientoValido = true;

    if (esMovimientoValido) {
      this.fila = sigFila;
      this.columna = sigColumna;
      const celdaNueva = game.mapaLaberinto[this.fila][this.columna];

      // Alimentos
      if (celdaNueva.alimento) {
        const PC = celdaNueva.alimento.pc;
        const CC = ((3 * this.fuerza) + (2 * this.agilidad) + (1 * this.inteligencia)) / 6;
        const recuperacion = Math.floor(PC / CC);
        const finalHeal = Math.max(1, recuperacion);

        this.vidaActual = Math.min(this.vidaMaxima, this.vidaActual + finalHeal);
        game.registrarEventoLog(`Has comido ${celdaNueva.alimento.tipo}. Recuperas ${finalHeal} HP.`);
        game.ui.crearTextoFlotanteEnCelda(this.fila, this.columna, `+${finalHeal} HP`, "#00ff00", game);

        if (game.network && game.network.activo) {
            game.network.enviarMensaje({ tipo: 'food_consumed', f: this.fila, c: this.columna });
        }
        celdaNueva.alimento = null;
      }

      // Burbujas
      if (celdaNueva.burbuja) {
        this.inmunidadHasta = Date.now() + 30000;
        game.registrarEventoLog(`¡Burbuja de inmunidad activada (30s)!`);
        game.ui.mostrarNotificacionGrande(`¡INMUNE! (30s)`, "#00ffff", 5000);
      }

      this.estaCaminando = true;
      this.ultimaVezMovido = Date.now();

      (game as any).verificarPortal(this);

      this.pasosDesdeUltimoDano++;
      const factorDificultad = game.config.dificultad === 'facil' ? 1 : (game.config.dificultad === 'medio' ? 2 : 3);
      if (this.pasosDesdeUltimoDano >= 10 * factorDificultad) {
        this.pasosDesdeUltimoDano = 0;
        if (this.vidaActual < this.vidaMaxima) {
            this.vidaActual = Math.min(this.vidaMaxima, this.vidaActual + 1);
            game.ui.crearTextoFlotanteEnCelda(this.fila, this.columna, "+1", "#00ff00", game);
            game.registrarEventoLog("Te sientes un poco mejor. +1 HP");
        }
      }

      if (game.network && game.network.activo) {
        game.network.enviarMensaje({
          tipo: 'posicion',
          f: this.fila,
          c: this.columna,
          cam: true,
          id: game.network.idLocal,
          nick: this.nombre,
          hp: this.vidaActual,
          maxHp: this.vidaMaxima
        });
      }

      return true;
    }
    return false;
  }
}
