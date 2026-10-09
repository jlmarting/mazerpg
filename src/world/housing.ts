import type { ConectorMundo, NodoMundo } from './mundo';

export interface AlmacenamientoLocal {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

const CLAVE_PREFIJO = 'mazerpg.casa.';
const NODO_GLOBAL_ID = 'global';

function almacenamientoGlobal(): AlmacenamientoLocal | null {
  const global = globalThis as { localStorage?: AlmacenamientoLocal };
  return global.localStorage ?? null;
}

export function puedeEditarNodo(nodo: NodoMundo, autoria: string): boolean {
  if (nodo.tipo !== 'personal') return true;
  if (nodo.ownerId === null) return true;
  return nodo.ownerId === autoria;
}

export class HousingLocal {
  readonly idLocal: string;
  private readonly almacen: AlmacenamientoLocal | null;
  private readonly portalesRegistrados: Map<string, ConectorMundo> = new Map();

  constructor(idLocal: string, almacen: AlmacenamientoLocal | null = almacenamientoGlobal()) {
    this.idLocal = idLocal;
    this.almacen = almacen;
  }

  private claveCasa(): string {
    return `${CLAVE_PREFIJO}${this.idLocal}`;
  }

  guardarCasa(nodo: NodoMundo): void {
    if (!this.almacen) return;
    this.almacen.setItem(this.claveCasa(), JSON.stringify(nodo));
  }

  cargarCasa(): NodoMundo | null {
    if (!this.almacen) return null;
    const bruto = this.almacen.getItem(this.claveCasa());
    if (bruto === null) return null;
    try {
      return JSON.parse(bruto) as NodoMundo;
    } catch {
      return null;
    }
  }

  crearPortalPersonal(
    miNodo: NodoMundo,
    destinoCelda: { fila: number; columna: number },
  ): ConectorMundo {
    const conector: ConectorMundo = {
      id: `housing-portal-${this.idLocal}`,
      tipo: 'portal',
      nodoOrigenId: NODO_GLOBAL_ID,
      filaO: 0,
      columnaO: 0,
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
