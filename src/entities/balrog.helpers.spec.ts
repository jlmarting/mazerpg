import { EnemigoNPC } from './EnemigoNPC';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const balrog = new EnemigoNPC(5, 5, 'Balrog', 'Balrog', 1000, 'dificil');
assert(balrog.fuerza === 18 && balrog.agilidad === 6 && balrog.inteligencia === 10, 'stats fijas del Balrog');
assert(balrog.vidaMaxima === 200 && balrog.vidaActual === 200, 'vida 200');
assert(balrog.puntosExperiencia === 500, 'XP 500');
assert(balrog.radioDeVisionIA === 10, 'visión 10');
assert(balrog.escalaVisual === 1.5, 'escala visual 1,5');

const goblin = new EnemigoNPC(1, 1, 'Goblin', 'Goblin', 1, 'dificil');
assert(goblin.escalaVisual === 1, 'el resto de mobs no escala');

balrog.recibirDano(999);
assert(balrog.estaVivo === false && balrog.vidaActual === 0, 'el Balrog muere');

console.log('balrog.helpers: todas las comprobaciones pasan');
