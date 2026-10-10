import {
  FMT_DELTA,
  consolidarCeldasLWW,
  leerSnapshotNodo,
  type DeltaMundo,
  type GenSpec,
  type SnapshotNodo,
} from './mundo';

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
    const ref = this.nodoRef(nodoId);
    const ahora = Date.now();
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        gen,
        ownerId: ownerId ?? null,
        createdAt: ahora,
        updatedAt: ahora,
        ultimaCompactacionTick: 0,
      });
      return;
    }
    // merge: no clobberar createdAt ni ultimaCompactacionTick ya persistidos
    await ref.set({ gen, ownerId: ownerId ?? null, updatedAt: ahora }, { merge: true });
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

  /**
   * Fase 2: fusión read-modify-write del snapshot del nodo. Solo reemplaza las
   * partes indicadas (p. ej. `enemigos`) y conserva el resto (celdas, escenario)
   * para no pisar datos que otro snapshot pudo haber escrito.
   */
  async guardarSnapshotParcial(
    nodoId: string,
    parcial: Omit<Partial<SnapshotNodo>, 'formato'>,
  ): Promise<void> {
    const ref = this.nodoRef(nodoId);
    const snap = await ref.get();
    const previo = leerSnapshotNodo(snap.exists ? snap.data()?.snapshot : undefined);
    const fusion: SnapshotNodo = {
      formato: 1,
      ...(previo.enemigos ? { enemigos: previo.enemigos } : {}),
      ...(previo.escenario ? { escenario: previo.escenario } : {}),
      ...(previo.celdas ? { celdas: previo.celdas } : {}),
      ...(parcial.enemigos !== undefined ? { enemigos: parcial.enemigos } : {}),
      ...(parcial.escenario !== undefined ? { escenario: parcial.escenario } : {}),
      ...(parcial.celdas !== undefined ? { celdas: parcial.celdas } : {}),
    };
    await ref.set({ snapshot: fusion }, { merge: true });
  }

  async listarNodos(): Promise<string[]> {
    const snap = await this.mundosRef().get();
    const ids: string[] = [];
    snap.forEach((doc) => ids.push(doc.id));
    return ids;
  }

  /**
   * Fase 2: compactación con SnapshotNodo (formato 1). Los deltas con
   * tick <= hastaTick se pliegan en `snapshot.celdas` consolidados por celda
   * vía resolverLWW (empate -> entrante), fusionados con las celdas ya
   * plegadas del snapshot en el documento (una celda con tick más nuevo en el
   * snapshot previo no se deshace) y con las partes de `extras`. Los deltas
   * plegados se eliminan de la subcolección.
   */
  async compactarNodo(nodoId: string, hastaTick: number, extras: unknown): Promise<void> {
    const ref = this.nodoRef(nodoId);
    const nodosSnap = await ref.get();
    const previo = leerSnapshotNodo(nodosSnap.exists ? nodosSnap.data()?.snapshot : undefined);

    const antiguos = await this.deltasRef(nodoId).where('tick', '<=', hastaTick).get();
    const plegables: DeltaMundo[] = [];
    antiguos.forEach((doc) => {
      const bruto = doc.data();
      if (!bruto || bruto.fmt !== FMT_DELTA) return;
      plegables.push(bruto as unknown as DeltaMundo);
    });

    const extrasFoto = leerSnapshotNodo(extras);
    const snapshot: SnapshotNodo = {
      formato: 1,
      ...(previo.enemigos ? { enemigos: previo.enemigos } : {}),
      ...(extrasFoto.enemigos ? { enemigos: extrasFoto.enemigos } : {}),
      ...(previo.escenario ? { escenario: previo.escenario } : {}),
      ...(extrasFoto.escenario ? { escenario: extrasFoto.escenario } : {}),
    };
    const celdas = consolidarCeldasLWW([previo.celdas ?? [], extrasFoto.celdas ?? [], plegables]);
    if (celdas.length > 0) snapshot.celdas = celdas;

    await ref.set(
      { snapshot, ultimaCompactacionTick: hastaTick, updatedAt: Date.now() },
      { merge: true },
    );

    for (const doc of antiguos.docs) {
      await this.deltasRef(nodoId).doc(doc.id).delete();
    }
  }
}
