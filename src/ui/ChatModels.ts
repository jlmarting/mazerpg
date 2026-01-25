export class TextoFlotante {
  x: number;
  y: number;
  texto: string;
  color: string;
  opacidad: number;
  vida: number;

  constructor(x: number, y: number, texto: string, color: string) {
    this.x = x;
    this.y = y;
    this.texto = texto;
    this.color = color;
    this.opacidad = 1.0;
    this.vida = 60;
  }

  actualizar() {
    this.y -= 0.5;
    this.vida--;
    this.opacidad = Math.max(0, this.vida / 60);
  }

  dibujar(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha = this.opacidad;
    ctx.fillStyle = this.color;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.texto, this.x, this.y);
    ctx.restore();
  }
}

export class MensajeChat {
  nombre: string;
  texto: string;
  esLocal: boolean;
  esVisible: boolean;
  vida: number;
  opacidad: number;
  posicionToast: string = 'arriba';
  progresoToast: number = 0;

  constructor(nombre: string, texto: string, esLocal: boolean, esVisible: boolean, emisorPos?: {f: number, c: number}, protagonistaPos?: {f: number, c: number}) {
    this.nombre = nombre;
    this.texto = texto;
    this.esLocal = esLocal;
    this.esVisible = esVisible;
    this.vida = 300;
    this.opacidad = 1.0;

    if (!esVisible && emisorPos && protagonistaPos) {
      this.posicionToast = this.calcularPosicionToast(emisorPos, protagonistaPos);
      this.progresoToast = 0;
    }
  }

  calcularPosicionToast(emisor: {f: number, c: number}, protagonista: {f: number, c: number}) {
    const df = emisor.f - protagonista.f;
    const dc = emisor.c - protagonista.c;

    if (Math.abs(dc) > Math.abs(df)) {
      return dc > 0 ? 'derecha' : 'izquierda';
    } else {
      return df > 0 ? 'abajo' : 'arriba';
    }
  }

  actualizar() {
    this.vida--;
    if (this.vida < 60) {
      this.opacidad = this.vida / 60;
    }
    if (!this.esVisible && this.progresoToast < 1) {
      this.progresoToast += 0.02;
    }
  }

  // dibujar methods will be in Renderer or UIManager
}
