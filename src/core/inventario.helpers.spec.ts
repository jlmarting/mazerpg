import { sanearEquipoGuardado, inventarioGuardadoVacio } from './inventario';
import { ITEMS } from '../config/items';

function assert(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(mensaje);
}

// Vacío: todas las ranuras a null, bulto y mochila vacíos, y sin compartir referencias
const v1 = inventarioGuardadoVacio();
const v2 = inventarioGuardadoVacio();
assert(v1.formato === 1, 'formato 1');
assert(Object.values(v1.puesto).every((x) => x === null), 'puesto vacío');
assert(v1.bulto.length === 0 && Object.keys(v1.mochila).length === 0, 'bulto y mochila vacíos');
assert(v1.bulto !== v2.bulto && v1.puesto !== v2.puesto, 'no comparte referencias');

// Formato inválido o ausente → null (el llamador conserva su estado por defecto: retrocompat)
assert(sanearEquipoGuardado(null) === null, 'null → null');
assert(sanearEquipoGuardado({ bulto: ['daga'] }) === null, 'sin formato → null');
assert(sanearEquipoGuardado({ formato: 2 }) === null, 'formato ≠ 1 → null');

// Formato 1 válido: saneado campo a campo
const g = sanearEquipoGuardado({
  formato: 1,
  puesto: { cabeza: 'casco_hierro', torso: 'no_existe', mano_izquierda: 'arco_largo', escudo: 'pocion_vida' },
  bulto: ['daga', 'daga', 'pocion_vida', 'no_existe', 'espada_corta'],
  mochila: { flecha: 3, pocion_vida: 0, basura: 9, espada_corta: 1 },
});
assert(g !== null, 'formato 1 válido se acepta');
assert(g!.puesto.cabeza === 'casco_hierro', 'pieza válida se conserva');
assert(g!.puesto.torso === null, 'id desconocido en ranura → null');
assert(g!.puesto.mano_izquierda === null, 'arma a dos manos en mano izquierda → null');
assert(g!.puesto.escudo === null, 'no-equipo en ranura de equipo → null');
assert(JSON.stringify(g!.bulto) === JSON.stringify(['daga', 'daga', 'espada_corta']), 'bulto: conserva duplicados + solo equipo válido');
assert(g!.mochila.flecha === 3, 'mochila válida se conserva');
assert(g!.mochila.pocion_vida === undefined && g!.mochila.basura === undefined && g!.mochila.espada_corta === undefined, 'mochila: descarta 0/desconocidos/equipo');

// bulto no-array → vacío; mochila no-objeto → vacía
const g2 = sanearEquipoGuardado({ formato: 1, puesto: {}, bulto: 'daga', mochila: 42 });
assert(Array.isArray(g2!.bulto) && g2!.bulto.length === 0, 'bulto no-array → []');
assert(Object.keys(g2!.mochila).length === 0, 'mochila no-objeto → {}');

// ITEMS se usa como catálogo por defecto
assert(ITEMS['casco_hierro'].tipo === 'equipo', 'catálogo real disponible');

console.log('inventario.helpers: todas las comprobaciones pasan');
