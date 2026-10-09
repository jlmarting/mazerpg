import { Celda } from './Celda';
import {
  aplicarDelta,
  resolverLWW,
  FMT_DELTA,
  type NodoMundo,
  type DeltaMundo,
  type ConectorMundo,
} from './mundo';

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

function crearNodoRaiz(filas: number, columnas: number): NodoMundo {
  const celdas: Celda[][] = [];
  for (let f = 0; f < filas; f++) {
    celdas[f] = [];
    for (let c = 0; c < columnas; c++) {
      celdas[f][c] = new Celda(f, c);
    }
  }
  return {
    id: 'raiz',
    padreId: null,
    transform: { df: 0, dc: 0 },
    filas,
    columnas,
    tipo: 'mazmorra',
    gen: { nombre: 'mazmorra', version: 1, seed: 1, params: {} },
    celdas,
    ownerId: null,
  };
}

function deltaBase(
  nodoId: string,
  fila: number,
  columna: number,
  cambio: DeltaMundo['cambio'],
  tick: number,
): DeltaMundo {
  return {
    fmt: FMT_DELTA,
    nodoId,
    fila,
    columna,
    autoria: 'jugador-1',
    tick,
    cambio,
  };
}

function main(): void {
  const raiz = crearNodoRaiz(3, 3);
  assert(raiz.tipo === 'mazmorra', "crearNodoRaiz devuelve tipo 'mazmorra'");
  assert(raiz.padreId === null, 'crearNodoRaiz devuelve padreId null');

  const celda = raiz.celdas[1][1];
  celda.alimento = { tipo: 'manzana', pc: 10 };
  const borraAlimento = aplicarDelta(
    raiz.celdas,
    deltaBase('raiz', 1, 1, { tipo: 'objeto', campo: 'alimento', valor: null }, 1),
  );
  assert(borraAlimento === true, "aplicarDelta objeto/alimento/valor null devuelve true");
  assert(celda.alimento === null, "aplicarDelta objeto/alimento/valor null borra alimento");

  const alimentoInvalido = aplicarDelta(
    raiz.celdas,
    deltaBase('raiz', 0, 0, { tipo: 'objeto', campo: 'alimento', valor: { malo: true } }, 1),
  );
  assert(alimentoInvalido === false, 'aplicarDelta rechaza un alimento con payload inválido');
  assert(raiz.celdas[0][0].alimento === null, 'un alimento inválido no muta la celda');

  const picoInvalido = aplicarDelta(
    raiz.celdas,
    deltaBase('raiz', 0, 0, { tipo: 'objeto', campo: 'tienePico', valor: 'sí' }, 1),
  );
  assert(picoInvalido === false, 'aplicarDelta rechaza tienePico no booleano');

  const burbujaInvalida = aplicarDelta(
    raiz.celdas,
    deltaBase('raiz', 0, 0, { tipo: 'objeto', campo: 'burbuja', valor: { foo: 1 } }, 1),
  );
  assert(burbujaInvalida === false, 'aplicarDelta rechaza una burbuja con payload inválido');

  const picoValido = aplicarDelta(
    raiz.celdas,
    deltaBase('raiz', 0, 0, { tipo: 'objeto', campo: 'tienePico', valor: true }, 1),
  );
  assert(picoValido === true && raiz.celdas[0][0].tienePico === true, 'aplicarDelta acepta tienePico booleano');

  const fueraDeRango = aplicarDelta(
    raiz.celdas,
    deltaBase('raiz', 99, 99, { tipo: 'cavar' }, 1),
  );
  assert(fueraDeRango === false, 'aplicarDelta fuera de rango devuelve false');

  const cavar = aplicarDelta(raiz.celdas, deltaBase('raiz', 0, 0, { tipo: 'cavar' }, 1));
  assert(cavar === true, 'aplicarDelta cavar devuelve true');
  assert(raiz.celdas[0][0].esTransitable === true, 'aplicarDelta cavar activa transitabilidad');

  const escenario = aplicarDelta(
    raiz.celdas,
    deltaBase('raiz', 2, 2, { tipo: 'escenario', tipoEscenario: 'puerta', estado: 'abierta' }, 1),
  );
  assert(escenario === true, 'aplicarDelta escenario devuelve true');
  assert(raiz.celdas[2][2].tipoEscenario === 'puerta', 'aplicarDelta escenario fija tipoEscenario');
  assert(raiz.celdas[2][2].estadoEscenario === 'abierta', 'aplicarDelta escenario fija estado');

  const conector: ConectorMundo = {
    id: 'con-1',
    tipo: 'portal',
    nodoOrigenId: 'raiz',
    filaO: 0,
    columnaO: 1,
    nodoDestinoId: 'nodo-2',
    filaD: 0,
    columnaD: 0,
    housingOwnerId: null,
  };
  const añadir = aplicarDelta(
    raiz.celdas,
    deltaBase('raiz', 0, 1, { tipo: 'conector', accion: 'añadir', conector }, 1),
  );
  assert(añadir === true, "aplicarDelta conector/añadir devuelve true");
  assert(raiz.celdas[0][1].conectorId === 'con-1', 'aplicarDelta conector fija conectorId');
  const quitar = aplicarDelta(
    raiz.celdas,
    deltaBase('raiz', 0, 1, { tipo: 'conector', accion: 'quitar', conector }, 2),
  );
  assert(quitar === true, "aplicarDelta conector/quitar devuelve true");
  assert(raiz.celdas[0][1].conectorId === null, 'aplicarDelta conector/quitar limpia conectorId');

  const a = deltaBase('raiz', 0, 0, { tipo: 'cavar' }, 5);
  const b = deltaBase('raiz', 0, 0, { tipo: 'cavar' }, 9);
  assert(resolverLWW(a, b) === b, 'resolverLWW gana el mayor tick');
  assert(resolverLWW(b, a) === b, 'resolverLWW conserva el mayor tick al revés');
  const c = deltaBase('raiz', 0, 0, { tipo: 'cavar' }, 5);
  assert(resolverLWW(a, c) === c, 'resolverLWW empate gana el entrante');
  assert(resolverLWW(null, a) === a, 'resolverLWW sin actual devuelve el entrante');

  console.log(`${ok}/${total} ok`);
}

main();
