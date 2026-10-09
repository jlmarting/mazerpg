import { Celda } from './Celda';
import { generarNodo, mulberry32, GENERADORES } from './generadores';
import { generarLaberintoBSP } from './generation';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) {
    throw new Error(`FALLO: ${mensaje}`);
  }
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

function mapasIguales(a: Celda[][], b: Celda[][]): boolean {
  if (a.length !== b.length) return false;
  for (let f = 0; f < a.length; f++) {
    if (a[f].length !== b[f].length) return false;
    for (let c = 0; c < a[f].length; c++) {
      const x = a[f][c];
      const y = b[f][c];
      if (x.esTransitable !== y.esTransitable) return false;
      if (
        x.muros.superior !== y.muros.superior ||
        x.muros.derecho !== y.muros.derecho ||
        x.muros.inferior !== y.muros.inferior ||
        x.muros.izquierdo !== y.muros.izquierdo
      ) {
        return false;
      }
    }
  }
  return true;
}

function filasDe(mapa: Celda[][]): number {
  return mapa.length;
}

function columnasDe(mapa: Celda[][]): number {
  return mapa.length > 0 ? mapa[0].length : 0;
}

function hayTransitable(mapa: Celda[][]): boolean {
  for (const fila of mapa) {
    for (const celda of fila) {
      if (celda.esTransitable) return true;
    }
  }
  return false;
}

const NOMBRES = ['mazmorra', 'abierto', 'planta', 'natural'] as const;

function main(): void {
  // mulberry32: determinista por seed
  const rngA = mulberry32(42);
  const rngB = mulberry32(42);
  let secuenciaIgual = true;
  for (let i = 0; i < 8; i++) {
    if (rngA() !== rngB()) secuenciaIgual = false;
  }
  assert(secuenciaIgual, 'mulberry32(42) repite la misma secuencia');

  const rngC = mulberry32(43);
  assert(mulberry32(42)() !== rngC(), 'mulberry32 con seeds distintas diverge');

  // Registrar las cuatro versiones v1
  for (const nombre of ['mazmorra', 'abierto', 'planta', 'natural']) {
    assert(
      typeof GENERADORES[nombre]?.[1] === 'function',
      `GENERADORES['${nombre}'][1] registrado`,
    );
  }

  // generarNodo: dimensiones respetadas
  const plantaA = generarNodo({ nombre: 'planta', version: 1, seed: 42, params: {} }, 30, 30);
  assert(filasDe(plantaA) === 30, 'generarNodo planta respeta filas');
  assert(columnasDe(plantaA) === 30, 'generarNodo planta respeta columnas');

  // Determismo: misma seed => deep-equal
  const plantaB = generarNodo({ nombre: 'planta', version: 1, seed: 42, params: {} }, 30, 30);
  assert(mapasIguales(plantaA, plantaB), 'generarNodo planta seed 42 es determinista');

  // Distinta seed => al menos una celda difiere
  const plantaC = generarNodo({ nombre: 'planta', version: 1, seed: 43, params: {} }, 30, 30);
  assert(!mapasIguales(plantaA, plantaC), 'generarNodo planta seed 43 difiere de seed 42');

  // Los cuatro generadores son deterministas
  for (const nombre of ['mazmorra', 'abierto', 'natural']) {
    const uno = generarNodo({ nombre, version: 1, seed: 7, params: {} }, 30, 30);
    const dos = generarNodo({ nombre, version: 1, seed: 7, params: {} }, 30, 30);
    assert(mapasIguales(uno, dos), `generarNodo ${nombre} seed 7 es determinista`);
  }

  // Sensibilidad a seed + no degeneración en cada generador
  for (const nombre of NOMBRES) {
    const seed42 = generarNodo({ nombre, version: 1, seed: 42, params: {} }, 30, 30);
    const seed43 = generarNodo({ nombre, version: 1, seed: 43, params: {} }, 30, 30);
    assert(
      !mapasIguales(seed42, seed43),
      `generarNodo ${nombre} seed 42 difiere de seed 43`,
    );
    assert(hayTransitable(seed42), `generarNodo ${nombre} produce celdas transitables`);
  }

  // Versión desconocida falla explícitamente
  let lanzo = false;
  try {
    generarNodo({ nombre: 'planta', version: 99, seed: 1, params: {} }, 5, 5);
  } catch {
    lanzo = true;
  }
  assert(lanzo, 'generarNodo con versión desconocida lanza error');

  // BSP sembrado: mismo seed => mismo mapa; distinto seed => difiere
  const crearMapa = (): Celda[][] => {
    const m: Celda[][] = [];
    for (let f = 0; f < 30; f++) {
      m[f] = [];
      for (let c = 0; c < 30; c++) m[f][c] = new Celda(f, c);
    }
    return m;
  };
  const bspA = crearMapa();
  generarLaberintoBSP(bspA, mulberry32(123));
  const bspB = crearMapa();
  generarLaberintoBSP(bspB, mulberry32(123));
  assert(mapasIguales(bspA, bspB), 'generarLaberintoBSP con mismo seed es determinista');

  const bspC = crearMapa();
  generarLaberintoBSP(bspC, mulberry32(124));
  assert(!mapasIguales(bspA, bspC), 'generarLaberintoBSP con distinto seed difiere');

  console.log(`${ok}/${total} ok`);
}

main();
