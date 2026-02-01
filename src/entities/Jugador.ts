import { EntidadRPG } from './EntidadRPG';
import { CameraOffset, GameConfig, IGame, ActionType, IActionPacket } from '../types';
import { eliminarMurosEntre } from '../world/generation';

export class Jugador extends EntidadRPG {
  pasosDesdeUltimoDano: number = 0;
  tienePico: boolean = false;
  ultimaCasillaAtacada: {f: number, c: number} | null = null;
  ultimaInteraccion: number = 0;

  constructor(nombre: string = "Jugador") {
    super(0, 0, nombre);
    this.generarStats();
  }

  generarStats() {
    this.fuerza = Math.floor(Math.random() * 10) + 1;
    this.agilidad = Math.floor(Math.random() * 10) + 1;
    this.inteligencia = Math.floor(Math.random() * 10) + 1;
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

  dibujar(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP } = config;
    const x = (this.visualColumna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const y = (this.visualFila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;
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

    const ahora = Date.now();
    if (ahora - this.ultimaInteraccion < 100) return false;
    this.ultimaInteraccion = ahora;

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
            // Transferencia de vida es una acción especial, por ahora la dejamos directa
            // o podríamos convertirla a ACTION. Para simplificar, la dejamos así.
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
        const packet: IActionPacket = {
            t: Date.now(),
            p: game.network.idLocalNumerico,
            a: ActionType.HIT,
            d: (enemigoEnCasilla as any).id
        };
        if (game.esHost) game.encolarAccion(packet);
        else if (game.network.activo) game.network.enviarMensaje({ tipo: 'action', a: packet });
        return false;
    }

    if (this.enCombateCon) {
      if (!game.intentarRehuirCombate(this)) {
        return false;
      }
    }

    let sigF = sigFila;
    let sigC = sigColumna;
    let fueraDeLimites = sigF < 0 || sigF >= game.config.NUMERO_FILAS || sigC < 0 || sigC >= game.config.NUMERO_COLUMNAS;

    if (fueraDeLimites && !this.tienePico) return false;

    let esMovimientoValido = false;
    if (!fueraDeLimites) {
        const celdaActual = game.mapaLaberinto[this.fila][this.columna];
        if (deltaFila === -1 && !celdaActual.muros.superior && game.mapaLaberinto[sigF][sigC].esTransitable) esMovimientoValido = true;
        if (deltaFila === 1 && !celdaActual.muros.inferior && game.mapaLaberinto[sigF][sigC].esTransitable) esMovimientoValido = true;
        if (deltaColumna === -1 && !celdaActual.muros.izquierdo && game.mapaLaberinto[sigF][sigC].esTransitable) esMovimientoValido = true;
        if (deltaColumna === 1 && !celdaActual.muros.derecho && game.mapaLaberinto[sigF][sigC].esTransitable) esMovimientoValido = true;
    }

    if (!esMovimientoValido && this.tienePico) {
        // Si el host es quien está moviendo y es fuera de límites, asegurar dimensiones
        if (game.esHost && fueraDeLimites) {
            const nuevasCoords = (game as any).asegurarDimensionesMapa(sigF, sigC);
            sigF = nuevasCoords.f;
            sigC = nuevasCoords.c;
            // Después de expandir, ya no está fuera de límites en el nuevo mapa
            fueraDeLimites = false;
        } else if (!game.esHost && fueraDeLimites) {
            // Un cliente no puede expandir el mapa por sí solo, debe esperar al Host.
            // Pero puede enviar la intención de cavar si el Host lo permite.
            // Por ahora, solo el Host expande. Si el cliente pica al borde, el Host lo procesará.
        }

        if (fueraDeLimites) return false;

        const celdaObjetivo = game.mapaLaberinto[sigF][sigC];
        // Permitir excavar si no es movimiento válido (hay muro) incluso si la celda es transitable (bordes residuales)
        if (this.ultimaCasillaAtacada && this.ultimaCasillaAtacada.f === sigF && this.ultimaCasillaAtacada.c === sigC) {
            celdaObjetivo.golpesCavar++;
        } else {
            celdaObjetivo.golpesCavar = 1;
            this.ultimaCasillaAtacada = { f: sigF, c: sigC };
        }
        game.ui.crearTextoFlotanteEnCelda(sigF, sigC, `¡CLANC! ${celdaObjetivo.golpesCavar}/5`, "#aaaaaa", game);
        game.registrarEventoLog("Picas la roca...");

        if (celdaObjetivo.golpesCavar >= 5) {
            celdaObjetivo.esTransitable = true;
            celdaObjetivo.golpesCavar = 0;
            // Eliminar muros entre la celda actual y la excavada
            eliminarMurosEntre(game.mapaLaberinto[this.fila][this.columna], celdaObjetivo);
            game.registrarEventoLog("¡Has cavado una galería!");
            game.ui.crearTextoFlotanteEnCelda(sigF, sigC, "¡ABIERTO!", "#00ff00", game);
            if (game.network && game.network.activo) {
                game.network.enviarMensaje({
                    tipo: 'dig_completed',
                    f: sigF,
                    c: sigC,
                    fromF: this.fila,
                    fromC: this.columna
                });
            }
        }
        return false;
    }

    if (esMovimientoValido) {
      this.fila = sigFila;
      this.columna = sigColumna;

      const packet: IActionPacket = {
          t: Date.now(),
          p: game.network.idLocalNumerico,
          a: ActionType.MOVE,
          d: [this.fila, this.columna, true]
      };
      if (game.esHost) game.encolarAccion(packet);
      else if (game.network.activo) game.network.enviarMensaje({ tipo: 'action', a: packet });

      const celdaNueva = game.mapaLaberinto[this.fila][this.columna];
      this.ultimaCasillaAtacada = null;

      // Pico
      if (celdaNueva.tienePico) {
        this.tienePico = true;
        celdaNueva.tienePico = false;
        game.registrarEventoLog("¡Has encontrado un pico! Ahora puedes cavar galerías.");
        game.ui.mostrarNotificacionGrande("¡PICO OBTENIDO! Puedes cavar golpeando muros 5 veces.", "#ffff00", 5000);
        if (game.network && game.network.activo) {
            game.network.enviarMensaje({ tipo: 'pick_collected', f: this.fila, c: this.columna });
        }
      }

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
        const ahoraB = Date.now();
        if (ahoraB > this.inmunidadHasta) {
          this.inmunidadHasta = ahoraB + 30000;
          game.registrarEventoLog(`¡Burbuja de inmunidad activada (30s)!`);
          game.ui.mostrarNotificacionGrande(`DESTINO: ${celdaNueva.burbuja.destino}`, "#00ffff", 5000);
        }
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

      return true;
    }
    return false;
  }
}
