import { SpriteManager } from './SpriteManager';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) {
    throw new Error(`FALLO: ${mensaje}`);
  }
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

// definirSpriteCanvas registra un canvas como sprite dibujable
{
  const sm = new SpriteManager();
  const falsoCanvas = { width: 16, height: 16 } as unknown as HTMLCanvasElement;
  sm.definirSpriteCanvas('tinte:prueba', falsoCanvas);
  const info = sm.obtenerSprite('tinte:prueba');
  assert(info !== undefined, 'definirSpriteCanvas registra el sprite');
  assert(info !== undefined && info.sw === 16 && info.sh === 16, 'el sprite canvas conserva dimensiones');
}

// eliminarSprite lo retira del mapa
{
  const sm = new SpriteManager();
  const falsoCanvas = { width: 8, height: 8 } as unknown as HTMLCanvasElement;
  sm.definirSpriteCanvas('tinte:borrar', falsoCanvas);
  sm.eliminarSprite('tinte:borrar');
  assert(sm.obtenerSprite('tinte:borrar') === undefined, 'eliminarSprite retira el sprite');
}

console.log(`\n${ok}/${total} asserts de spriteManager en verde`);
