import { Celda } from './Celda';
import type { ConectorMundo, NodoMundo } from './mundo';

export interface AlmacenamientoLocal {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

const CLAVE_PREFIJO = 'mazerpg.casa.';
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
      return rehidratarNodo(JSON.parse(bruto) as NodoMundo);
    } catch {
      return null;
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
