import { Jugador } from './Jugador';
import { equipoVacio } from '../core/equipo';
import { ITEMS } from '../config/items';

function assert(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(mensaje);
}

// Crear un jugador y fijar la base (los stats base los sirve generarStats con azar)
const j = new Jugador('Test');
j.fuerza = 10;
j.agilidad = 5;
j.inteligencia = 3;

// --- Estado inicial ---
assert(JSON.stringify(j.equipo) === JSON.stringify(equipoVacio()), 'sin equipo al crear');
assert(j.inventario.pocion_vida === 3 && j.inventario.flecha === 20, 'mochila inicial sembrada');
let st = j.statsEfectivos();
assert(st.fuerza === 10 && st.agilidad === 5 && st.vida === 0, 'sin equipo los stats efectivos son la base');

// --- Equipar: bonos sobre la base (sin mutarla) ---
j.equiparItem('casco_hierro');
st = j.statsEfectivos();
assert(st.fuerza === 11, 'casco +1 FUE');
assert(j.fuerza === 10, 'la base no se muta');
assert(j.apariencia.piezas.casco === 'casco', 'el casco viste al avatar');
assert(j.apariencia.piezas.torso === null, 'las demás ranuras quedan intactas');

// --- El pelo es cosmético y el equipo no lo toca ---
j.apariencia.piezas.pelo = 'pelo-largo';
j.equiparItem('peto_cuero');
assert(j.apariencia.piezas.pelo === 'pelo-largo', 'equipar conserva el pelo');
assert(j.apariencia.piezas.torso === 'peto', 'el peto viste el torso');

// --- Vida máxima: base + bonus de vida del equipo ---
const vidaSinEscudo = j.vidaMaxima;
j.equiparItem('escudo_madera');
assert(j.vidaMaxima === vidaSinEscudo + 5, 'escudo +5 vida máxima');
j.desequiparRanura('escudo');
assert(j.vidaMaxima === vidaSinEscudo, 'desequipar revierte la vida máxima');

// --- Desequipar revierte piezas ---
j.desequiparRanura('torso');
assert(j.apariencia.piezas.torso === null, 'desequipar quita la pieza del avatar');
assert(j.apariencia.piezas.pelo === 'pelo-largo', 'desequipar conserva el pelo');

// --- Empuñadura desde el jugador ---
j.equiparItem('escudo_madera');
j.equiparItem('arco_largo');
assert(j.equipo.escudo === null && j.equipo.mano_derecha === 'arco_largo', 'arco a dos manos desaloja el escudo');
st = j.statsEfectivos();
assert(st.agilidad === j.agilidad + 3, 'arco +3 AGI');

// --- Mochila: consumir y añadir ---
j.consumirItem('pocion_vida', 1);
assert(j.inventario.pocion_vida === 2, 'consumir descuenta una poción');
j.anadirItem('flecha', 5);
assert(j.inventario.flecha === 25, 'añadir acumula flechas');

// --- Usar consumible: cura y se gasta (in-game) ---
j.vidaActual = 1;
const pocionesAntes = j.inventario.pocion_vida;
const usado = j.usarItem('pocion_vida');
assert(usado, 'usar devuelve true con efecto');
assert(j.vidaActual === Math.min(j.vidaMaxima, 1 + ITEMS.pocion_vida.curacion!), 'la poción cura 25 (con tope en vida máxima)');
assert(j.inventario.pocion_vida === pocionesAntes - 1, 'la poción usada se gasta');
j.vidaActual = j.vidaMaxima;
j.usarItem('pocion_vida');
assert(j.vidaActual === j.vidaMaxima, 'usar a vida llena no la supera');
assert(j.usarItem('flecha') === false, 'un material no se usa');
assert(j.usarItem('no_existe') === false, 'un desconocido no se usa');

// --- Loot: el botín llena bulto y mochila; el arco gasta flechas ---
const j2 = new Jugador('Loot');
const bultoIni = j2.bulto.length;
assert(bultoIni > 0, 'kit inicial en el bulto');
j2.recibirBotin([
  { id: 'espada_corta', cantidad: 1 },
  { id: 'flecha', cantidad: 4 },
  { id: 'espada_corta', cantidad: 1 },
  { id: 'no_existe', cantidad: 1 },
]);
assert(j2.bulto.includes('espada_corta'), 'el equipo del botín va al bulto');
assert(j2.bulto.filter((x) => x === 'espada_corta').length === 1, 'el equipo no se duplica en el bulto');
assert(j2.inventario.flecha === 24, 'el material del botín se apila (20+4)');
j2.equiparItem('daga');
j2.recibirBotin([{ id: 'daga', cantidad: 1 }]);
assert(j2.bulto.filter((x) => x === 'daga').length === 1, 'no duplica equipo ya poseído/equipado');

assert(j2.consumirFlecha() && j2.inventario.flecha === 23, 'el arco consume una flecha');
j2.inventario = { ...j2.inventario, flecha: 0 };
assert(j2.consumirFlecha() === false, 'sin flechas no se dispara');

console.log('jugadorEquipo.helpers: todas las comprobaciones pasan');
