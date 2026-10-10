import { Celda } from './Celda';
import { PREFIJO_MUNDO, EspejoLocal, type DocNodoLocal } from './espejoLocal';
import type { AlmacenamientoLocal } from './housing';
import { rehidratarHistoria, type DeltaMundo, type EnemigoFoto } from './mundo';

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

class AlmacenMock implements AlmacenamientoLocal {
  private readonly datos: Map<string, string> = new Map();
  getItem(clave: string): string | null {
    return this.datos.has(clave) ? (this.datos.get(clave) as string) : null;
  }
  setItem(clave: string, valor: string): void {
    this.datos.set(clave, valor);
  }
  removeItem(clave: string): void {
    this.datos.delete(clave);
  }
  key(indice: number): string | null {
    return Array.from(this.datos.keys())[indice] ?? null;
  }
  get length(): number {
    return this.datos.size;
  }
  claves(): string[] {
    return Array.from(this.datos.keys());
  }
}

/** Almacén que simula el storage lleno: setItem lanza, como el navegador. */
class AlmacenLleno extends AlmacenMock {
  override setItem(): void {
    const err = new Error("Setting the value exceeded the quota.");
    err.name = 'QuotaExceededError';
    throw err;
  }
}

function deltaCavar(nodoId: string, fila: number, columna: number, tick: number): DeltaMundo {
  return { fmt: 1, nodoId, fila, columna, autoria: 'L1', tick, cambio: { tipo: 'cavar' } };
}

function deltaDecor(
  nodoId: string,
  fila: number,
  columna: number,
  tick: number,
  campo: 'sueloDecor' | 'mueble',
  valor: string,
): DeltaMundo {
  return { fmt: 1, nodoId, fila, columna, autoria: 'L1', tick, cambio: { tipo: 'decor', campo, valor } };
}

function deltaEscenario(
  nodoId: string,
  fila: number,
  columna: number,
  tick: number,
): DeltaMundo {
  return {
    fmt: 1,
    nodoId,
    fila,
    columna,
    autoria: 'L1',
    tick,
    cambio: { tipo: 'escenario', tipoEscenario: 'puerta', estado: 'cerrada' },
  };
}

function docBase(deltas: DeltaMundo[]): DocNodoLocal {
  const foto: EnemigoFoto = {
    id: '5',
    fila: 1,
    columna: 2,
    nombre: 'Goblin',
    tipo: 'Goblin',
    vidaActual: 3,
    vidaMaxima: 5,
  };
  return {
    formato: 1,
    gen: { nombre: 'planta', version: 2, seed: 7, params: {} },
    ownerId: 'L1',
    deltas,
    snapshot: { formato: 1, enemigos: [foto] },
    ultimaCompactacionTick: 0,
  };
}

function main(): void {
  // --- Prefijo de claves del espejo ---
  assert(PREFIJO_MUNDO === 'mazerpg.mundo.', 'PREFIJO_MUNDO es mazerpg.mundo.');

  // --- Roundtrip guardarDoc/cargarDoc con deltas y snapshot ---
  const almacen = new AlmacenMock();
  const espejo = new EspejoLocal(almacen);
  const deltas = [deltaCavar('casa-1', 0, 0, 10), deltaDecor('casa-1', 1, 1, 20, 'mueble', 'mesa')];
  espejo.guardarDoc('casa-1', docBase(deltas));
  const cargado = espejo.cargarDoc('casa-1');
  assert(cargado !== null, 'cargarDoc devuelve el doc tras guardarDoc');
  assert(
    JSON.stringify(cargado) === JSON.stringify(docBase(deltas)),
    'el roundtrip conserva formato/gen/ownerId/deltas/snapshot/ultimaCompactacionTick',
  );

  // --- La clave vive bajo mazerpg.mundo.<nodoId> y no pisa la casa del housing ---
  assert(
    almacen.claves().includes(`mazerpg.mundo.casa-1`) && almacen.claves().length === 1,
    'guardarDoc escribe bajo el prefijo mazerpg.mundo.<nodoId>',
  );
  espejo.guardarDoc('raiz', docBase([]));
  assert(
    almacen.claves().every((c) => c.startsWith(PREFIJO_MUNDO)),
    'el espejo solo añade claves con su prefijo (no toca mazerpg.casa.local)',
  );

  // --- Storage lleno (QuotaExceededError): no lanza y avisa ---
  const avisos: string[] = [];
  const warnOriginal = console.warn;
  console.warn = (...args: unknown[]) => avisos.push(args.join(' '));
  let lanzo = false;
  try {
    new EspejoLocal(new AlmacenLleno()).guardarDoc('casa-2', docBase([]));
  } catch {
    lanzo = true;
  } finally {
    console.warn = warnOriginal;
  }
  assert(!lanzo, 'guardarDoc no lanza cuando el almacenamiento está lleno');
  assert(avisos.length > 0, 'guardarDoc avisa por console.warn cuando el storage está lleno');

  // --- Doc corrupto o ajeno al formato: cargarDoc devuelve null ---
  const corrupto = new AlmacenMock();
  const espejoCorrupto = new EspejoLocal(corrupto);
  corrupto.setItem(`${PREFIJO_MUNDO}nodo-a`, 'no-es-json{');
  corrupto.setItem(`${PREFIJO_MUNDO}nodo-b`, '42');
  corrupto.setItem(`${PREFIJO_MUNDO}nodo-c`, JSON.stringify({ formato: 2, deltas: [] }));
  corrupto.setItem(`${PREFIJO_MUNDO}nodo-d`, JSON.stringify({ formato: 1 }));
  assert(espejoCorrupto.cargarDoc('nodo-a') === null, 'cargarDoc devuelve null con JSON inválido');
  assert(espejoCorrupto.cargarDoc('nodo-b') === null, 'cargarDoc devuelve null cuando el doc no es un objeto');
  assert(espejoCorrupto.cargarDoc('nodo-c') === null, 'cargarDoc devuelve null con formato futuro');
  assert(espejoCorrupto.cargarDoc('nodo-d') === null, 'cargarDoc devuelve null sin gen');

  // --- Deltas malformados dentro del doc: se descartan de forma defensiva ---
  const sucio = new AlmacenMock();
  const espejoSucio = new EspejoLocal(sucio);
  sucio.setItem(
    `${PREFIJO_MUNDO}casa-3`,
    JSON.stringify({
      formato: 1,
      gen: { nombre: 'planta', version: 2, seed: 1, params: {} },
      ownerId: null,
      deltas: [deltaCavar('casa-3', 0, 0, 5), { fmt: 1, nodoId: 'casa-3', basura: true }],
      snapshot: null,
      ultimaCompactacionTick: 3,
    }),
  );
  const limpio = espejoSucio.cargarDoc('casa-3');
  assert(limpio !== null && limpio.deltas.length === 1, 'cargarDoc filtra los deltas malformados del doc');
  assert(limpio?.ultimaCompactacionTick === 3, 'cargarDoc conserva ultimaCompactacionTick del doc');

  // --- borrarDoc elimina la clave del nodo ---
  espejo.borrarDoc('raiz');
  assert(almacen.getItem(`${PREFIJO_MUNDO}raiz`) === null, 'borrarDoc elimina la clave del nodo');
  assert(almacen.getItem(`${PREFIJO_MUNDO}casa-1`) !== null, 'borrarDoc no toca otros nodos del espejo');

  // --- Sin storage disponible: no lanza y devuelve null ---
  const espejoMudo = new EspejoLocal(null);
  espejoMudo.guardarDoc('casa-4', docBase([]));
  espejoMudo.borrarDoc('casa-4');
  assert(espejoMudo.cargarDoc('casa-4') === null, 'sin almacen cargarDoc devuelve null y guardarDoc no lanza');

  // --- rehidratarHistoria: snapshot.celdas primero y deltas por tick ---
  const nodo: Celda[][] = [];
  for (let f = 0; f < 3; f++) {
    nodo[f] = [];
    for (let c = 0; c < 3; c++) nodo[f][c] = new Celda(f, c);
  }
  const doc: DocNodoLocal = {
    formato: 1,
    gen: { nombre: 'planta', version: 2, seed: 7, params: {} },
    ownerId: 'L1',
    deltas: [
      deltaEscenario('casa-1', 2, 0, 30),
      deltaDecor('casa-1', 1, 1, 40, 'mueble', 'mesa'),
      deltaCavar('casa-1', 0, 0, 50),
    ],
    snapshot: { formato: 1, celdas: [deltaCavar('casa-1', 1, 0, 10), deltaDecor('casa-1', 0, 1, 20, 'sueloDecor', 'madera')] },
    ultimaCompactacionTick: 20,
  };
  rehidratarHistoria(nodo, doc);
  assert(nodo[1][0].esTransitable === true, 'rehidratarHistoria aplica primero las celdas plegadas del snapshot');
  assert(nodo[0][1].sueloDecor === 'madera', 'rehidratarHistoria aplica el decor pliegado del snapshot');
  assert(
    nodo[2][0].tipoEscenario === 'puerta' && nodo[2][0].estadoEscenario === 'cerrada',
    'rehidratarHistoria aplica el escenario del doc',
  );
  assert(nodo[1][1].mueble === 'mesa', 'rehidratarHistoria aplica el mueble del doc');
  assert(nodo[0][0].esTransitable === true, 'rehidratarHistoria aplica un cavar del doc');

  // --- Orden por tick: el delta de mayor tick gana aunque viaje desordenado ---
  const desorden: Celda[][] = [];
  for (let f = 0; f < 2; f++) {
    desorden[f] = [];
    for (let c = 0; c < 2; c++) desorden[f][c] = new Celda(f, c);
  }
  const docDes: DocNodoLocal = {
    formato: 1,
    gen: { nombre: 'planta', version: 2, seed: 7, params: {} },
    ownerId: null,
    deltas: [
      deltaDecor('casa-2', 0, 0, 50, 'sueloDecor', 'baldosa'),
      deltaDecor('casa-2', 0, 0, 20, 'sueloDecor', 'alfombra'),
    ],
    snapshot: null,
    ultimaCompactacionTick: 0,
  };
  rehidratarHistoria(desorden, docDes);
  assert(
    desorden[0][0].sueloDecor === 'baldosa',
    'rehidratarHistoria ordena los deltas por tick antes de aplicar (el mayor gana)',
  );

  // --- Doc vacío: la rehidratación es un no-op seguro ---
  const intacto: Celda[][] = [[new Celda(0, 0)]];
  rehidratarHistoria(intacto, { formato: 1, gen: docDes.gen, ownerId: null, deltas: [], snapshot: null, ultimaCompactacionTick: 0 });
  assert(intacto[0][0].esTransitable === false, 'rehidratarHistoria con doc vacío no altera las celdas');

  console.log(`${ok}/${total} ok`);
}

main();