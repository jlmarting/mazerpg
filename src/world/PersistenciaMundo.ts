import { FMT_DELTA, type DeltaMundo, type GenSpec } from './mundo';

export interface DocSnapLike {
  readonly id: string;
  readonly exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface QuerySnapLike {
  readonly docs: DocSnapLike[];
  readonly empty: boolean;
  forEach(efecto: (doc: DocSnapLike) => void): void;
}

export interface QueryLike {
  get(): Promise<QuerySnapLike>;
}

export interface DocLike {
  collection(nombre: string): CollectionLike;
  get(): Promise<DocSnapLike>;
  set(datos: Record<string, unknown>, opciones?: { merge?: boolean }): Promise<void>;
  update(datos: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}

export interface CollectionLike {
  doc(id?: string): DocLike;
  get(): Promise<QuerySnapLike>;
  where(campo: string, operacion: string, valor: unknown): QueryLike;
  orderBy(campo: string, direccion?: 'asc' | 'desc'): QueryLike;
}

export interface FirestoreLike {
  collection(nombre: string): CollectionLike;
}

export interface NodoPersistido {
  gen: GenSpec;
  ownerId: string | null;
  deltas: DeltaMundo[];
  snapshot: unknown;
  ultimaCompactacionTick: number;
}

export class PersistenciaMundo {
  private readonly db: FirestoreLike;
  private readonly idPartida: string;

  constructor(db: FirestoreLike, idPartida: string) {
    this.db = db;
    this.idPartida = idPartida;
  }

  private mundosRef(): CollectionLike {
    return this.db.collection('partidas').doc(this.idPartida).collection('mundos');
  }

  private nodoRef(nodoId: string): DocLike {
    return this.mundosRef().doc(nodoId);
  }

  private deltasRef(nodoId: string): CollectionLike {
    return this.nodoRef(nodoId).collection('deltas');
  }

  async guardarNodo(nodoId: string, gen: GenSpec, ownerId: string | null): Promise<void> {
    const ahora = Date.now();
    await this.nodoRef(nodoId).set({
      gen,
      ownerId: ownerId ?? null,
      createdAt: ahora,
      updatedAt: ahora,
      ultimaCompactacionTick: 0,
    });
  }

  async guardarDelta(delta: DeltaMundo): Promise<void> {
    await this.deltasRef(delta.nodoId).doc().set({
      fmt: FMT_DELTA,
      nodoId: delta.nodoId,
      fila: delta.fila,
      columna: delta.columna,
      autoria: delta.autoria,
      tick: delta.tick,
      cambio: delta.cambio,
    });
  }

  async cargarNodo(nodoId: string): Promise<NodoPersistido | null> {
    const nodoSnap = await this.nodoRef(nodoId).get();
    if (!nodoSnap.exists) return null;
    const datos = nodoSnap.data() ?? {};

    const deltasSnap = await this.deltasRef(nodoId).orderBy('tick').get();
    const deltas: DeltaMundo[] = [];
    deltasSnap.forEach((doc) => {
      const bruto = doc.data();
      if (!bruto) return;
      if (bruto.fmt !== FMT_DELTA) return;
      deltas.push(bruto as unknown as DeltaMundo);
    });

    const ownerId = typeof datos.ownerId === 'string' ? datos.ownerId : null;
    const ultimaCompactacionTick =
      typeof datos.ultimaCompactacionTick === 'number' ? datos.ultimaCompactacionTick : 0;
    return { gen: datos.gen as GenSpec, ownerId, deltas, snapshot: datos.snapshot, ultimaCompactacionTick };
  }

  async listarNodos(): Promise<string[]> {
    const snap = await this.mundosRef().get();
    const ids: string[] = [];
    snap.forEach((doc) => ids.push(doc.id));
    return ids;
  }

  async compactarNodo(nodoId: string, hastaTick: number, snapshot: unknown): Promise<void> {
    await this.nodoRef(nodoId).set(
      {
        snapshot,
        ultimaCompactacionTick: hastaTick,
        updatedAt: Date.now(),
      },
      { merge: true },
    );

    const antiguos = await this.deltasRef(nodoId).where('tick', '<=', hastaTick).get();
    for (const doc of antiguos.docs) {
      await this.deltasRef(nodoId).doc(doc.id).delete();
    }
  }
}
