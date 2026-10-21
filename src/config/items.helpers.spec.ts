import { ITEMS } from './items';
import { equipoVacio, pesoTotal } from '../core/equipo';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const oro = ITEMS.oro;
assert(!!oro, 'el catálogo incluye oro');
assert(oro.tipo === 'material', 'el oro es material');
assert(oro.peso === 0.01, 'el oro pesa 0.01 kg por moneda');
assert(oro.apilable === true, 'el oro se apila');
assert(Math.abs(pesoTotal(equipoVacio(), { oro: 100 }) - 1) < 1e-9, '100 monedas pesan 1 kg');

console.log('items.helpers: todas las comprobaciones pasan');
