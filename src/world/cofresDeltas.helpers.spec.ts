import { Celda } from './Celda';
import { aplicarDelta, consolidarCeldasLWW, FMT_DELTA, type DeltaMundo } from './mundo';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function delta(f: number, c: number, tick: number, cambio: DeltaMundo['cambio']): DeltaMundo {
  return { fmt: FMT_DELTA, nodoId: 'raiz', fila: f, columna: c, autoria: 'test', tick, cambio };
}

function mapa(): Celda[][] {
  return Array.from({ length: 3 }, (_, f) =>
    Array.from({ length: 3 }, (_, c) => new Celda(f, c)),
  );
}

const celdas = mapa();
celdas[1][1].cofre = 'hierro';

const plegado = consolidarCeldasLWW([
  [delta(1, 1, 10, { tipo: 'cofre', abierto: false })],
  [delta(1, 1, 20, { tipo: 'cofre', abierto: true })],
]);
assert(plegado.length === 1 && plegado[0].tick === 20, 'LWW: gana el tick mayor');
assert(aplicarDelta(celdas, plegado[0]) === true && celdas[1][1].cofreAbierto === true, 'aplica cofre abierto');

celdas[1][1].llave = 'acero';
const llavePuesta = consolidarCeldasLWW([[delta(1, 1, 30, { tipo: 'objeto', campo: 'llave', valor: 'hierro' })]]);
assert(aplicarDelta(celdas, llavePuesta[0]) && String(celdas[1][1].llave) === 'hierro', 'fija llave');
const llaveQuitada = consolidarCeldasLWW([[delta(1, 1, 40, { tipo: 'objeto', campo: 'llave', valor: null })]]);
assert(aplicarDelta(celdas, llaveQuitada[0]) && celdas[1][1].llave === null, 'borra llave');

const invalida = delta(1, 1, 50, { tipo: 'objeto', campo: 'llave', valor: 'plomo' });
assert(aplicarDelta(celdas, invalida) === false, 'tipo de llave inválido rechazado');
const sinCofre = delta(0, 0, 60, { tipo: 'cofre', abierto: true });
assert(aplicarDelta(celdas, sinCofre) === false, 'no abre una celda sin cofre');

console.log('cofresDeltas.helpers: todas las comprobaciones pasan');
