import { Jugador } from './Jugador';
import { equipoVacio } from '../core/equipo';

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

console.log('jugadorEquipo.helpers: todas las comprobaciones pasan');
