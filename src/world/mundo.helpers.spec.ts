import { Celda } from './Celda';
import {
  aplicarDelta,
  conTickAutor,
  consolidarCeldasLWW,
  rehidratarHistoria,
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

  const muebleSet = aplicarDelta(
    raiz.celdas,
    deltaBase('raiz', 1, 2, { tipo: 'decor', campo: 'mueble', valor: 'mesa' }, 1),
  );
  assert(muebleSet === true, "aplicarDelta decor/mueble devuelve true");
  assert(raiz.celdas[1][2].mueble === 'mesa', 'aplicarDelta decor/mueble fija el mueble');
  const muebleReset = aplicarDelta(
    raiz.celdas,
    deltaBase('raiz', 1, 2, { tipo: 'decor', campo: 'mueble', valor: null }, 2),
  );
  assert(muebleReset === true, "aplicarDelta decor/mueble valor null devuelve true");
  assert(raiz.celdas[1][2].mueble === null, 'aplicarDelta decor/mueble valor null resetea el mueble');

  const sueloSet = aplicarDelta(
    raiz.celdas,
    deltaBase('raiz', 2, 0, { tipo: 'decor', campo: 'sueloDecor', valor: 'madera' }, 1),
  );
  assert(sueloSet === true, "aplicarDelta decor/sueloDecor devuelve true");
  assert(raiz.celdas[2][0].sueloDecor === 'madera', 'aplicarDelta decor/sueloDecor fija el suelo');
  const sueloReset = aplicarDelta(
    raiz.celdas,
    deltaBase('raiz', 2, 0, { tipo: 'decor', campo: 'sueloDecor', valor: null }, 2),
  );
  assert(sueloReset === true, "aplicarDelta decor/sueloDecor valor null devuelve true");
  assert(raiz.celdas[2][0].sueloDecor === null, 'aplicarDelta decor/sueloDecor valor null resetea el suelo');

  const sueloAlfombra = aplicarDelta(
    raiz.celdas,
    deltaBase('raiz', 1, 0, { tipo: 'decor', campo: 'sueloDecor', valor: 'alfombra' }, 1),
  );
  assert(sueloAlfombra === true && raiz.celdas[1][0].sueloDecor === 'alfombra', 'aplicarDelta decor/sueloDecor fija alfombra (preparación)');
  const sueloPiedra = aplicarDelta(
    raiz.celdas,
    deltaBase('raiz', 1, 0, { tipo: 'decor', campo: 'sueloDecor', valor: 'piedra' }, 2),
  );
  assert(sueloPiedra === false, "aplicarDelta decor/sueloDecor rechaza material no válido ('piedra')");
  assert(raiz.celdas[1][0].sueloDecor === 'alfombra', "aplicarDelta decor/sueloDecor con 'piedra' no muta la celda");
  const sueloNulo = aplicarDelta(
    raiz.celdas,
    deltaBase('raiz', 1, 0, { tipo: 'decor', campo: 'sueloDecor', valor: null }, 3),
  );
  assert(sueloNulo === true, "aplicarDelta decor/sueloDecor valor null devuelve true");
  assert(raiz.celdas[1][0].sueloDecor === null, 'aplicarDelta decor/sueloDecor valor null resetea el suelo');

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

  const base: Omit<DeltaMundo, 'tick'> = {
    fmt: FMT_DELTA,
    nodoId: 'raiz',
    fila: 1,
    columna: 0,
    autoria: 'jugador-2',
    cambio: { tipo: 'cavar' },
  };
  const conAutor = conTickAutor(base, 42, 100);
  assert(conAutor.tick === 42, 'conTickAutor usa el tick del autor');
  assert(conAutor.autoria === 'jugador-2' && conAutor.cambio.tipo === 'cavar', 'conTickAutor conserva los campos del base');
  const conFallback = conTickAutor(base, null, 100);
  assert(conFallback.tick === 100, 'conTickAutor cae al fallback si tickAutor es null');

  // C1: el plegado LWW conserva efectos ortogonales de la misma celda
  // (cavar + objeto.alimento coexisten; la recarga reproduce ambos).
  const plegadas1 = consolidarCeldasLWW([
    [
      deltaBase('raiz', 1, 1, { tipo: 'cavar' }, 5),
      deltaBase('raiz', 1, 1, { tipo: 'objeto', campo: 'alimento', valor: { tipo: 'Manzana', pc: 5 } }, 7),
    ],
  ]);
  assert(plegadas1.length === 2, 'C1: cavar + alimento en la misma celda no se pliegan entre sí');
  const celdasC1 = crearNodoRaiz(2, 2).celdas;
  for (const delta of plegadas1) aplicarDelta(celdasC1, delta);
  assert(celdasC1[1][1].esTransitable === true, 'C1: aplicado el plegado sobre gen, la celda queda transitable');
  assert(
    celdasC1[1][1].alimento !== null &&
    celdasC1[1][1].alimento?.tipo === 'Manzana' &&
    celdasC1[1][1].alimento?.pc === 5,
    'C1: aplicado el plegado sobre gen, la celda conserva el alimento',
  );
  const celdasRecarga = crearNodoRaiz(2, 2).celdas;
  for (const delta of consolidarCeldasLWW([plegadas1])) aplicarDelta(celdasRecarga, delta);
  assert(
    celdasRecarga[1][1].esTransitable === celdasC1[1][1].esTransitable &&
      celdasRecarga[1][1].alimento?.tipo === celdasC1[1][1].alimento?.tipo &&
      celdasRecarga[1][1].alimento?.pc === celdasC1[1][1].alimento?.pc,
    'C1: la recarga del plegado reproduce la celda idéntica (transitable y con alimento)',
  );

  // C1: dentro de la misma clave (celda+tipo) sigue mandando LWW entre sí.
  const plegadasCavar = consolidarCeldasLWW([
    [deltaBase('raiz', 1, 1, { tipo: 'cavar' }, 5), deltaBase('raiz', 1, 1, { tipo: 'cavar' }, 9)],
  ]);
  assert(plegadasCavar.length === 1 && plegadasCavar[0].tick === 9, "C1: dos 'cavar' de la misma celda se pliegan LWW (gana tick 9)");

  // C1: campos del mismo tipo distintos coexisten (decor.sueloDecor + decor.mueble).
  const plegadasDecor = consolidarCeldasLWW([
    [
      deltaBase('raiz', 0, 0, { tipo: 'decor', campo: 'sueloDecor', valor: 'madera' }, 5),
      deltaBase('raiz', 0, 0, { tipo: 'decor', campo: 'mueble', valor: 'mesa' }, 6),
    ],
  ]);
  assert(plegadasDecor.length === 2, 'C1: decor.sueloDecor + decor.mueble de la misma celda coexisten');

  // C1: 'escenario' escribe un único (tipoEscenario+estado) por celda; el
  // plegado conserva la pareja del último.
  const plegadasEscenario = consolidarCeldasLWW([
    [
      deltaBase('raiz', 0, 1, { tipo: 'escenario', tipoEscenario: 'puerta', estado: 'cerrada' }, 8),
      deltaBase('raiz', 0, 1, { tipo: 'escenario', tipoEscenario: 'trampa', estado: 'inactiva' }, 9),
    ],
  ]);
  assert(plegadasEscenario.length === 1, 'C1: deltas de escenario de la misma celda se pliegan entre sí');
  const cambioEscenario = plegadasEscenario[0].cambio;
  assert(
    cambioEscenario.tipo === 'escenario' && cambioEscenario.tipoEscenario === 'trampa' && cambioEscenario.estado === 'inactiva',
    "C1: el escenario plegado conserva (tipoEscenario+estado) del último ('trampa inactiva')",
  );

  // rehidratarHistoria acepta historia cruda (Firebase) y aplica ciclo completo.
  const nodoCrudol = crearNodoRaiz(2, 2);
  rehidratarHistoria(nodoCrudol.celdas, {
    snapshot: { formato: 1, celdas: [deltaBase('raiz', 0, 0, { tipo: 'cavar' }, 4)] },
    deltas: [
      deltaBase('raiz', 1, 1, { tipo: 'objeto', campo: 'alimento', valor: { tipo: 'Manzana', pc: 5 } }, 7),
      deltaBase('raiz', 1, 1, { tipo: 'cavar' }, 6),
    ],
  });
  assert(nodoCrudol.celdas[0][0].esTransitable === true, 'rehidratarHistoria aplica las celdas plegadas del snapshot crudo');
  assert(
    nodoCrudol.celdas[1][1].esTransitable === true && nodoCrudol.celdas[1][1].alimento?.tipo === 'Manzana',
    'rehidratarHistoria aplica los deltas crudos ordenados por tick sobre el gen',
  );

  console.log(`${ok}/${total} ok`);
}

main();
