import { Celda } from './Celda';
import type { ConectorMundo, NodoMundo } from './mundo';

export interface AlmacenamientoLocal {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
  key(indice: number): string | null;
  readonly length: number;
}

const CLAVE_PREFIJO = 'mazerpg.casa.';
/** Clave fija: solo puede existir una casa por dispositivo (el idLocal no persiste). */
const CLAVE_CASA = 'mazerpg.casa.local';
const NODO_RAIZ_ID = 'raiz';

function almacenamientoGlobal(): AlmacenamientoLocal | null {
  const global = globalThis as { localStorage?: AlmacenamientoLocal };
  return global.localStorage ?? null;
}

export function puedeEditarNodo(nodo: NodoMundo, autoria: string): boolean {
  if (nodo.tipo !== 'personal') return true;
  if (nodo.ownerId === null) return true;
  return nodo.ownerId === autoria;
}

function rehidratarNodo(bruto: NodoMundo): NodoMundo {
  const celdasBrutas = (bruto.celdas as unknown as Array<Array<Partial<Celda>>> | undefined) ?? [];
  const celdas: Celda[][] = celdasBrutas.map((fila, f) =>
    fila.map((datos, c) => {
      const celda = new Celda(f, c);
      if (datos && typeof datos === 'object') {
        celda.ultimoAvistamiento = datos.ultimoAvistamiento ?? 0;
        celda.esTransitable = datos.esTransitable ?? false;
        if (datos.muros) celda.muros = { ...celda.muros, ...datos.muros };
        celda.visitada = datos.visitada ?? false;
        celda.alimento = datos.alimento ?? null;
        celda.burbuja = datos.burbuja ?? null;
        celda.esPortal = datos.esPortal ?? false;
        celda.tienePico = datos.tienePico ?? false;
        celda.golpesCavar = datos.golpesCavar ?? 0;
        celda.tipoEscenario = datos.tipoEscenario ?? 'ninguno';
        celda.estadoEscenario = datos.estadoEscenario ?? 'idle';
        celda.conectorId = datos.conectorId ?? null;
        celda.sueloDecor = (datos as { sueloDecor?: Celda['sueloDecor'] }).sueloDecor ?? null;
        celda.mueble = (datos as { mueble?: string | null }).mueble ?? null;
      }
      return celda;
    }),
  );
  return { ...bruto, celdas };
}

export class HousingLocal {
  readonly idLocal: string;
  private readonly almacen: AlmacenamientoLocal | null;
  private readonly portalesRegistrados: Map<string, ConectorMundo> = new Map();

  constructor(idLocal: string, almacen: AlmacenamientoLocal | null = almacenamientoGlobal()) {
    this.idLocal = idLocal;
    this.almacen = almacen;
  }

  /** Claves de casas antiguas (una por idLocal aleatorio) que nunca se evictaban. */
  private clavesLegacy(): string[] {
    if (!this.almacen) return [];
    const claves: string[] = [];
    for (let i = 0; i < this.almacen.length; i++) {
      const clave = this.almacen.key(i);
      if (clave !== null && clave.startsWith(CLAVE_PREFIJO) && clave !== CLAVE_CASA) {
        claves.push(clave);
      }
    }
    return claves;
  }

  private rehidratarDesde(clave: string): NodoMundo | null {
    if (!this.almacen) return null;
    const bruto = this.almacen.getItem(clave);
    if (bruto === null) return null;
    try {
      return rehidratarNodo(JSON.parse(bruto) as NodoMundo);
    } catch {
      return null;
    }
  }

  guardarCasa(nodo: NodoMundo): void {
    if (!this.almacen) return;
    try {
      this.almacen.setItem(CLAVE_CASA, JSON.stringify(nodo));
    } catch (e) {
      // Storage lleno (QuotaExceededError) o no disponible: nunca debe tumbar el arranque.
      console.warn('No se pudo persistir la casa (almacenamiento lleno o no disponible).', e);
    }
  }

  cargarCasa(): NodoMundo | null {
    return this.rehidratarDesde(CLAVE_CASA);
  }

  /** ¿Hay alguna casa guardada (clave fija o legacy)? Decide si se pregunta al usuario. */
  hayCasaGuardada(): boolean {
    if (!this.almacen) return false;
    if (this.almacen.getItem(CLAVE_CASA) !== null) return true;
    return this.clavesLegacy().length > 0;
  }

  /** Devuelve la casa a reutilizar: prefiere la clave fija; si no, adopta la primera legacy. */
  cargarCasaPrevia(): NodoMundo | null {
    const fija = this.cargarCasa();
    if (fija) return fija;
    for (const clave of this.clavesLegacy()) {
      const nodo = this.rehidratarDesde(clave);
      if (nodo) return nodo;
    }
    return null;
  }

  /** Borra la clave fija y todas las casas legacy (recupera cuota sin tocar DevTools). */
  descartarCasasGuardadas(): void {
    if (!this.almacen) return;
    for (const clave of [CLAVE_CASA, ...this.clavesLegacy()]) {
      try {
        this.almacen.removeItem(clave);
      } catch {
        // Ignorar: si no se puede borrar, no hay nada más que hacer aquí.
      }
    }
  }

  crearPortalPersonal(
    miNodo: NodoMundo,
    destinoCelda: { fila: number; columna: number },
    origenNodoId: string = NODO_RAIZ_ID,
    origenCelda: { fila: number; columna: number } = { fila: 0, columna: 0 },
  ): ConectorMundo {
    const conector: ConectorMundo = {
      id: `housing-portal-${this.idLocal}`,
      tipo: 'portal',
      nodoOrigenId: origenNodoId,
      filaO: origenCelda.fila,
      columnaO: origenCelda.columna,
      nodoDestinoId: miNodo.id,
      filaD: destinoCelda.fila,
      columnaD: destinoCelda.columna,
      housingOwnerId: this.idLocal,
    };
    this.portalesRegistrados.set(conector.id, conector);
    return conector;
  }

  portalDisponible(conector: ConectorMundo, onlineIds: Set<string>): boolean {
    return conector.housingOwnerId !== null && onlineIds.has(conector.housingOwnerId);
  }

  portales(): ConectorMundo[] {
    return Array.from(this.portalesRegistrados.values());
  }
}
