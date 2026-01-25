import { EntidadRPG } from './EntidadRPG';

export class Jugador extends EntidadRPG {
  pasosDesdeUltimoDano: number = 0;

  constructor() {
    super(0, 0, "Jugador");
  }

  dibujar(ctx: CanvasRenderingContext2D, offset: { colOffset: number, filaOffset: number }, config: any) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP } = config;
    const x = (this.columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const y = (this.fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;
    const escala = TAMANO_CELDA * 0.6;

    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.arc(x, y - escala / 3, escala / 6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y - escala / 6);
    ctx.lineTo(x, y + escala / 6);
    ctx.stroke();

    let desfasePierna = 0;
    if (this.estaCaminando) {
      desfasePierna = Math.sin(Date.now() / 100) * (escala / 4);
    }

    ctx.beginPath();
    ctx.moveTo(x, y + escala / 6);
    ctx.lineTo(x - escala / 6 + desfasePierna, y + escala / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y + escala / 6);
    ctx.lineTo(x + escala / 6 - desfasePierna, y + escala / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - escala / 4, y);
    ctx.lineTo(x + escala / 4, y);
    ctx.stroke();

    ctx.shadowBlur = 10;
    ctx.shadowColor = '#007bff';
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  recibirDano(cantidad: number, _atacante?: EntidadRPG | null): number {
    this.vidaActual = Math.max(0, this.vidaActual - cantidad);
    if (cantidad > 0) {
      this.pasosDesdeUltimoDano = 0;
    }
    if (this.vidaActual <= 0) {
      this.estaVivo = false;
      this.vidaActual = 0;
    }
    return cantidad;
  }

  intentarMover(deltaFila: number, deltaColumna: number, game: any): boolean {
    if (!this.estaVivo) return false;

    const sigFila = this.fila + deltaFila;
    const sigColumna = this.columna + deltaColumna;

    const enemigoEnCasilla = game.listaDeEnemigos.find((e: any) => e.fila === sigFila && e.columna === sigColumna && e.estaVivo);
    if (enemigoEnCasilla) {
      if (this.enCombateCon === enemigoEnCasilla) {
        game.resolverRondaDeCombate(this, enemigoEnCasilla);
        return false;
      } else {
        game.iniciarCombate(this, enemigoEnCasilla);
        return false;
      }
    }

    if (this.enCombateCon) {
      if (game.intentarRehuirCombate(this)) {
        // Ok
      } else {
        return false;
      }
    }

    const celdaActual = game.mapaLaberinto[this.fila][this.columna];
    let esMovimientoValido = false;

    if (deltaFila === -1 && !celdaActual.muros.superior && game.mapaLaberinto[this.fila - 1][this.columna].esTransitable) esMovimientoValido = true;
    if (deltaFila === 1 && !celdaActual.muros.inferior && game.mapaLaberinto[this.fila + 1][this.columna].esTransitable) esMovimientoValido = true;
    if (deltaColumna === -1 && !celdaActual.muros.izquierdo && game.mapaLaberinto[this.fila][this.columna - 1].esTransitable) esMovimientoValido = true;
    if (deltaColumna === 1 && !celdaActual.muros.derecho && game.mapaLaberinto[this.fila][this.columna + 1].esTransitable) esMovimientoValido = true;

    if (esMovimientoValido) {
      this.fila += deltaFila;
      this.columna += deltaColumna;
      this.estaCaminando = true;
      this.ultimaVezMovido = Date.now();

      this.pasosDesdeUltimoDano++;
      if (this.pasosDesdeUltimoDano >= 10) {
        this.pasosDesdeUltimoDano = 0;
        if (this.vidaActual < this.vidaMaxima) {
          const probabilidad = ((this.fuerza * 4) + (this.agilidad * 2)) / 6;
          if (Math.random() * 100 < probabilidad) {
            this.vidaActual = Math.min(this.vidaMaxima, this.vidaActual + 1);
            game.crearTextoFlotanteEnCelda(this.fila, this.columna, "+1", "#00ff00");
            game.registrarEventoLog("Te sientes un poco mejor. +1 HP");
          }
        }
      }

      if (game.multiplayerActivo) {
        game.enviarMensaje({ tipo: 'posicion', f: this.fila, c: this.columna, cam: true, id: game.idLocal, nick: this.nombre });
      }
      return true;
    }
    return false;
  }
}
