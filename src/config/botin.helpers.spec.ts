import { elegirBotin, TABLA_BOTIN } from './botin';

function assert(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(mensaje);
}

assert(TABLA_BOTIN.reduce((s, e) => s + e.peso, 0) === 100, 'los pesos suman 100');

const resurreccion = TABLA_BOTIN.find((e) => e.id === 'pocima_resurreccion');
if (!resurreccion) throw new Error('la tabla incluye la pócima de resurrección');
assert(resurreccion.peso === 2, 'la pócima de resurrección es rara (peso 2)');

// rng=0 → primer item (flecha) con cantidad mínima
const b0 = elegirBotin(() => 0, 1);
assert(b0[0].id === 'flecha', 'rng 0 → flecha');
assert(b0[0].cantidad === 2, 'cantidad mínima del rango (2)');

// rng≈1 → último item (anillo), cantidad 1
const b1 = elegirBotin(() => 0.999999, 1);
assert(b1[0].id === 'anillo_fuerza', 'rng alto → anillo');
assert(b1[0].cantidad === 1, 'sin rango de cantidad → 1');

// cantidad en rango máximo
let i = 0;
const rngB3 = () => (i++ === 0 ? 0 : 0.999);
const b3 = elegirBotin(rngB3, 1);
assert(b3[0].id === 'flecha' && b3[0].cantidad === 5, 'cantidad máxima del rango (5)');

// varias tiradas
assert(elegirBotin(() => 0, 3).length === 3, 'veces=3 → 3 entradas');
assert(elegirBotin(() => 0, 0).length === 0, 'veces=0 → ninguna');

console.log('botin.helpers: todas las comprobaciones pasan');
