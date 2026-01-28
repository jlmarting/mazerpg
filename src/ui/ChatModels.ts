export class TextoFlotante {
  constructor(public x: number, public y: number, public texto: string, public color: string) {}
  actualizar() { this.y -= 0.5; }
  dibujar(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.color;
    ctx.fillText(this.texto, this.x, this.y);
  }
}

export class MensajeChat {
  constructor(public nombre: string, public texto: string, public esLocal: boolean) {}
}
