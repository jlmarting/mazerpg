import { Celda } from './world/Celda';
import { Jugador } from './entities/Jugador';
import { Renderer } from './core/Renderer';
import { UIManager } from './ui/UIManager';

class Game {
  public mapaLaberinto: Celda[][] = [];
  public protagonista: Jugador = new Jugador();
  private renderer: Renderer;
  private ui: UIManager = new UIManager();

  constructor() {
    const canvas = document.getElementById('mazeCanvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.iniciar();
  }

  iniciar() {
    console.log("Game started");
  }
}

new Game();
