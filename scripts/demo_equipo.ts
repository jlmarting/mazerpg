/**
 * Demo del dominio de equipo (piloto v1). Uso:
 *   esbuild --bundle scripts/demo_equipo.ts --format=esm --platform=node --outfile=/tmp/demo.mjs && node /tmp/demo.mjs
 */
import { ITEMS } from '../src/config/items';
import {
  equipoVacio, equipar, bonosEquipo, aplicarBonos, pesoTotal,
  anadirAlInventario, consumir, piezasDeEquipo, CAPACIDAD_BASE, type Equipo,
} from '../src/core/equipo';

const base = { fuerza: 10, agilidad: 5, inteligencia: 3 };
const set: [string, string][] = [
  ['casco_hierro', 'cabeza'], ['peto_cuero', 'torso'], ['botas_veloces', 'piernas'],
  ['espada_corta', 'mano_derecha'], ['escudo_madera', 'escudo'], ['anillo_fuerza', 'accesorio'],
];

let equipo: Equipo = equipoVacio();
console.log('== Equipar ==');
for (const [id] of set) {
  equipo = equipar(equipo, id);
  console.log(`  ${ITEMS[id].nombre.padEnd(18)} (${ITEMS[id].ranura})  bonos: ${JSON.stringify(ITEMS[id].bonos ?? {})}`);
}

const bonos = bonosEquipo(equipo);
const total = aplicarBonos(base, bonos);
console.log('\n== Stats ==');
console.log(`  base   FUE ${base.fuerza}  AGI ${base.agilidad}  INT ${base.inteligencia}`);
console.log(`  bonos  FUE +${bonos.fuerza}  AGI +${bonos.agilidad}  INT +${bonos.inteligencia}  VIDA +${bonos.vida}`);
console.log(`  TOTAL  FUE ${total.fuerza}  AGI ${total.agilidad}  INT ${total.inteligencia}`);

const inv = anadirAlInventario(anadirAlInventario({}, 'flecha', 20), 'pocion_vida', 3);
console.log('\n== Mochila ==');
console.log(`  ${inv.flecha} flechas · ${inv.pocion_vida} pociones  →  peso ${pesoTotal(equipo, inv).toFixed(1)}/${CAPACIDAD_BASE} kg`);
console.log(`  consumir 2 pociones → ${JSON.stringify(consumir(inv, 'pocion_vida', 2))}`);

console.log('\n== Aspecto (equipo → piezas del avatar) ==');
console.log(`  ${JSON.stringify(piezasDeEquipo(equipo))}`);

console.log('\n== Reglas de empuñadura ==');
let e2 = equipar(equipoVacio(), 'escudo_madera');
console.log(`  escudo solo:        ${JSON.stringify(e2)}`);
e2 = equipar(e2, 'arco_largo');
console.log(`  + arco 2 manos:     escudo → ${e2.escudo}, izq → ${e2.mano_izquierda} (desalojados)`);
e2 = equipar(e2, 'escudo_madera');
console.log(`  + escudo:           arma 2 manos → ${e2.mano_derecha} (desalojada)`);
e2 = equipar(e2, 'espada_corta');
console.log(`  + espada 1 mano:    ${e2.mano_derecha} + ${e2.escudo} conviven`);
