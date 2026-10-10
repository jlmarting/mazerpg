import { Celda } from './Celda';
import { generarNodo, mulberry32, GENERADORES, dimensionesPlanta } from './generadores';
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

/** Cuenta celdas transitables alcanzables desde la primera, abriendo paso solo por muros. */
function contarAlcanzables(mapa: Celda[][]): number {
  const filas = mapa.length;
  const columnas = filas > 0 ? mapa[0].length : 0;
  let inicio: { f: number; c: number } | null = null;
  for (let f = 0; f < filas && !inicio; f++) {
    for (let c = 0; c < columnas; c++) {
      if (mapa[f][c].esTransitable) {
        inicio = { f, c };
        break;
      }
    }
  }
  if (!inicio) return 0;
  const visto = new Set<string>();
  const pila = [inicio];
  while (pila.length) {
    const { f, c } = pila.pop()!;
    const clave = `${f},${c}`;
    if (visto.has(clave)) continue;
    visto.add(clave);
    const vecinos: Array<[number, number, keyof Celda['muros'], keyof Celda['muros']]> = [
      [f - 1, c, 'superior', 'inferior'],
      [f + 1, c, 'inferior', 'superior'],
      [f, c - 1, 'izquierdo', 'derecho'],
      [f, c + 1, 'derecho', 'izquierdo'],
    ];
    for (const [nf, nc, muroA, muroB] of vecinos) {
      if (nf < 0 || nc < 0 || nf >= filas || nc >= columnas) continue;
      if (!mapa[nf][nc].esTransitable) continue;
      if (mapa[f][c].muros[muroA] || mapa[nf][nc].muros[muroB]) continue;
      pila.push({ f: nf, c: nc });
    }
  }
  return visto.size;
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

  // Nombre de generador desconocido falla explícitamente
  let lanzoNombre = false;
  try {
    generarNodo({ nombre: 'generador-inexistente', version: 1, seed: 1, params: {} }, 5, 5);
  } catch {
    lanzoNombre = true;
  }
  assert(lanzoNombre, 'generarNodo con nombre de generador desconocido lanza error');

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

  // --- M2: plano de casa (planta v2) ---
  const dims = dimensionesPlanta({ habitacionesX: 3, habitacionesY: 2 });
  assert(
    dims.filas === 9 && dims.columnas === 16,
    'dimensionesPlanta: 3x2 habitaciones -> 9x16 (contenida)',
  );

  const genCasa = { nombre: 'planta', version: 2, seed: 42, params: { habitacionesX: 3, habitacionesY: 2 } };
  const casaA = generarNodo(genCasa, dims.filas, dims.columnas);
  assert(casaA.length === 9 && casaA[0].length === 16, 'planta v2 respeta las dimensiones contenidas');

  let perimetroCerrado = true;
  for (let c = 0; c < 16; c++) if (casaA[0][c].esTransitable || casaA[8][c].esTransitable) perimetroCerrado = false;
  for (let f = 0; f < 9; f++) if (casaA[f][0].esTransitable || casaA[f][15].esTransitable) perimetroCerrado = false;
  assert(perimetroCerrado, 'planta v2 tiene perímetro exterior cerrado (sin exteriores)');

  let interiores = 0;
  for (let f = 0; f < 9; f++) {
    for (let c = 0; c < 16; c++) if (casaA[f][c].esTransitable) interiores++;
  }
  assert(
    interiores >= 24,
    'planta v2 tiene varias habitaciones (una retícula de huecos, no un pasillo)',
  );
  assert(
    contarAlcanzables(casaA) === interiores,
    'planta v2: todas las habitaciones están conectadas por puertas (alcanzables)',
  );

  const casaB = generarNodo(genCasa, dims.filas, dims.columnas);
  assert(mapasIguales(casaA, casaB), 'planta v2 es determinista para la misma seed');
  const casaC = generarNodo({ ...genCasa, seed: 7 }, dims.filas, dims.columnas);
  assert(!mapasIguales(casaA, casaC), 'planta v2 con distinta seed difiere (posición de puertas)');

  const casaSinAmb = generarNodo(
    { ...genCasa, params: { habitacionesX: 3, habitacionesY: 2, sinAmbientales: 1 } },
    dims.filas,
    dims.columnas,
  );
  let tieneAmbiental = false;
  for (let f = 0; f < 9; f++) {
    for (let c = 0; c < 16; c++) {
      const cel = casaSinAmb[f][c];
      if (cel.alimento || cel.burbuja || cel.tienePico || cel.esPortal) tieneAmbiental = true;
    }
  }
  assert(
    !tieneAmbiental,
    'planta v2 con sinAmbientales no genera comida/burbujas/picos/portales clásicos',
  );

  // Suelo decorativo por habitación + mobiliario
  let conSuelo = 0;
  let sinSuelo = 0;
  let muebles = 0;
  let muebleNoTransitable = true;
  for (let f = 0; f < 9; f++) {
    for (let c = 0; c < 16; c++) {
      const cel = casaSinAmb[f][c];
      if (cel.esTransitable) {
        if (cel.sueloDecor) conSuelo++;
        else sinSuelo++;
      }
      if (cel.mueble) {
        muebles++;
        if (cel.esTransitable) muebleNoTransitable = false;
      }
    }
  }
  assert(
    conSuelo >= 24 && sinSuelo === 0,
    'planta v2 asigna suelo decorativo (madera/baldosa/alfombra) a todas las celdas transitables',
  );
  assert(muebles >= 4, 'planta v2 coloca mobiliario en la casa');
  assert(muebleNoTransitable, 'las celdas con mueble no son transitables');
  assert(
    contarAlcanzables(casaSinAmb) === conSuelo,
    'planta v2: el mobiliario no rompe la conectividad de las habitaciones',
  );

  console.log(`${ok}/${total} ok`);
}

main();
