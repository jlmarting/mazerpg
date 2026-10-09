import { Celda } from './Celda';
import { GestorMundo } from './GestorMundo';
import {
  aplicarDeltaConPersistencia,
  arrancarMundoGestor,
  celdasCompatibilidad,
  planificarArranque,
  sembrarMundoBase,
  type NodoPersistidoLike,
  type PersistenciaMundoLike,
} from './integracion';
import { HousingLocal, type AlmacenamientoLocal } from './housing';
import { FMT_DELTA, type DeltaMundo, type GenSpec, type NodoMundo } from './mundo';

declare const process: { exit(codigo: number): void };

class AlmacenTest implements AlmacenamientoLocal {
  private readonly datos: Map<string, string> = new Map();
  getItem(clave: string): string | null {
    return this.datos.has(clave) ? (this.datos.get(clave) as string) : null;
  }
  setItem(clave: string, valor: string): void {
    this.datos.set(clave, valor);
  }
}

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

class PersistenciaMock implements PersistenciaMundoLike {
  nodos: string[] = [];
  porNodo: Map<string, NodoPersistidoLike> = new Map();
  guardados: string[] = [];

  async listarNodos(): Promise<string[]> {
    return this.nodos;
  }

  async cargarNodo(nodoId: string): Promise<NodoPersistidoLike | null> {
    return this.porNodo.get(nodoId) ?? null;
  }

  async guardarNodo(nodoId: string, _gen: GenSpec, _ownerId: string | null): Promise<void> {
    this.guardados.push(nodoId);
  }
}

const GEN_RAIZ: GenSpec = { nombre: 'mazmorra', version: 1, seed: 42, params: {} };

function deltaAlimento(fila: number, columna: number): DeltaMundo {
  return {
    fmt: FMT_DELTA,
    nodoId: 'raiz',
    fila,
    columna,
    autoria: 'jugador-1',
    tick: 1,
    cambio: { tipo: 'objeto', campo: 'alimento', valor: { tipo: 'Manzana', pc: 5 } },
  };
}

function crearNodoPersonal(id: string, ownerId: string | null, filas: number, columnas: number): NodoMundo {
  const celdas: Celda[][] = [];
  for (let f = 0; f < filas; f++) {
    celdas[f] = [];
    for (let c = 0; c < columnas; c++) {
      celdas[f][c] = new Celda(f, c);
    }
  }
  return {
    id,
    padreId: null,
    transform: { df: 0, dc: 0 },
    filas,
    columnas,
    tipo: 'personal',
    gen: { nombre: 'mazmorra', version: 1, seed: 1, params: {} },
    celdas,
    ownerId,
  };
}

async function main(): Promise<void> {
  // Decisión pura de arranque
  assert(planificarArranque([]).tipo === 'crear', 'sin nodos persistidos se decide crear la raíz');
  const conRaiz = planificarArranque(['raiz']);
  assert(conRaiz.tipo === 'cargar' && conRaiz.nodoId === 'raiz', 'con mundo persistido se carga la raíz');
  const conVarios = planificarArranque(['otro', 'raiz']);
  assert(
    conVarios.tipo === 'cargar' && conVarios.nodoId === 'raiz',
    'con varios nodos persistidos la raíz tiene prioridad',
  );
  const soloOtro = planificarArranque(['otro']);
  assert(
    soloOtro.tipo === 'cargar' && soloOtro.nodoId === 'otro',
    'sin raíz explícita se carga el primer nodo persistido',
  );

  // Partida sin mundos: un único nodo BSP, comportamiento actual
  const gestorNuevo = new GestorMundo();
  const { nodo: raizSinMundos, cargado: cargadoSinMundos } = await arrancarMundoGestor({
    gestor: gestorNuevo,
    persistencia: null,
    filas: 10,
    columnas: 8,
    genPorDefecto: GEN_RAIZ,
  });
  assert(raizSinMundos.id === 'raiz', 'sin mundos la raíz creada tiene id raiz');
  assert(cargadoSinMundos === false, 'un mundo recién creado se marca como no cargado');
  assert(raizSinMundos.padreId === null, 'sin mundos la raíz no tiene padre');
  assert(raizSinMundos.tipo === 'mazmorra', 'sin mundos la raíz es tipo mazmorra');
  assert(
    gestorNuevo.obtenerCeldas().length === 10 && gestorNuevo.obtenerCeldas()[0].length === 8,
    'sin mundos la raíz tiene las dimensiones pedidas',
  );
  assert(gestorNuevo.nodoActivoId === 'raiz', 'sin mundos la raíz queda como nodo activo');

  // Partida sin mundos con persistencia: materializa el nodo raíz
  const persistenciaVacia = new PersistenciaMock();
  const gestorPersistNuevo = new GestorMundo();
  await arrancarMundoGestor({
    gestor: gestorPersistNuevo,
    persistencia: persistenciaVacia,
    filas: 10,
    columnas: 10,
    genPorDefecto: GEN_RAIZ,
  });
  assert(
    persistenciaVacia.guardados.join(',') === 'raiz',
    'sin mundos el arranque materializa el nodo raíz (persistencia invocada)',
  );

  // Partida con mundos: carga el nodo persistido y lo deja activo
  const persistenciaLlena = new PersistenciaMock();
  persistenciaLlena.nodos = ['raiz'];
  persistenciaLlena.porNodo.set('raiz', {
    gen: GEN_RAIZ,
    ownerId: null,
    deltas: [deltaAlimento(0, 0)],
  });
  const gestorPersist = new GestorMundo();
  const arranqueCargado = await arrancarMundoGestor({
    gestor: gestorPersist,
    persistencia: persistenciaLlena,
    filas: 10,
    columnas: 10,
    genPorDefecto: { nombre: 'mazmorra', version: 1, seed: 999, params: {} },
  });
  assert(arranqueCargado.cargado === true, 'un mundo persistido se marca como cargado');
  assert(gestorPersist.nodoActivoId === 'raiz', 'con mundos el nodo persistido queda activo');
  const celdaCargada = gestorPersist.obtenerCeldas()[0][0];
  assert(
    celdaCargada.alimento !== null && celdaCargada.alimento.tipo === 'Manzana',
    'con mundos se aplican los deltas persistidos al materializar',
  );
  assert(
    persistenciaLlena.guardados.length === 0,
    'cargar un mundo persistido no re-materializa el nodo (no resetea metadatos)',
  );
  assert(
    JSON.stringify(gestorPersist.obtenerNodoActivo().gen) === JSON.stringify(GEN_RAIZ),
    'el nodo cargado conserva el gen persistido (no el gen por defecto)',
  );

  // Getter de compatibilidad: delega en el nodo activo
  const respaldo: Celda[][] = [];
  const compatConNodo = celdasCompatibilidad(gestorPersist, respaldo);
  assert(compatConNodo === gestorPersist.obtenerCeldas(), 'el getter de compatibilidad == nodo activo');
  assert(
    celdasCompatibilidad(gestorPersist, respaldo) === gestorPersist.obtenerNodoActivo().celdas,
    'el getter de compatibilidad devuelve las celdas del nodo activo',
  );
  const gestorVacio = new GestorMundo();
  assert(
    celdasCompatibilidad(gestorVacio, respaldo) === respaldo,
    'sin nodo activo el getter de compatibilidad devuelve el respaldo (retrocompat)',
  );

  // Gate owner-only + persistencia (item T7-5/T7-3)
  const gestorCasa = new GestorMundo();
  const casa = crearNodoPersonal('casa-1', 'dueno', 5, 5);
  gestorCasa.mundo.set(casa.id, casa);
  gestorCasa.nodoActivoId = casa.id;
  const persistidos: DeltaMundo[] = [];
  const deltaDueno = deltaAlimento(0, 0);
  deltaDueno.nodoId = 'casa-1';
  deltaDueno.autoria = 'dueno';
  assert(
    aplicarDeltaConPersistencia(gestorCasa, [], deltaDueno, true, (d) => persistidos.push(d)) === true,
    'el dueño puede aplicar un delta sobre su nodo personal',
  );
  assert(persistidos.length === 1, 'un delta autorizado del host se persiste');

  const deltaIntruso = deltaAlimento(0, 0);
  deltaIntruso.nodoId = 'casa-1';
  deltaIntruso.autoria = 'intruso';
  assert(
    aplicarDeltaConPersistencia(gestorCasa, [], deltaIntruso, true, (d) => persistidos.push(d)) === false,
    'un no-owner no puede aplicar el delta sobre la casa',
  );
  assert(persistidos.length === 1, 'un delta rechazado por el gate no se persiste');

  const deltaNoHost = deltaAlimento(0, 0);
  deltaNoHost.nodoId = 'casa-1';
  deltaNoHost.autoria = 'dueno';
  assert(
    aplicarDeltaConPersistencia(gestorCasa, [], deltaNoHost, false, (d) => persistidos.push(d)) === true,
    'un cliente no-host aplica el delta localmente',
  );
  assert(persistidos.length === 1, 'un cliente no-host no persiste el delta');

  // Regresión Critical: conectorEn sin nodo activo no lanza (retrocompat)
  const gestorSinNodo = new GestorMundo();
  let lanzoConectorEn = false;
  let conectorVacio: unknown = 'sin-asignar';
  try {
    conectorVacio = gestorSinNodo.conectorEn(0, 0);
  } catch {
    lanzoConectorEn = true;
  }
  assert(!lanzoConectorEn, 'conectorEn sin nodo activo no lanza');
  assert(conectorVacio === null, 'conectorEn sin nodo activo devuelve null');

  // Importante #3: un nodo compactado no se puede reconstruir en fase 1
  const persistenciaCompactada = new PersistenciaMock();
  persistenciaCompactada.nodos = ['raiz'];
  persistenciaCompactada.porNodo.set('raiz', {
    gen: GEN_RAIZ,
    ownerId: null,
    deltas: [],
    snapshot: { celdas: 'x' },
    ultimaCompactacionTick: 5,
  });
  const gestorCompactado = new GestorMundo();
  let lanzoCompactado = false;
  try {
    await arrancarMundoGestor({
      gestor: gestorCompactado,
      persistencia: persistenciaCompactada,
      filas: 10,
      columnas: 10,
      genPorDefecto: GEN_RAIZ,
    });
  } catch {
    lanzoCompactado = true;
  }
  assert(lanzoCompactado, 'cargar un nodo compactado se rechaza (snapshot no soportado en fase 1)');
  assert(gestorCompactado.nodoActivoId === '', 'un nodo compactado rechazado no deja nodo activo');

  // C1: sembrado mínimo de mundo (conector alcanzable + portal de housing)
  const almacenCasa = new AlmacenTest();
  const housing = new HousingLocal('L1', almacenCasa);
  const gestorSembrado = new GestorMundo();
  const raizSembrada = gestorSembrado.crearMundoInicial(GEN_RAIZ, 20, 20);
  const sembrado = sembrarMundoBase({
    gestor: gestorSembrado,
    housing,
    idLocal: 'L1',
    filas: 20,
    columnas: 20,
  });
  assert(sembrado !== null, 'sembrarMundoBase produce el sembrado mínimo');
  if (sembrado) {
    assert(
      gestorSembrado.conectores.size >= 2,
      'sembrarMundoBase registra el conector de zona y el portal de housing',
    );
    assert(
      sembrado.conectorInter.nodoOrigenId === raizSembrada.id,
      'el conector de zona parte del nodo raíz',
    );
    assert(
      sembrado.conectorInter.nodoDestinoId === sembrado.nodoHijo.id &&
        sembrado.nodoHijo.tipo === 'abierto',
      'el conector de zona apunta a un nodo hijo generado con otro generador (abierto)',
    );
    assert(
      raizSembrada.celdas[sembrado.conectorInter.filaO][sembrado.conectorInter.columnaO].esTransitable,
      'el origen del conector de zona es una celda transitable',
    );
    assert(
      sembrado.nodoHijo.celdas[sembrado.conectorInter.filaD][sembrado.conectorInter.columnaD].esTransitable,
      'el destino del conector de zona es una celda transitable',
    );
    assert(
      gestorSembrado.conectorEn(sembrado.conectorInter.filaO, sembrado.conectorInter.columnaO) ===
        sembrado.conectorInter,
      'conectorEn localiza el conector de zona desde su celda',
    );

    assert(
      gestorSembrado.conectorEn(sembrado.portalHousing.filaO, sembrado.portalHousing.columnaO) ===
        sembrado.portalHousing,
      'conectorEn localiza el portal de housing desde su celda',
    );
    assert(
      sembrado.casa.ownerId === 'L1' && sembrado.portalHousing.housingOwnerId === 'L1',
      'el portal de housing pertenece al jugador local',
    );
    assert(
      sembrado.portalHousing.nodoDestinoId === sembrado.casa.id,
      'el portal de housing apunta a la casa del dueño',
    );
    assert(
      raizSembrada.celdas[sembrado.portalHousing.filaO][sembrado.portalHousing.columnaO].esTransitable,
      'el origen del portal de housing es una celda transitable',
    );
    assert(
      housing.portales().some((c) => c.id === sembrado.portalHousing.id),
      'el portal de housing queda registrado en HousingLocal (fuente de atenuación)',
    );
    assert(
      housing.portalDisponible(sembrado.portalHousing, new Set(['L1'])) === true,
      'el portal de housing está activo con el dueño online',
    );
    assert(
      housing.portalDisponible(sembrado.portalHousing, new Set<string>()) === false,
      'el portal de housing queda inactivo con el dueño offline',
    );
    assert(
      housing.cargarCasa()?.ownerId === 'L1',
      'la casa sembrada queda persistida localmente para el dueño',
    );

    const aparicionSembrado = gestorSembrado.atravesar(sembrado.conectorInter.id);
    assert(
      aparicionSembrado.nodo.id === sembrado.nodoHijo.id &&
        gestorSembrado.nodoActivoId === sembrado.nodoHijo.id,
      'la travesía del conector de zona conmuta el nodo activo al hijo (alcanzable en runtime)',
    );
  }

  console.log(`${ok}/${total} ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
