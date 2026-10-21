import { Celda } from './Celda';
import { elegirCeldaLejos, elegirCeldaParaLlave } from './spawn';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function mapa(): Celda[][] {
  const m = Array.from({ length: 10 }, (_, f) =>
    Array.from({ length: 10 }, (_, c) => new Celda(f, c)),
  );
  for (let f = 1; f < 9; f++) {
    for (let c = 1; c < 9; c++) m[f][c].esTransitable = true;
  }
  return m;
}

const m = mapa();
const lejos = elegirCeldaLejos(m, { fila: 1, columna: 1 }, 5, () => 0.5);
if (!lejos) throw new Error('lejos null');
assert(Math.abs(lejos.fila - 1) + Math.abs(lejos.columna - 1) >= 5, 'elige lejos');
assert(lejos.fila >= 1 && lejos.columna >= 1 && lejos.fila <= 8 && lejos.columna <= 8, 'celda transitable');

m[5][5].cofre = 'hierro';
const llave = elegirCeldaParaLlave(m, 5, 5);
if (!llave) throw new Error('llave null');
assert(llave.fila !== 5 || llave.columna !== 5, 'no suelta sobre el cofre');

const sinSalida = mapa();
for (let f = 1; f < 9; f++) {
  for (let c = 1; c < 9; c++) sinSalida[f][c].esTransitable = false;
}
sinSalida[5][5].esTransitable = true;
sinSalida[5][5].cofre = 'hierro';
assert(elegirCeldaParaLlave(sinSalida, 5, 5) === null, 'sin celda libre devuelve null');

console.log('spawn.helpers: todas las comprobaciones pasan');
