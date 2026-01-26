export class Renderer {
  private ctx: CanvasRenderingContext2D;
  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }
  limpiar() { this.ctx.clearRect(0,0,1000,1000); }
  dibujarLaberinto(mapa: any, offset: any, config: any) {
    // Logic ...
  }
  dibujarUI(config: any) {
    // Logic ...
  }
  getCtx() { return this.ctx; }
}
