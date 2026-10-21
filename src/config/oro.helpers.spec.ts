import { sortearOro, ORO_POR_TIPO } from './botin';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(sortearOro('Goblin', () => 0) === 1, 'Goblin con rng 0 → 1 moneda');
assert(sortearOro('Goblin', () => 0.999999) === 3, 'Goblin con rng alto → 3 monedas');
assert(sortearOro('Minotauro', () => 0) === 5, 'Minotauro con rng 0 → 5 monedas');
assert(sortearOro('Balrog', () => 0.999999) === 50, 'Balrog con rng alto → 50 monedas');
assert(sortearOro('Desconocido', () => 0) === 1, 'tipo desconocido → mínimo por defecto');
assert(sortearOro('Desconocido', () => 0.999999) === 2, 'tipo desconocido → máximo por defecto');
for (const [tipo, [min, max]] of Object.entries(ORO_POR_TIPO)) {
  assert(min >= 0 && min <= max, `rango válido para ${tipo}`);
}

console.log('oro.helpers: todas las comprobaciones pasan');
