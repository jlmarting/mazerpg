import { calcularPuntuacion } from './puntuacion';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(calcularPuntuacion({ oro: 10, xp: 5, bajas: 2, segundos: 100 }) === 10 + 10 + 20 + 800, 'fórmula base');
assert(calcularPuntuacion({ oro: 0, xp: 0, bajas: 0, segundos: 1000 }) === 0, 'el tiempo no resta');
assert(calcularPuntuacion({ oro: 30, xp: 10, bajas: 0, segundos: 0 }) === 30 + 20 + 900, 'sin tiempo');

console.log('puntuacion.helpers: todas las comprobaciones pasan');
