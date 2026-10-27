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

for (const id of ['llave_hierro', 'llave_acero', 'llave_titanio']) {
  const it = ITEMS[id];
  assert(!!it && it.tipo === 'material' && it.peso === 0.05 && it.apilable, `llave ${id} material 0,05 kg`);
}

const resurreccion = ITEMS.pocima_resurreccion;
assert(!!resurreccion, 'el catálogo incluye la pócima de resurrección');
assert(resurreccion.tipo === 'consumible', 'la pócima de resurrección es consumible');
assert(resurreccion.apilable === true, 'la pócima de resurrección se apila');
assert(resurreccion.curacion === undefined, 'la pócima de resurrección no cura por sí sola');
assert(Math.abs(resurreccion.peso - 0.3) < 1e-9, 'la pócima de resurrección pesa 0,3 kg');

const mapa = ITEMS.mapa;
assert(!!mapa, 'el catálogo incluye el mapa');
assert(mapa.tipo === 'herramienta', 'el mapa es una herramienta');
assert(mapa.peso === 0, 'el mapa no pesa');
assert(mapa.apilable === false, 'el mapa no se apila');
assert(mapa.accion === 'abrir_mapa', 'el mapa abre el mapamundi');
assert(mapa.comerciable === false, 'el mapa no se puede comerciar');

console.log('items.helpers: todas las comprobaciones pasan');
