import { anadirLinea, quitarLinea, agotado } from './truequeModelo';
import type { CestaTrade } from '../core/intercambio';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) {
    throw new Error(`FALLO: ${mensaje}`);
  }
  ok++;
}

// anadirLinea: nueva y fusionada
{
  const c: CestaTrade = anadirLinea([], 'pocion_vida', 2, 10);
  assert(c.length === 1 && c[0].id === 'pocion_vida' && c[0].cantidad === 2, 'línea nueva se añade');
  const c2 = anadirLinea(c, 'pocion_vida', 3, 10);
  assert(c2.length === 1 && c2[0].cantidad === 5, 'línea existente se fusiona (2+3=5)');
  assert(c[0].cantidad === 2, 'la cesta original no se muta');
}

// anadirLinea: clamp por stock y por apilable
{
  const c = anadirLinea(anadirLinea([], 'pocion_vida', 4, 5), 'pocion_vida', 4, 5);
  assert(c[0].cantidad === 5, 'cantidad clamp al stock máximo (5)');
  const e = anadirLinea([], 'espada_corta', 3, 2);
  assert(e[0].cantidad === 1, 'no-apilable se clampa a 1 aunque pida 3');
  const d = anadirLinea(anadirLinea([], 'daga', 1, 2), 'daga', 1, 2);
  assert(d[0].cantidad === 1, 'daga duplicada sigue en 1');
}

// anadirLinea: id desconocido → cesta intacta
{
  const c = anadirLinea([], 'pocion_vida', 1, 5);
  const c2 = anadirLinea(c, 'desconocido_z', 2, 5);
  assert(c2.length === 1 && c2[0].id === 'pocion_vida', 'id desconocido se ignora');
}

// quitarLinea
{
  const c: CestaTrade = [{ id: 'pocion_vida', cantidad: 2 }, { id: 'flecha', cantidad: 7 }];
  const r = quitarLinea(c, 'pocion_vida');
  assert(r.length === 1 && r[0].id === 'flecha', 'quitarLinea elimina solo esa línea');
  assert(c.length === 2, 'original sin mutar');
  const r2 = quitarLinea(r, 'no_existe');
  assert(r2.length === 1, 'quitar id ausente no rompe');
}

// agotado
{
  const c: CestaTrade = [{ id: 'pocion_vida', cantidad: 5 }];
  assert(agotado(c, 'pocion_vida', 5), 'agotado true cuando la cesta alcanzó el stock');
  assert(!agotado(c, 'pocion_vida', 9), 'agotado false con margen');
  assert(!agotado([], 'pocion_vida', 9), 'cesta vacía nunca agotada');
}

console.log(`\n${ok}/${total} asserts de truequeModelo en verde`);