import { PersistenciaMundo } from './PersistenciaMundo';
import type {
  CollectionLike,
  DocLike,
  DocSnapLike,
  FirestoreLike,
  QueryLike,
  QuerySnapLike,
} from './PersistenciaMundo';
import { FMT_DELTA, type DeltaMundo, type GenSpec } from './mundo';

declare const process: { exit(codigo: number): void };

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

interface Filtro {
  campo: string;
  op: string;
  valor: unknown;
}

interface Orden {
  campo: string;
  direccion: 'asc' | 'desc';
}

function comparar(a: unknown, op: string, b: unknown): boolean {
  const na = typeof a === 'number' ? a : 0;
  const nb = typeof b === 'number' ? b : 0;
  switch (op) {
    case '==':
      return a === b;
    case '<=':
      return na <= nb;
    case '<':
      return na < nb;
    case '>=':
      return na >= nb;
    case '>':
      return na > nb;
    default:
      return false;
  }
}

class MockDocSnap implements DocSnapLike {
  constructor(private readonly doc: MockDoc) {}
  get id(): string {
    return this.doc.id;
  }
  get exists(): boolean {
    return this.doc.datos !== undefined;
  }
  data(): Record<string, unknown> | undefined {
    return this.doc.datos;
  }
}

class MockQuerySnap implements QuerySnapLike {
  constructor(private readonly lista: DocSnapLike[]) {}
  get docs(): DocSnapLike[] {
    return this.lista;
  }
  get empty(): boolean {
    return this.lista.length === 0;
  }
  forEach(cb: (doc: DocSnapLike) => void): void {
    this.lista.forEach(cb);
  }
}

class MockQuery implements QueryLike {
  constructor(
    private readonly coleccion: MockCollection,
    private readonly filtros: Filtro[],
    private readonly orden: Orden | null,
  ) {}

  async get(): Promise<QuerySnapLike> {
    let lista = [...this.coleccion.docs.values()].filter((d) => d.datos !== undefined);
    for (const f of this.filtros) {
      lista = lista.filter((d) => comparar(d.datos?.[f.campo], f.op, f.valor));
    }
    if (this.orden) {
      const { campo, direccion } = this.orden;
      lista.sort((a, b) => {
        const va = a.datos?.[campo];
        const vb = b.datos?.[campo];
        const na = typeof va === 'number' ? va : 0;
        const nb = typeof vb === 'number' ? vb : 0;
        return direccion === 'desc' ? nb - na : na - nb;
      });
    }
    return new MockQuerySnap(lista.map((d) => new MockDocSnap(d)));
  }
}

class MockCollection implements CollectionLike {
  readonly docs = new Map<string, MockDoc>();
  private auto = 0;

  doc(id?: string): DocLike {
    const clave = id ?? `auto_${this.auto++}`;
    let doc = this.docs.get(clave);
    if (!doc) {
      doc = new MockDoc(clave);
      this.docs.set(clave, doc);
    }
    return doc;
  }

  where(campo: string, op: string, valor: unknown): QueryLike {
    return new MockQuery(this, [{ campo, op, valor }], null);
  }

  orderBy(campo: string, direccion: 'asc' | 'desc' = 'asc'): QueryLike {
    return new MockQuery(this, [], { campo, direccion });
  }

  async get(): Promise<QuerySnapLike> {
    return new MockQuery(this, [], null).get();
  }
}

class MockDoc implements DocLike {
  datos: Record<string, unknown> | undefined = undefined;
  private readonly colecciones = new Map<string, MockCollection>();

  constructor(readonly id: string) {}

  collection(nombre: string): CollectionLike {
    let coleccion = this.colecciones.get(nombre);
    if (!coleccion) {
      coleccion = new MockCollection();
      this.colecciones.set(nombre, coleccion);
    }
    return coleccion;
  }

  async get(): Promise<DocSnapLike> {
    return new MockDocSnap(this);
  }

  async set(datos: Record<string, unknown>, opciones?: { merge?: boolean }): Promise<void> {
    this.datos = opciones?.merge && this.datos ? { ...this.datos, ...datos } : { ...datos };
  }

  async update(datos: Record<string, unknown>): Promise<void> {
    if (!this.datos) throw new Error(`update sobre documento inexistente: ${this.id}`);
    this.datos = { ...this.datos, ...datos };
  }

  async delete(): Promise<void> {
    this.datos = undefined;
  }
}

class MockFirestore implements FirestoreLike {
  private readonly colecciones = new Map<string, MockCollection>();

  collection(nombre: string): CollectionLike {
    let coleccion = this.colecciones.get(nombre);
    if (!coleccion) {
      coleccion = new MockCollection();
      this.colecciones.set(nombre, coleccion);
    }
    return coleccion;
  }
}

function crearDelta(nodoId: string, tick: number, fila = 0, columna = 0): DeltaMundo {
  return {
    fmt: FMT_DELTA,
    nodoId,
    fila,
    columna,
    autoria: 'jugador-1',
    tick,
    cambio: { tipo: 'cavar' },
  };
}

async function main(): Promise<void> {
  const db = new MockFirestore();
  const persistencia = new PersistenciaMundo(db, 'p1');

  const sinMundos = await persistencia.listarNodos();
  assert(sinMundos.length === 0, 'doc de partida sin subcolección mundos lista [] (retrocompat, sin init)');
  assert((await persistencia.cargarNodo('raiz')) === null, 'cargarNodo de nodo inexistente devuelve null');

  const gen: GenSpec = { nombre: 'mazmorra', version: 1, seed: 7, params: { ancho: 30 } };
  await persistencia.guardarNodo('raiz', gen, null);
  const nodos = await persistencia.listarNodos();
  assert(nodos.length === 1 && nodos[0] === 'raiz', 'guardarNodo materializa el nodo y aparece en listarNodos');

  const original = crearDelta('raiz', 5, 1, 2);
  await persistencia.guardarDelta(original);
  const cargado = await persistencia.cargarNodo('raiz');
  assert(cargado !== null, 'cargarNodo de un nodo existente devuelve objeto (no null)');
  assert(cargado!.deltas.length === 1, 'cargarNodo devuelve el delta recién guardado');
  const recuperado = cargado!.deltas[0];
  assert(
    recuperado.fmt === FMT_DELTA &&
      recuperado.nodoId === 'raiz' &&
      recuperado.fila === 1 &&
      recuperado.columna === 2 &&
      recuperado.tick === 5 &&
      recuperado.autoria === 'jugador-1',
    'el delta se conserva intacto (roundtrip guardarDelta -> cargarNodo)',
  );
  assert(
    JSON.stringify(recuperado.cambio) === JSON.stringify(original.cambio),
    'el cambio del delta se conserva intacto',
  );
  assert(
    cargado!.gen.nombre === 'mazmorra' && cargado!.gen.seed === 7 && cargado!.gen.version === 1,
    'cargarNodo conserva gen/version del nodo',
  );
  assert(cargado!.ownerId === null, 'cargarNodo conserva ownerId null');

  await persistencia.guardarDelta(crearDelta('raiz', 3));
  await persistencia.guardarDelta(crearDelta('raiz', 9, 2, 2));
  const ordenado = await persistencia.cargarNodo('raiz');
  assert(
    ordenado!.deltas.map((d) => d.tick).join(',') === '3,5,9',
    'cargarNodo ordena los deltas por tick ascendente',
  );

  await db
    .collection('partidas')
    .doc('p1')
    .collection('mundos')
    .doc('raiz')
    .collection('deltas')
    .doc('futuro')
    .set({
      fmt: 99,
      nodoId: 'raiz',
      fila: 0,
      columna: 0,
      autoria: 'jugador-2',
      tick: 100,
      cambio: { tipo: 'cavar' },
    });
  const tolerante = await persistencia.cargarNodo('raiz');
  assert(tolerante!.deltas.length === 3, 'un delta con fmt desconocido se ignora (forward-compat)');
  assert(!tolerante!.deltas.some((d) => d.tick === 100), 'el delta de fmt desconocido no se incluye');

  const snapshot = { semilla: 7, celdas: 'comprimidas' };
  await persistencia.compactarNodo('raiz', 5, snapshot);
  const trasCompaction = await persistencia.cargarNodo('raiz');
  assert(
    trasCompaction!.deltas.map((d) => d.tick).join(',') === '9',
    'compactarNodo descarta los deltas con tick <= hastaTick',
  );
  assert(
    trasCompaction!.gen.seed === 7 && trasCompaction!.gen.version === 1,
    'compactarNodo conserva gen/version del nodo',
  );

  const nodoSnap = await db.collection('partidas').doc('p1').collection('mundos').doc('raiz').get();
  const datosNodo = nodoSnap.data()!;
  assert(datosNodo.ultimaCompactacionTick === 5, 'compactarNodo fija ultimaCompactacionTick');
  assert(
    JSON.stringify(datosNodo.snapshot) === JSON.stringify(snapshot),
    'compactarNodo materializa el snapshot en el documento del nodo',
  );
  assert(datosNodo.gen !== undefined, 'compactarNodo no borra el gen del nodo');

  const antesReguardar = (
    await db.collection('partidas').doc('p1').collection('mundos').doc('raiz').get()
  ).data()!;
  await persistencia.guardarNodo('raiz', gen, null);
  const despuesReguardar = (
    await db.collection('partidas').doc('p1').collection('mundos').doc('raiz').get()
  ).data()!;
  assert(
    despuesReguardar.createdAt === antesReguardar.createdAt,
    'guardarNodo no clobbera createdAt de un nodo existente (merge)',
  );
  assert(
    despuesReguardar.ultimaCompactacionTick === 5,
    'guardarNodo no clobbera ultimaCompactacionTick de un nodo existente (merge)',
  );
  assert(despuesReguardar.gen !== undefined, 'guardarNodo sobre un nodo existente conserva el gen');

  await persistencia.guardarNodo('nodo-2', { nombre: 'abierto', version: 1, seed: 2, params: {} }, 'jugador-3');
  const varios = await persistencia.listarNodos();
  assert(
    varios.length === 2 && varios.includes('raiz') && varios.includes('nodo-2'),
    'listarNodos devuelve todos los ids del mundo de la partida',
  );

  const conDueno = await persistencia.cargarNodo('nodo-2');
  assert(conDueno!.ownerId === 'jugador-3', 'cargarNodo devuelve el ownerId persistido');

  console.log(`${ok}/${total} ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
