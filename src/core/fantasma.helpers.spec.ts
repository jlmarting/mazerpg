import {
  adyacenteAlCuerpo,
  calcularVidaResurreccion,
  debeTerminarPartida,
  elegirDestinoTeletransporte,
  esFantasma,
  esResucitable,
  puedeInteractuar,
} from './fantasma';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function distancia(a: { fila: number; columna: number }, b: { fila: number; columna: number }): number {
  return Math.abs(a.fila - b.fila) + Math.abs(a.columna - b.columna);
}

const vivo = { estadoVida: 'vivo' as const, fila: 0, columna: 0 };
const fantasma = { estadoVida: 'fantasma' as const, fila: 2, columna: 2 };
const fuera = { estadoVida: 'fuera' as const, fila: 3, columna: 3 };

assert(puedeInteractuar(vivo) === true, 'un vivo interactúa');
assert(puedeInteractuar(fantasma) === false, 'un fantasma no interactúa');
assert(puedeInteractuar(fuera) === false, 'un fuera no interactúa');
assert(puedeInteractuar({ fila: 0, columna: 0 }) === true, 'sin estado explícito se asume vivo');

assert(esFantasma(fantasma) === true, 'detecta fantasma');
assert(esFantasma(vivo) === false, 'un vivo no es fantasma');
assert(esResucitable(fantasma) === true, 'un fantasma es resucitable');
assert(esResucitable(vivo) === false, 'un vivo no es resucitable');
assert(esResucitable(fuera) === false, 'un fuera no es resucitable');

assert(calcularVidaResurreccion(100) === 50, '50 % de 100');
assert(calcularVidaResurreccion(7) === 3, 'redondeo hacia abajo');
assert(calcularVidaResurreccion(1) === 1, 'mínimo 1');
assert(calcularVidaResurreccion(0) === 1, 'mínimo 1 con vida máxima 0');

assert(adyacenteAlCuerpo({ fila: 2, columna: 2 }, { fila: 2, columna: 2 }) === true, 'misma celda');
assert(adyacenteAlCuerpo({ fila: 1, columna: 2 }, { fila: 2, columna: 2 }) === true, 'vecino norte');
assert(adyacenteAlCuerpo({ fila: 3, columna: 2 }, { fila: 2, columna: 2 }) === true, 'vecino sur');
assert(adyacenteAlCuerpo({ fila: 2, columna: 1 }, { fila: 2, columna: 2 }) === true, 'vecino oeste');
assert(adyacenteAlCuerpo({ fila: 2, columna: 3 }, { fila: 2, columna: 2 }) === true, 'vecino este');
assert(adyacenteAlCuerpo({ fila: 3, columna: 3 }, { fila: 2, columna: 2 }) === false, 'diagonal no');
assert(adyacenteAlCuerpo({ fila: 4, columna: 2 }, { fila: 2, columna: 2 }) === false, 'distancia 2 no');

const mapa = { filas: 10, columnas: 10 };
const jugadores = [{ fila: 5, columna: 5 }];

const destino = elegirDestinoTeletransporte({ ...mapa, jugadores, rng: () => 0 });
assert(destino !== null, 'hay destino con un jugador');
if (destino) {
  const d = distancia(destino, jugadores[0]);
  assert(d >= 1 && d <= 3, 'destino a 1–3 del jugador');
  assert(destino.fila >= 0 && destino.fila < 10 && destino.columna >= 0 && destino.columna < 10, 'destino dentro del mapa');
}

const ocupadas = new Set<string>();
for (let f = 0; f < 10; f++) for (let c = 0; c < 10; c++) ocupadas.add(`${f},${c}`);
const sinHueco = elegirDestinoTeletransporte({ ...mapa, jugadores, ocupadas });
assert(sinHueco === null, 'sin celdas libres no hay destino');

const sinJugadores = elegirDestinoTeletransporte({ ...mapa, jugadores: [] });
assert(sinJugadores === null, 'sin jugadores no hay destino');

const destino2 = elegirDestinoTeletransporte({ ...mapa, jugadores, rng: () => 0.999 });
assert(destino2 !== null && distancia(destino2, jugadores[0]) >= 1 && distancia(destino2, jugadores[0]) <= 3, 'rng alto sigue siendo válido');

assert(debeTerminarPartida([]) === false, 'roster vacío no termina');
assert(debeTerminarPartida(['fuera', 'fuera']) === true, 'todos fuera termina');
assert(debeTerminarPartida(['fuera', 'fantasma']) === false, 'un fantasma no cierra');
assert(debeTerminarPartida(['fuera', 'ausente']) === false, 'un ausente no cierra');
assert(debeTerminarPartida(['fuera', 'vivo']) === false, 'un vivo no cierra');

console.log('fantasma.helpers: todas las comprobaciones pasan');
