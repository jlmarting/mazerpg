import { Celda } from './Celda';
import { generarLaberintoBSP, mulberry32, type SalaBSP } from './generation';
import { generarNodo } from './generadores';
import { poblarTesoros } from './poblarTesoros';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function mapa(filas: number, columnas: number): Celda[][] {
  return Array.from({ length: filas }, (_, f) =>
    Array.from({ length: columnas }, (_, c) => new Celda(f, c)),
  );
}

function conectado(celdas: Celda[][]): boolean {
  const total = celdas.flat().filter((x) => x.esTransitable).length;
  let inicio: Celda | null = null;
  for (const fila of celdas) {
    for (const celda of fila) {
      if (celda.esTransitable) { inicio = celda; break; }
    }
    if (inicio) break;
  }
  if (!inicio) return true;
  const vistos = new Set<string>([`${inicio.fila},${inicio.columna}`]);
  const pila: Celda[] = [inicio];
  while (pila.length > 0) {
    const x = pila.pop()!;
    for (const [df, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const y = celdas[x.fila + df]?.[x.columna + dc];
      if (!y || !y.esTransitable) continue;
      const k = `${y.fila},${y.columna}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      pila.push(y);
    }
  }
  return vistos.size === total;
}

const m = mapa(30, 30);
const salas: SalaBSP[] = [];
generarLaberintoBSP(m, mulberry32(7), salas);
assert(salas.length > 0, 'el BSP devuelve salas');
assert(
  salas.every((s) => s.fila >= 0 && s.columna >= 0 && s.fila + s.alto <= 30 && s.columna + s.ancho <= 30),
  'salas dentro del mapa',
);

const semilla = 12345;
const nodo = generarNodo({ nombre: 'mazmorra', version: 1, seed: semilla, params: {} }, 60, 60);
const celdas = nodo.flat();
const cofres = celdas.filter((x) => x.cofre !== null);
const hierro = cofres.filter((x) => x.cofre === 'hierro').length;
const acero = cofres.filter((x) => x.cofre === 'acero').length;
const titanio = cofres.filter((x) => x.cofre === 'titanio').length;
assert(hierro >= 1 && hierro <= 5, `hierro 1–5 (${hierro})`);
assert(acero >= 0 && acero <= 3, `acero 0–3 (${acero})`);
assert(titanio >= 0 && titanio <= 1, `titanio 0–1 (${titanio})`);
assert(cofres.every((x) => x.esTransitable === false), 'los cofres bloquean la celda');
const llaves = celdas.filter((x) => x.llave !== null);
assert(hierro === 0 || llaves.some((x) => x.llave === 'hierro'), 'garantiza llave de hierro');
assert(acero === 0 || llaves.some((x) => x.llave === 'acero'), 'garantiza llave de acero');
assert(!llaves.some((x) => x.llave === 'titanio'), 'la llave de titanio no se coloca en salas');
assert(conectado(nodo), 'la conectividad se conserva');

const otro = generarNodo({ nombre: 'mazmorra', version: 1, seed: semilla, params: {} }, 60, 60);
assert(
  JSON.stringify(nodo.map((f) => f.map((c) => [c.cofre, c.cofreAbierto, c.llave]))) ===
    JSON.stringify(otro.map((f) => f.map((c) => [c.cofre, c.cofreAbierto, c.llave]))),
  'misma semilla → mismo reparto',
);

const sintetico = mapa(21, 21);
for (let f = 1; f <= 18; f++) {
  for (let c = 1; c <= 18; c++) sintetico[f][c].esTransitable = true;
}
const r = poblarTesoros(sintetico, [{ fila: 2, columna: 2, alto: 6, ancho: 6 }], () => 0);
assert(r.cofres.length === 1 && r.cofres[0].tipo === 'hierro', 'rng 0 → 1 cofre de hierro');
assert(r.llaves.length === 1 && r.llaves[0].tipo === 'hierro', 'rng 0 → 1 llave de hierro');

const sintetico2 = mapa(21, 21);
for (let f = 1; f <= 18; f++) {
  for (let c = 1; c <= 18; c++) sintetico2[f][c].esTransitable = true;
}
let tirada = 0;
const rngTitanio = () => (tirada++ === 2 ? 0.999 : 0);
const r2 = poblarTesoros(sintetico2, [{ fila: 2, columna: 2, alto: 18, ancho: 18 }], rngTitanio);
assert(r2.cofres.some((x) => x.tipo === 'titanio'), 'la tirada alta genera cofre de titanio');

for (let s = 1; s <= 10; s++) {
  const n = generarNodo({ nombre: 'mazmorra', version: 1, seed: s * 7919, params: {} }, 40, 40);
  const planas = n.flat();
  const ch = planas.filter((x) => x.cofre === 'hierro').length;
  const ca = planas.filter((x) => x.cofre === 'acero').length;
  const ct = planas.filter((x) => x.cofre === 'titanio').length;
  assert(ch >= 1 && ch <= 5, `semilla ${s}: hierro 1–5 (${ch})`);
  assert(ca >= 0 && ca <= 3, `semilla ${s}: acero 0–3 (${ca})`);
  assert(ct >= 0 && ct <= 1, `semilla ${s}: titanio 0–1 (${ct})`);
  assert(planas.filter((x) => x.llave === 'hierro').length === (ch > 0 ? 1 : 0), `semilla ${s}: llave de hierro`);
  assert(planas.filter((x) => x.llave === 'acero').length === (ca > 0 ? 1 : 0), `semilla ${s}: llave de acero`);
  assert(!planas.some((x) => x.llave === 'titanio'), `semilla ${s}: sin llave de titanio en salas`);
  assert(conectado(n), `semilla ${s}: conectividad`);
}

console.log('tesorosGeneracion.helpers: todas las comprobaciones pasan');
