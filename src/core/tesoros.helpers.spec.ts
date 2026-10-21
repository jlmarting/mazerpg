import { puedeAbrirCofre, oroDeCofre, llaveDeCofre } from './tesoros';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(oroDeCofre('hierro') === 10 && oroDeCofre('acero') === 30 && oroDeCofre('titanio') === 100, 'oro por tipo');
assert(llaveDeCofre('hierro') === 'llave_hierro', 'llave de hierro');
assert(puedeAbrirCofre('hierro', {}) === false, 'sin llave no se abre');
assert(puedeAbrirCofre('hierro', { llave_acero: 1 }) === false, 'llave de otro tipo no abre');
assert(puedeAbrirCofre('hierro', { llave_hierro: 1 }) === true, 'con su llave se abre');
assert(puedeAbrirCofre('acero', { llave_acero: 3 }) === true, 'la llave es reutilizable');
assert(puedeAbrirCofre('titanio', { llave_titanio: 1 }) === true, 'la llave de titanio abre su cofre');
assert(oroDeCofre('titanio') === 100, 'cofre de titanio 100 monedas');

console.log('tesoros.helpers: todas las comprobaciones pasan');
