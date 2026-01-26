import { EntidadRPG } from './EntidadRPG';
import { algoritmoBusquedaAStar } from '../utils/pathfinding';
import { CameraOffset, GameConfig } from '../types';
import { Celda } from '../world/Celda';

export class EnemigoNPC extends EntidadRPG {
  id: number;
  tipo: string;
  ultimaVezActuadoIA: number = 0;
  radioDeVisionIA: number = 5;

  constructor(fila: number, columna: number, nombre: string, tipo: string, id: number) {
    super(fila, columna, nombre);
    this.id = id;
    this.tipo = tipo;
    this.aplicarPenalizadores();
  }

  aplicarPenalizadores() {
    if (this.tipo === "Esqueleto") {
      this.modDano = -1;
      this.inteligencia = Math.max(1, this.inteligencia - 2);
      this.agilidad = Math.max(1, this.agilidad - 1);
      this.fuerza = Math.max(1, this.fuerza - 2);
      this.vidaMaxima = Math.max(1, this.vidaMaxima - 3);
      this.vidaActual = this.vidaMaxima;
    } else if (this.tipo === "Orco" || this.tipo === "Goblin") {
      this.inteligencia = Math.max(1, this.inteligencia - 1);
      this.fuerza = Math.max(1, this.fuerza - 2);
      this.vidaMaxima = Math.max(1, this.vidaMaxima - 3);
      this.vidaActual = this.vidaMaxima;
    }
  }

  actualizarIA(game: any) {
    if (!this.estaVivo || this.enCombateCon || game.juegoTerminado) return;

    const ahora = Date.now();
    if (ahora - this.ultimaVezActuadoIA < 800) return;

    let objetivoInteres = game.protagonista;
    let minD = Math.sqrt(Math.pow(this.fila - game.protagonista.fila, 2) + Math.pow(this.columna - game.protagonista.columna, 2));

    game.network.jugadoresRemotos.forEach((j: any) => {
      if (j.entidad && j.entidad.estaVivo) {
        const distRemoto = Math.sqrt(Math.pow(this.fila - j.entidad.fila, 2) + Math.pow(this.columna - j.entidad.columna, 2));
        if (distRemoto < minD) {
          minD = distRemoto;
          objetivoInteres = j.entidad;
        }
      }
    });

    if (minD <= this.radioDeVisionIA) {
      const ruta = algoritmoBusquedaAStar(game.mapaLaberinto, this.fila, this.columna, objetivoInteres.fila, objetivoInteres.columna);
      if (ruta && ruta.length > 1) {
        const siguientePaso = ruta[1];
        this.ejecutarMovimientoIA(siguientePaso.fila - this.fila, siguientePaso.columna - this.columna, game);
      } else {
        this.moverseHaciaJugadorDirectamente(objetivoInteres, game);
      }
    } else {
      this.vagarAleatoriamente(game);
    }
    this.ultimaVezActuadoIA = ahora;
  }

  moverseHaciaJugadorDirectamente(objetivo: any, game: any) {
    let dFila = 0, dColumna = 0;
    if (objetivo.fila > this.fila) dFila = 1;
    else if (objetivo.fila < this.fila) dFila = -1;

    if (objetivo.columna > this.columna) dColumna = 1;
    else if (objetivo.columna < this.columna) dColumna = -1;

    if (dFila !== 0 && this.puedeAtravesar(dFila, 0, game)) {
      this.ejecutarMovimientoIA(dFila, 0, game);
    } else if (dColumna !== 0 && this.puedeAtravesar(0, dColumna, game)) {
      this.ejecutarMovimientoIA(0, dColumna, game);
    } else {
      this.vagarAleatoriamente(game);
    }
  }

  vagarAleatoriamente(game: any) {
    const direcciones = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const direccionesValidas = direcciones.filter(d => this.puedeAtravesar(d[0], d[1], game));
    if (direccionesValidas.length > 0) {
      const d = direccionesValidas[Math.floor(Math.random() * direccionesValidas.length)];
      this.ejecutarMovimientoIA(d[0], d[1], game);
    }
  }

  puedeAtravesar(deltaFila: number, deltaColumna: number, game: any): boolean {
    const celdaActual = game.mapaLaberinto[this.fila][this.columna];
    if (deltaFila === -1 && celdaActual.muros.superior) return false;
    if (deltaFila === 1 && celdaActual.muros.inferior) return false;
    if (deltaColumna === -1 && celdaActual.muros.izquierdo) return false;
    if (deltaColumna === 1 && celdaActual.muros.derecho) return false;

    const sigFila = this.fila + deltaFila;
    const sigColumna = this.columna + deltaColumna;
    if (sigFila < 0 || sigFila >= game.config.NUMERO_FILAS || sigColumna < 0 || sigColumna >= game.config.NUMERO_COLUMNAS) return false;
    if (!game.mapaLaberinto[sigFila][sigColumna].esTransitable) return false;

    return true;
  }

  ejecutarMovimientoIA(deltaFila: number, deltaColumna: number, game: any) {
    const sigFila = this.fila + deltaFila;
    const sigColumna = this.columna + deltaColumna;

    let jugadorChocado = null;
    if (sigFila === game.protagonista.fila && sigColumna === game.protagonista.columna) {
      jugadorChocado = game.protagonista;
    } else {
      game.network.jugadoresRemotos.forEach((j: any) => {
        if (j.entidad && j.entidad.estaVivo && j.entidad.fila === sigFila && j.entidad.columna === sigColumna) {
          jugadorChocado = j.entidad;
        }
      });
    }

    if (jugadorChocado) {
      game.iniciarCombate(this, jugadorChocado);
    } else {
      this.fila = sigFila;
      this.columna = sigColumna;
    }

    if (game.esHost && game.network && game.network.activo) {
      game.network.enviarMensaje({
        tipo: 'npc_update',
        id: this.id,
        f: this.fila,
        c: this.columna,
        v: this.vidaActual
      });
    }
  }

  dibujar(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig, mapaLaberinto: Celda[][]) {
    const { colOffset, filaOffset } = offset;
    const { TAMANO_CELDA, ALTO_UI_TOP, TIEMPO_DESVANECIMIENTO_NIEBLA, vistaDebugActivada } = config;

    if (this.fila < filaOffset || this.fila >= filaOffset + config.CELDAS_VISIBLES_Y ||
        this.columna < colOffset || this.columna >= colOffset + config.CELDAS_VISIBLES_X) {
      return;
    }

    const celdaActual = mapaLaberinto[this.fila][this.columna];
    const tiempoDesdeVisto = Date.now() - celdaActual.ultimoAvistamiento;
    if (!vistaDebugActivada && (celdaActual.ultimoAvistamiento === 0 || tiempoDesdeVisto > TIEMPO_DESVANECIMIENTO_NIEBLA)) {
      return;
    }

    const x = (this.columna - colOffset) * TAMANO_CELDA + TAMANO_CELDA / 2;
    const y = (this.fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP + TAMANO_CELDA / 2;
    const escala = TAMANO_CELDA * 0.4;

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;

    if (this.tipo === "Esqueleto") {
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(x, y - escala/2, escala, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x - 3, y - escala/2, 2, 0, Math.PI * 2);
      ctx.arc(x + 3, y - escala/2, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.tipo === "Orco") {
      ctx.fillStyle = '#228B22';
      ctx.beginPath();
      ctx.rect(x - escala, y - escala, escala * 2, escala * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 2); ctx.lineTo(x - 2, y - 2); ctx.lineTo(x, y + 2);
      ctx.moveTo(x + 4, y + 2); ctx.lineTo(x + 2, y - 2); ctx.lineTo(x, y + 2);
      ctx.fill();
    } else if (this.tipo === "Goblin") {
      ctx.fillStyle = '#32CD32';
      ctx.beginPath();
      ctx.moveTo(x, y - escala * 1.5);
      ctx.lineTo(x - escala, y + escala);
      ctx.lineTo(x + escala, y + escala);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = '#8B4513';
      ctx.beginPath();
      ctx.rect(x - escala, y - escala, escala * 2, escala * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - escala, y - escala); ctx.lineTo(x - escala - 4, y - escala - 6);
      ctx.moveTo(x + escala, y - escala); ctx.lineTo(x + escala + 4, y - escala - 6);
      ctx.stroke();
    }
  }

  recibirDano(cantidad: number, _atacante?: EntidadRPG | null): number {
    const result = super.recibirDano(cantidad, _atacante);
    return result;
  }
}
