import { Celda } from './Celda';
import { GestorMundo } from './GestorMundo';
import { generarNodo } from './generadores';
import {
  aplicarDeltaConPersistencia,
  arrancarMundoGestor,
  celdasCompatibilidad,
  esLadoAutoritativo,
  planificarArranque,
  rehidratarNodoTrasCruce,
  sembrarMundoBase,
  type NodoPersistidoLike,
  type PersistenciaMundoLike,
} from './integracion';
import { HousingLocal, type AlmacenamientoLocal } from './housing';
import {
  aplicarDelta,
  FMT_DELTA,
  leerSnapshotNodo,
  restaurarEnemigos,
  type DeltaMundo,
  type EnemigoFoto,
  type GenSpec,
  type NodoMundo,
} from './mundo';

declare const process: { exit(codigo: number): void };

class AlmacenTest implements AlmacenamientoLocal {
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

function mundoEsperado(gen: GenSpec, filas: number, columnas: number, deltas: DeltaMundo[]): Celda[][] {
  const celdas = generarNodo(gen, filas, columnas);
  for (const delta of deltas) aplicarDelta(celdas, delta);
  return celdas;
}

function mismosMundos(a: Celda[][], b: Celda[][]): boolean {
  if (a.length !== b.length) return false;
  for (let f = 0; f < a.length; f++) {
    if (a[f].length !== b[f].length) return false;
    for (let c = 0; c < a[f].length; c++) {
      const x = a[f][c];
      const y = b[f][c];
      if (x.esTransitable !== y.esTransitable) return false;
      if (JSON.stringify(x.alimento) !== JSON.stringify(y.alimento)) return false;
      if (JSON.stringify(x.burbuja) !== JSON.stringify(y.burbuja)) return false;
      if (x.tipoEscenario !== y.tipoEscenario || x.estadoEscenario !== y.estadoEscenario) return false;
      if (x.sueloDecor !== y.sueloDecor || x.mueble !== y.mueble) return false;
      if (x.tienePico !== y.tienePico) return false;
    }
  }
  return true;
}

async function main(): Promise<void> {
  // Gate autoritativo por modo activo (regresion: invitado HTTP no siembra)
  assert(
    esLadoAutoritativo({ modo: 'firebase', esHost: false, firebaseMpActivo: false, httpMpActivo: false }) === true,
    'solo (sin multiplayer activo) es lado autoritativo',
  );
  assert(
    esLadoAutoritativo({ modo: 'manual', esHost: false, firebaseMpActivo: false, httpMpActivo: false }) === true,
    'manual es lado autoritativo',
  );
  assert(
    esLadoAutoritativo({ modo: 'firebase', esHost: true, firebaseMpActivo: true, httpMpActivo: false }) === true,
    'host firebase es lado autoritativo',
  );
  assert(
    esLadoAutoritativo({ modo: 'firebase', esHost: false, firebaseMpActivo: true, httpMpActivo: false }) === false,
    'invitado firebase no es lado autoritativo',
  );
  assert(
    esLadoAutoritativo({ modo: 'http', esHost: true, firebaseMpActivo: false, httpMpActivo: true }) === true,
    'host http es lado autoritativo',
  );
  assert(
    esLadoAutoritativo({ modo: 'http', esHost: false, firebaseMpActivo: false, httpMpActivo: true }) === false,
    'invitado http no es lado autoritativo (no siembra mundo local)',
  );

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

  // Fix round 1 / item 2: un nodo compactado (fase 2) se carga — gen + celdas plegadas + deltas pendientes
  const GEN_COMPACTADO: GenSpec = { nombre: 'mazmorra', version: 1, seed: 42, params: {} };
  const cavarPlegado: DeltaMundo = {
    fmt: FMT_DELTA,
    nodoId: 'raiz',
    fila: 0,
    columna: 0,
    autoria: 'L1',
    tick: 5,
    cambio: { tipo: 'cavar' },
  };
  const escenarioPlegado: DeltaMundo = {
    fmt: FMT_DELTA,
    nodoId: 'raiz',
    fila: 1,
    columna: 1,
    autoria: 'L1',
    tick: 6,
    cambio: { tipo: 'escenario', tipoEscenario: 'puerta', estado: 'cerrada' },
  };
  const alimentoPendiente: DeltaMundo = {
    fmt: FMT_DELTA,
    nodoId: 'raiz',
    fila: 2,
    columna: 2,
    autoria: 'L1',
    tick: 30,
    cambio: { tipo: 'objeto', campo: 'alimento', valor: { tipo: 'Manzana', pc: 5 } },
  };

  const persistenciaCompactada = new PersistenciaMock();
  persistenciaCompactada.nodos = ['raiz'];
  persistenciaCompactada.porNodo.set('raiz', {
    gen: GEN_COMPACTADO,
    ownerId: null,
    deltas: [alimentoPendiente],
    snapshot: { formato: 1, celdas: [cavarPlegado, escenarioPlegado] },
    ultimaCompactacionTick: 10,
  });
  const gestorCompactado = new GestorMundo();
  const arranqueCompactado = await arrancarMundoGestor({
    gestor: gestorCompactado,
    persistencia: persistenciaCompactada,
    filas: 10,
    columnas: 10,
    genPorDefecto: { nombre: 'mazmorra', version: 1, seed: 1, params: {} },
  });
  assert(
    arranqueCompactado.cargado === true,
    'cargar un nodo compactado (fase 2, snapshot formato 1) ya no se rechaza',
  );
  assert(
    gestorCompactado.nodoActivoId === 'raiz',
    'un nodo compactado cargado deja su nodo como activo',
  );
  const esperadoCompactado = mundoEsperado(GEN_COMPACTADO, 10, 10, [cavarPlegado, escenarioPlegado, alimentoPendiente]);
  assert(
    mismosMundos(gestorCompactado.obtenerCeldas(), esperadoCompactado),
    'la reconstrucción coincide con gen + todos los deltas en orden de tick (celdas plegadas + pendientes)',
  );
  const celdaComp = gestorCompactado.obtenerCeldas();
  assert(
    celdaComp[0][0].esTransitable === true &&
      celdaComp[1][1].tipoEscenario === 'puerta' &&
      celdaComp[1][1].estadoEscenario === 'cerrada' &&
      celdaComp[2][2].alimento !== null && celdaComp[2][2].alimento?.tipo === 'Manzana',
    'los delta plegados y el pendiente quedan aplicados a las celdas concretas',
  );

  // Un delta residual con tick <= ultimaCompactacionTick ya está plegado: no se re-aplica en la carga
  const picoRetrasado: DeltaMundo = {
    fmt: FMT_DELTA,
    nodoId: 'raiz',
    fila: 0,
    columna: 0,
    autoria: 'L1',
    tick: 8,
    cambio: { tipo: 'objeto', campo: 'tienePico', valor: true },
  };
  const persistenciaResidual = new PersistenciaMock();
  persistenciaResidual.nodos = ['raiz'];
  persistenciaResidual.porNodo.set('raiz', {
    gen: GEN_COMPACTADO,
    ownerId: null,
    deltas: [picoRetrasado, alimentoPendiente],
    snapshot: { formato: 1, celdas: [cavarPlegado, escenarioPlegado] },
    ultimaCompactacionTick: 10,
  });
  const gestorResidual = new GestorMundo();
  await arrancarMundoGestor({
    gestor: gestorResidual,
    persistencia: persistenciaResidual,
    filas: 10,
    columnas: 10,
    genPorDefecto: GEN_COMPACTADO,
  });
  assert(
    gestorResidual.obtenerCeldas()[0][0].tienePico === false,
    'un delta residual con tick <= ultimaCompactacionTick no se re-aplica (ya está plegado)',
  );

  // Snapshot corrupto/sin formato: degradar a fase 1 (gen + TODOS los deltas)
  const cavarCorrupto: DeltaMundo = {
    fmt: FMT_DELTA,
    nodoId: 'raiz',
    fila: 3,
    columna: 3,
    autoria: 'L1',
    tick: 5,
    cambio: { tipo: 'cavar' },
  };
  const picoCorrupto: DeltaMundo = {
    fmt: FMT_DELTA,
    nodoId: 'raiz',
    fila: 4,
    columna: 4,
    autoria: 'L1',
    tick: 12,
    cambio: { tipo: 'objeto', campo: 'tienePico', valor: true },
  };
  const persistenciaCorrupta = new PersistenciaMock();
  persistenciaCorrupta.nodos = ['raiz'];
  persistenciaCorrupta.porNodo.set('raiz', {
    gen: GEN_COMPACTADO,
    ownerId: null,
    deltas: [cavarCorrupto, picoCorrupto],
    snapshot: { formato: 2, celdas: [cavarPlegado] },
    ultimaCompactacionTick: 10,
  });
  const gestorCorrupto = new GestorMundo();
  const arranqueCorrupto = await arrancarMundoGestor({
    gestor: gestorCorrupto,
    persistencia: persistenciaCorrupta,
    filas: 10,
    columnas: 10,
    genPorDefecto: GEN_COMPACTADO,
  });
  assert(
    arranqueCorrupto.cargado === true &&
      gestorCorrupto.obtenerCeldas()[3][3].esTransitable === true &&
      gestorCorrupto.obtenerCeldas()[4][4].tienePico === true,
    'snapshot sin formato 1: se degrada a gen + todos los deltas (como fase 1, sin throw)',
  );
  const esperadoCorrupto = mundoEsperado(GEN_COMPACTADO, 10, 10, [cavarCorrupto, picoCorrupto]);
  assert(
    mismosMundos(gestorCorrupto.obtenerCeldas(), esperadoCorrupto),
    'la degradación reproduce gen + todos los deltas en orden de tick',
  );

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

    // --- M3: conectores espejo (vuelta) ---
    assert(
      sembrado.conectorInterVuelta.id !== sembrado.conectorInter.id &&
        sembrado.conectorInterVuelta.tipo === 'entrada' &&
        sembrado.conectorInterVuelta.nodoOrigenId === sembrado.nodoHijo.id &&
        sembrado.conectorInterVuelta.nodoDestinoId === raizSembrada.id,
      'el conector de zona registra un espejo de vuelta (hijo -> raíz)',
    );
    assert(
      gestorSembrado.conectorEn(sembrado.conectorInter.filaD, sembrado.conectorInter.columnaD) ===
        sembrado.conectorInterVuelta,
      'conectorEn localiza el espejo en la celda de llegada del hijo',
    );
    assert(
      sembrado.portalHousingVuelta.tipo === 'entrada' &&
        sembrado.portalHousingVuelta.nodoOrigenId === sembrado.casa.id &&
        sembrado.portalHousingVuelta.nodoDestinoId === raizSembrada.id,
      'el portal de housing registra un espejo de vuelta (casa -> raíz)',
    );
    assert(
      sembrado.casa.celdas[sembrado.portalHousingVuelta.filaO][sembrado.portalHousingVuelta.columnaO].esPortal,
      'el espejo de vuelta marca esPortal en la celda de llegada de la casa',
    );

    // ida y vuelta reales por el conector de zona
    const gestorIda = new GestorMundo();
    const raizIda = gestorIda.crearMundoInicial(GEN_RAIZ, 20, 20);
    const sembradoIda = sembrarMundoBase({
      gestor: gestorIda,
      housing: new HousingLocal('L1', new AlmacenTest()),
      idLocal: 'L1',
      filas: 20,
      columnas: 20,
    });
    assert(sembradoIda !== null, 'el sembrado de ida/vuelta se produce');
    if (sembradoIda) {
      gestorIda.atravesar(sembradoIda.conectorInter.id);
      assert(
        gestorIda.nodoActivoId === sembradoIda.nodoHijo.id,
        'ida: el nodo activo es el hijo generado',
      );
      const vuelta = gestorIda.atravesar(sembradoIda.conectorInterVuelta.id);
      assert(gestorIda.nodoActivoId === raizIda.id, 'vuelta: el nodo activo regresa a la raíz');
      assert(
        vuelta.fila === sembradoIda.conectorInter.filaO &&
          vuelta.columna === sembradoIda.conectorInter.columnaO,
        'vuelta: se aterriza en la celda del conector de zona en la raíz',
      );

      gestorIda.atravesar(sembradoIda.portalHousing.id);
      assert(gestorIda.nodoActivoId === sembradoIda.casa.id, 'ida: el nodo activo es la casa');
      const casaVuelta = gestorIda.atravesar(sembradoIda.portalHousingVuelta.id);
      assert(gestorIda.nodoActivoId === raizIda.id, 'vuelta: desde la casa se regresa a la raíz');
      assert(
        casaVuelta.fila === sembradoIda.portalHousing.filaO &&
          casaVuelta.columna === sembradoIda.portalHousing.columnaO,
        'vuelta: se aterriza en la celda del portal de housing en la raíz',
      );
    }
  }

  // --- M1: casaPrevia se adopta tal cual (no se regenera) ---
  const gestorPrevio = new GestorMundo();
  gestorPrevio.crearMundoInicial(GEN_RAIZ, 20, 20);
  const casaPrevia = crearNodoPersonal('casa-prev', 'L1', 5, 5);
  casaPrevia.celdas[0][0].tipoEscenario = 'puerta';
  const sembradoPrevio = sembrarMundoBase({
    gestor: gestorPrevio,
    housing: new HousingLocal('L1', new AlmacenTest()),
    idLocal: 'L1',
    filas: 20,
    columnas: 20,
    casaPrevia,
  });
  assert(sembradoPrevio !== null, 'sembrarMundoBase acepta casaPrevia y produce sembrado');
  if (sembradoPrevio) {
    assert(
      gestorPrevio.mundo.get('casa-prev') === casaPrevia,
      'casaPrevia queda registrada en el gestor (no se regenera)',
    );
    assert(sembradoPrevio.casa.id === 'casa-prev', 'el sembrado usa la casa previa como casa');
    assert(
      sembradoPrevio.portalHousing.nodoDestinoId === 'casa-prev',
      'el portal de housing apunta a la casa previa',
    );
    assert(
      gestorPrevio.mundo.get('casa-L1') === undefined,
      'no se genera la casa nueva cuando hay casaPrevia',
    );
  }

  // --- Fase 2: restauración fiel de enemigos desde el snapshot del nodo ---
  const fotoRestaurar: EnemigoFoto[] = [
    { id: '3', fila: 2, columna: 3, nombre: 'Orco de la sala', tipo: 'Orco', vidaActual: 4, vidaMaxima: 10 },
    { id: '8', fila: 7, columna: 8, nombre: 'Esqueleto', tipo: 'Esqueleto', vidaActual: 0, vidaMaxima: 8 },
    { id: '5', fila: 9, columna: 1, nombre: 'Goblin', tipo: 'Goblin', vidaActual: 3, vidaMaxima: 6 },
  ];
  const reconstruidos = restaurarEnemigos(
    { formato: 1, enemigos: fotoRestaurar },
    (d) => ({ ...d, estaVivo: d.vidaActual > 0 }),
  );
  assert(reconstruidos.length === 3, 'restaurarEnemigos reconstruye la foto completa');
  assert(
    reconstruidos[0].id === '3' &&
      reconstruidos[0].fila === 2 &&
      reconstruidos[0].columna === 3 &&
      reconstruidos[0].nombre === 'Orco de la sala' &&
      reconstruidos[0].tipo === 'Orco' &&
      reconstruidos[0].vidaActual === 4 &&
      reconstruidos[0].vidaMaxima === 10,
    'restauración fiel: id/posición/nombre/tipo/vida quedan tal cual la foto',
  );
  assert(
    reconstruidos[1].fila === 7 && reconstruidos[1].columna === 8,
    'las posiciones se restauran tal cual (también para muertos)',
  );
  assert(
    reconstruidos[1].estaVivo === false && reconstruidos[1].vidaActual === 0,
    'los muertos siguen muertos al restaurar (vidaActual 0 -> estaVivo false)',
  );
  assert(
    reconstruidos[0].estaVivo === true && reconstruidos[2].estaVivo === true,
    'los vivos siguen vivos al restaurar',
  );

  assert(restaurarEnemigos(undefined, (d) => d).length === 0, 'sin snapshot no hay restauración');
  assert(restaurarEnemigos(null, (d) => d).length === 0, 'snapshot null: restauración vacía');
  assert(
    restaurarEnemigos({ formato: 1 }, (d) => d).length === 0,
    'snapshot sin enemigos: restauración vacía (el llamador deja la siembra)',
  );
  assert(
    restaurarEnemigos(
      { formato: 2, enemigos: [{ id: 'x', fila: 0, columna: 0, nombre: '?', tipo: '?', vidaActual: 1, vidaMaxima: 2 }] },
      (d) => d,
    ).length === 0,
    'formato desconocido se ignora (forward-compat)',
  );

  const conInvalidez = {
    formato: 1,
    enemigos: [
      { id: 'a', fila: 1, columna: 1, nombre: 'n', tipo: 'Orco', vidaActual: '5', vidaMaxima: 10 },
      { id: 'b', fila: 2, columna: 2, nombre: 'n', tipo: 'Orco', vidaActual: 5, vidaMaxima: 10 },
      { id: 'c', fila: -3, columna: 2, nombre: 'n', tipo: 'Orco', vidaActual: 5, vidaMaxima: 10 },
    ],
  };
  assert(
    restaurarEnemigos(conInvalidez, (d) => d).length === 1 &&
      restaurarEnemigos(conInvalidez, (d) => d)[0].id === 'b',
    'las entradas de foto corruptas se descartan (tolerancia a datos remotos)',
  );

  const clampeada = restaurarEnemigos(
    { formato: 1, enemigos: [{ id: 'c', fila: 0, columna: 0, nombre: 'n', tipo: 't', vidaActual: 99, vidaMaxima: 10 }] },
    (d) => d,
  );
  assert(
    clampeada.length === 1 && clampeada[0].vidaActual === 10,
    'la vida restaurada se acota a [0, vidaMaxima]',
  );

  // --- M3: la foto de enemigos se acota a las dims del destino ---
  const fotoGrande: EnemigoFoto[] = [
    { id: 'g1', fila: 30, columna: 24, nombre: 'Minotauro', tipo: 'Minotauro', vidaActual: 5, vidaMaxima: 10 },
    { id: 'g2', fila: 5, columna: 8, nombre: 'Goblin', tipo: 'Goblin', vidaActual: 0, vidaMaxima: 8 },
    { id: 'g3', fila: 8, columna: 15, nombre: 'Orco', tipo: 'Orco', vidaActual: 3, vidaMaxima: 10 },
    { id: 'g4', fila: 0, columna: 16, nombre: 'Orco borde', tipo: 'Orco', vidaActual: 2, vidaMaxima: 10 },
  ];
  const acotada = restaurarEnemigos({ formato: 1, enemigos: fotoGrande }, (d) => ({ ...d, estaVivo: d.vidaActual > 0 }), { filas: 9, columnas: 16 });
  const idsAcotados = acotada.map((e) => e.id).join(',');
  assert(
    acotada.length === 2 && idsAcotados === 'g2,g3',
    'M3 dims: fila 30 sobre rejilla 9×16 se descarta (sin posiciones inventadas) y columna 16 = columnas también',
  );
  assert(
    acotada.some((e) => e.id === 'g2' && e.estaVivo === false && e.vidaActual === 0),
    'M3 dims: los muertos VÁLIDOS se conservan (siguen muertos)',
  );
  assert(
    acotada.some((e) => e.id === 'g3' && e.fila === 8 && e.columna === 15 && e.estaVivo === true),
    'M3 dims: la foto válida se conserva tal cual en el borde de rejilla (8,15)',
  );
  assert(
    restaurarEnemigos({ formato: 1, enemigos: fotoGrande }, (d) => ({ ...d, estaVivo: d.vidaActual > 0 })).length === 4,
    'M3: sin dims no hay filtro (compatibilidad con el llamador sin nodo activo)',
  );

  const leido = leerSnapshotNodo({
    formato: 1,
    escenario: [{ fila: 0, columna: 0, tipoEscenario: 'puerta', estadoEscenario: 'cerrada' }],
    celdas: [deltaAlimento(0, 0)],
  });
  assert(
    leido.formato === 1 &&
      leido.escenario?.length === 1 &&
      leido.escenario[0].tipoEscenario === 'puerta' &&
      leido.celdas?.length === 1 &&
      leido.celdas[0].tick === 1,
    'leerSnapshotNodo conserva las partes reconocidas del formato 1 (escenario/celdas)',
  );
  assert(
    leerSnapshotNodo({ formato: 3, enemigos: fotoRestaurar }).enemigos === undefined,
    'leerSnapshotNodo rechaza formato distinto de 1',
  );
  assert(
    leerSnapshotNodo('basura').formato === 1 && !leerSnapshotNodo('basura').enemigos,
    'leerSnapshotNodo tolera datos no-objeto (snapshot vacío normalizado)',
  );

  // --- Fase 2 (I1): historia del nodo destino rehidratada tras el cruce ---
  // El host con persistenciaMundo materializa el destino por gen al travesar
  // (atravesar -> materializarDestino); la historia persistida (snapshot.celdas
  // + deltas por tick) debe aplicarse sobre ese nodo ANTES de que el mapa viaje
  // al invitado (enviarMapaAlInvitado). El guard anti-race
  // (nodoActivoId !== destinoId) y la llamada quedan wiring en main.ts
  // (conmutarSnapshotEnemigos): solo-en-tsc, main no es bundle-eable.
  const gestorCruce = new GestorMundo();
  gestorCruce.crearMundoInicial(GEN_RAIZ, 6, 6);
  gestorCruce.registrarPortalPersonal({
    id: 'con-casa-1',
    tipo: 'portal',
    nodoOrigenId: 'raiz',
    filaO: 0,
    columnaO: 0,
    nodoDestinoId: 'casa-L1',
    filaD: 0,
    columnaD: 0,
    housingOwnerId: 'L1',
  });
  gestorCruce.atravesar('con-casa-1');
  assert(gestorCruce.nodoActivoId === 'casa-L1', 'I1: el cruce activa el nodo destino materializado por gen');
  const destinoI1 = gestorCruce.mundo.get('casa-L1');
  assert(
    destinoI1 !== undefined && destinoI1.celdas[1][1].mueble === null,
    'I1: sin historia el destino materializado por gen no lleva edición alguna (el gen mazmorra no coloca muebles)',
  );
  const casaPersistida: NodoPersistidoLike = {
    gen: GEN_RAIZ,
    ownerId: 'L1',
    deltas: [
      { fmt: FMT_DELTA, nodoId: 'casa-L1', fila: 1, columna: 1, autoria: 'L1', tick: 5, cambio: { tipo: 'cavar' } },
      {
        fmt: FMT_DELTA,
        nodoId: 'casa-L1',
        fila: 1,
        columna: 1,
        autoria: 'L1',
        tick: 7,
        cambio: { tipo: 'objeto', campo: 'alimento', valor: { tipo: 'Manzana', pc: 5 } },
      },
      { fmt: FMT_DELTA, nodoId: 'casa-L1', fila: 2, columna: 2, autoria: 'L1', tick: 9, cambio: { tipo: 'decor', campo: 'mueble', valor: 'mesa' } },
    ],
  };
  const aplicoI1 = rehidratarNodoTrasCruce(gestorCruce, 'casa-L1', casaPersistida);
  assert(aplicoI1 === true, 'I1: rehidratarNodoTrasCruce aplica la historia persistida del destino');
  assert(
    !!destinoI1 &&
      destinoI1.celdas[1][1].esTransitable === true &&
      destinoI1.celdas[1][1].alimento !== null &&
      destinoI1.celdas[1][1].alimento?.tipo === 'Manzana',
    'I1: tras el flujo de cruce la celda del destino queda transitable y con alimento (historia completa)',
  );
  assert(
    !!destinoI1 && destinoI1.celdas[2][2].mueble === 'mesa',
    'I1: el decor persistido del destino se rehidrata al travesar',
  );
  assert(
    !!destinoI1 && gestorCruce.obtenerCeldas() === destinoI1.celdas,
    'I1: las celdas del nodo activo del cruce son las rehidratadas (la vista y el envío las observan)',
  );

  assert(rehidratarNodoTrasCruce(gestorCruce, 'nodo-fantasma', casaPersistida) === false, 'I1: destino inexistente no rehidrata (guard de nodo)');
  assert(rehidratarNodoTrasCruce(gestorCruce, 'casa-L1', null) === false, 'I1: sin doc persistido no rehidrata (guard de doc)');
  assert(
    rehidratarNodoTrasCruce(gestorCruce, 'casa-L1', { gen: GEN_RAIZ, ownerId: null, deltas: [] }) === false,
    'I1: doc sin historia (sin deltas ni snapshot) no rehidrata',
  );

  console.log(`${ok}/${total} ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
