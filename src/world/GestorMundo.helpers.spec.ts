import { Celda } from './Celda';
import { GestorMundo } from './GestorMundo';
import type { ConectorMundo, NodoMundo } from './mundo';

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

function assertLanza(fn: () => void, mensaje: string): void {
  total++;
  let lanzo = false;
  try {
    fn();
  } catch {
    lanzo = true;
  }
  if (!lanzo) {
    throw new Error(`FALLO: ${mensaje}`);
  }
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

function crearNodoTest(
  id: string,
  padreId: string | null,
  filas: number,
  columnas: number,
  transitable: boolean,
): NodoMundo {
  const celdas: Celda[][] = [];
  for (let f = 0; f < filas; f++) {
    celdas[f] = [];
    for (let c = 0; c < columnas; c++) {
      const celda = new Celda(f, c);
      celda.esTransitable = transitable;
      celdas[f][c] = celda;
    }
  }
  return {
    id,
    padreId,
    transform: { df: 0, dc: 0 },
    filas,
    columnas,
    tipo: 'mazmorra',
    gen: { nombre: 'mazmorra', version: 1, seed: 3, params: {} },
    celdas,
    ownerId: null,
  };
}

function mapasIguales(a: Celda[][], b: Celda[][]): boolean {
  if (a.length !== b.length) return false;
  for (let f = 0; f < a.length; f++) {
    if (a[f].length !== b[f].length) return false;
    for (let c = 0; c < a[f].length; c++) {
      if (a[f][c].esTransitable !== b[f][c].esTransitable) return false;
    }
  }
  return true;
}

function conectorBase(overrides: Partial<ConectorMundo>): ConectorMundo {
  return {
    id: 'con-1',
    tipo: 'portal',
    nodoOrigenId: 'raiz',
    filaO: 1,
    columnaO: 1,
    nodoDestinoId: 'nodo-2',
    filaD: 2,
    columnaD: 2,
    housingOwnerId: null,
    ...overrides,
  };
}

function tieneSalida(celdas: Celda[][], fila: number, columna: number): boolean {
  const celda = celdas[fila][columna];
  if (!celda || !celda.esTransitable) return false;
  if (fila > 0 && !celda.muros.superior && celdas[fila - 1][columna].esTransitable) return true;
  if (fila + 1 < celdas.length && !celda.muros.inferior && celdas[fila + 1][columna].esTransitable) return true;
  if (columna > 0 && !celda.muros.izquierdo && celdas[fila][columna - 1].esTransitable) return true;
  if (columna + 1 < celdas[fila].length && !celda.muros.derecho && celdas[fila][columna + 1].esTransitable) return true;
  return false;
}

function main(): void {
  const gestor = new GestorMundo();

  const raiz = gestor.crearMundoInicial(
    { nombre: 'mazmorra', version: 1, seed: 42, params: {} },
    10,
    10,
  );
  assert(raiz.padreId === null, 'crearMundoInicial devuelve raíz con padreId null');
  assert(
    raiz.celdas.length === 10 && raiz.celdas[0].length === 10,
    'crearMundoInicial devuelve celdas no-vacías con las dimensiones pedidas',
  );
  assert(gestor.nodoActivoId === raiz.id, 'crearMundoInicial fija el nodo activo a la raíz');
  assert(gestor.obtenerNodoActivo() === raiz, 'obtenerNodoActivo devuelve la raíz');
  assert(gestor.obtenerCeldas() === raiz.celdas, 'obtenerCeldas delega en el nodo activo');

  // Nodo destino ya materializado en el mundo + conector hacia él
  const destino = crearNodoTest('nodo-2', raiz.id, 8, 8, true);
  gestor.mundo.set(destino.id, destino);
  const conector = conectorBase({ id: 'con-1', nodoOrigenId: raiz.id, nodoDestinoId: destino.id });
  gestor.registrarConector(conector);
  assert(gestor.conectorEn(1, 1) === conector, 'conectorEn localiza el conector por celda de origen');
  assert(gestor.conectorEn(0, 0) === null, 'conectorEn devuelve null en celda sin conector');
  assert(gestor.conectorEn(99, 99) === null, 'conectorEn devuelve null fuera de rango');

  const aparicion = gestor.atravesar(conector.id);
  assert(aparicion.nodo === destino, 'atravesar devuelve el nodo destino');
  assert(gestor.nodoActivoId === destino.id, 'atravesar conmuta el nodo activo al destino');
  assert(gestor.obtenerNodoActivo() === destino, 'obtenerNodoActivo refleja el destino tras atravesar');
  assert(
    aparicion.fila === 2 && aparicion.columna === 2,
    'atravesar devuelve las coordenadas de aparición del conector',
  );
  assert(
    destino.celdas[2][2].esTransitable === true,
    'atravesar garantiza una aparición transitable',
  );
  assert(
    tieneSalida(destino.celdas, 2, 2),
    'la aparición no queda sellada: tiene un muro abierto hacia celda transitable',
  );
  assert(gestor.obtenerCeldas() === destino.celdas, 'obtenerCeldas sigue al nodo activo tras atravesar');

  // Conmutación de vuelta
  const conectorVuelta = conectorBase({
    id: 'con-vuelta',
    nodoOrigenId: destino.id,
    filaO: 2,
    columnaO: 2,
    nodoDestinoId: raiz.id,
    filaD: 1,
    columnaD: 1,
  });
  gestor.registrarConector(conectorVuelta);
  const vuelta = gestor.atravesar(conectorVuelta.id);
  assert(vuelta.nodo === raiz, 'atravesar de vuelta devuelve la raíz');
  assert(gestor.nodoActivoId === raiz.id, 'atravesar de vuelta conmuta el nodo activo');
  assert(raiz.celdas[1][1].esTransitable === true, 'la aparición de vuelta queda transitable');

  // Errores de programación
  assertLanza(() => gestor.atravesar('inexistente'), 'atravesar con id desconocido lanza');
  const gestorVacio = new GestorMundo();
  gestorVacio.nodoActivoId = 'fantasma';
  assertLanza(() => gestorVacio.obtenerNodoActivo(), 'obtenerNodoActivo lanza si el nodo no existe');

  // Destino fuera de rango: se rechaza (lanza), no se devuelve un spawn inválido
  const conectorFuera = conectorBase({
    id: 'con-fuera',
    nodoOrigenId: raiz.id,
    filaO: 1,
    columnaO: 1,
    nodoDestinoId: destino.id,
    filaD: 999,
    columnaD: 0,
  });
  gestor.registrarConector(conectorFuera);
  gestor.nodoActivoId = raiz.id;
  assertLanza(
    () => gestor.atravesar('con-fuera'),
    'atravesar rechaza una aparición fuera de rango',
  );
  assert(
    gestor.nodoActivoId === raiz.id,
    'tras rechazar una aparición inválida el nodo activo no cambia',
  );

  // Materialización perezosa: destino ausente => generarNodo determinista
  const crearGestorLazily = (): GestorMundo => {
    const g = new GestorMundo();
    const r = g.crearMundoInicial(
      { nombre: 'mazmorra', version: 1, seed: 7, params: {} },
      20,
      20,
    );
    g.registrarConector(
      conectorBase({
        id: 'portal-lazy-1',
        nodoOrigenId: r.id,
        filaO: 3,
        columnaO: 4,
        nodoDestinoId: 'zona-nueva',
        filaD: 5,
        columnaD: 6,
      }),
    );
    return g;
  };

  const gA = crearGestorLazily();
  const resA = gA.atravesar('portal-lazy-1');
  assert(resA.nodo.id === 'zona-nueva', 'atravesar materializa el nodo destino ausente');
  assert(resA.nodo.padreId === 'raiz', 'el nodo materializado cuelga del origen (padreId)');
  assert(
    resA.nodo.filas === 20 && resA.nodo.columnas === 20,
    'el nodo materializado hereda las dimensiones del origen',
  );
  assert(
    resA.nodo.celdas[5][6].esTransitable === true,
    'la aparición del nodo materializado es transitable',
  );
  assert(
    tieneSalida(resA.nodo.celdas, 5, 6),
    'la aparición del nodo materializado no queda sellada (muro abierto a celda transitable)',
  );

  const gB = crearGestorLazily();
  const resB = gB.atravesar('portal-lazy-1');
  assert(
    mapasIguales(resA.nodo.celdas, resB.nodo.celdas),
    'la materialización perezosa es determinista para el mismo conector',
  );
  assert(
    resA.nodo.gen.seed !== 7,
    'la semilla del nodo materializado deriva de la del origen (no la repite)',
  );

  // Nodo ya materializado no se regenera al atravesar dos veces
  const mapaAntes = resA.nodo.celdas[0][0].esTransitable;
  gA.atravesar('portal-lazy-1');
  assert(
    gA.obtenerNodoActivo() === resA.nodo && resA.nodo.celdas[0][0].esTransitable === mapaAntes,
    'atravesar reutiliza el nodo ya materializado sin regenerarlo',
  );

  console.log(`${ok}/${total} ok`);
}

main();
