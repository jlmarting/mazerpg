import { Celda } from './Celda';
import { generarNodo } from './generadores';
import type { ConectorMundo, GenSpec, NodoMundo } from './mundo';

const TIPOS_NODO: ReadonlyArray<NodoMundo['tipo']> = [
  'mazmorra',
  'abierto',
  'planta',
  'natural',
  'personal',
];

function tipoDesdeNombre(nombre: string): NodoMundo['tipo'] {
  return (TIPOS_NODO as string[]).includes(nombre)
    ? (nombre as NodoMundo['tipo'])
    : 'mazmorra';
}

function hashCadena(texto: string): number {
  let hash = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class GestorMundo {
  mundo: Map<string, NodoMundo> = new Map();
  conectores: Map<string, ConectorMundo> = new Map();
  nodoActivoId: string = '';

  crearMundoInicial(gen: GenSpec, filas: number, columnas: number): NodoMundo {
    const raiz: NodoMundo = {
      id: 'raiz',
      padreId: null,
      transform: { df: 0, dc: 0 },
      filas,
      columnas,
      tipo: tipoDesdeNombre(gen.nombre),
      gen,
      celdas: generarNodo(gen, filas, columnas),
      ownerId: null,
    };
    this.mundo.set(raiz.id, raiz);
    this.nodoActivoId = raiz.id;
    return raiz;
  }

  obtenerNodoActivo(): NodoMundo {
    const nodo = this.mundo.get(this.nodoActivoId);
    if (!nodo) {
      throw new Error(`Nodo activo desconocido: ${this.nodoActivoId}`);
    }
    return nodo;
  }

  obtenerCeldas(): Celda[][] {
    return this.obtenerNodoActivo().celdas;
  }

  conectorEn(fila: number, columna: number): ConectorMundo | null {
    const celdas = this.obtenerCeldas();
    if (fila < 0 || fila >= celdas.length) return null;
    const filaCeldas = celdas[fila];
    if (!filaCeldas || columna < 0 || columna >= filaCeldas.length) return null;
    const celda = filaCeldas[columna];
    if (!celda || celda.conectorId === null) return null;
    return this.conectores.get(celda.conectorId) ?? null;
  }

  atravesar(conectorId: string): { nodo: NodoMundo; fila: number; columna: number } {
    const conector = this.conectores.get(conectorId);
    if (!conector) {
      throw new Error(`Conector desconocido: ${conectorId}`);
    }

    const nodoDestino = this.mundo.get(conector.nodoDestinoId) ??
      this.materializarDestino(conector);

    this.mundo.set(nodoDestino.id, nodoDestino);

    const celdas = nodoDestino.celdas;
    if (
      conector.filaD >= 0 && conector.filaD < celdas.length &&
      conector.columnaD >= 0 && conector.columnaD < celdas[conector.filaD].length
    ) {
      celdas[conector.filaD][conector.columnaD].esTransitable = true;
    }

    this.nodoActivoId = nodoDestino.id;
    return { nodo: nodoDestino, fila: conector.filaD, columna: conector.columnaD };
  }

  registrarConector(conector: ConectorMundo): void {
    this.conectores.set(conector.id, conector);

    const nodoOrigen = this.mundo.get(conector.nodoOrigenId);
    if (!nodoOrigen) return;
    const celdas = nodoOrigen.celdas;
    if (
      conector.filaO >= 0 && conector.filaO < celdas.length &&
      conector.columnaO >= 0 && conector.columnaO < celdas[conector.filaO].length
    ) {
      celdas[conector.filaO][conector.columnaO].conectorId = conector.id;
    }
  }

  private materializarDestino(conector: ConectorMundo): NodoMundo {
    const origen = this.mundo.get(conector.nodoOrigenId);
    if (!origen) {
      throw new Error(`Nodo origen desconocido: ${conector.nodoOrigenId}`);
    }

    const seed = (origen.gen.seed ^ hashCadena(conector.nodoDestinoId)) >>> 0;
    const gen: GenSpec = {
      nombre: origen.gen.nombre,
      version: origen.gen.version,
      seed: seed === origen.gen.seed ? (seed + 1) >>> 0 : seed,
      params: origen.gen.params,
    };

    const nodo: NodoMundo = {
      id: conector.nodoDestinoId,
      padreId: conector.nodoOrigenId,
      transform: { df: 0, dc: 0 },
      filas: origen.filas,
      columnas: origen.columnas,
      tipo: origen.tipo,
      gen,
      celdas: generarNodo(gen, origen.filas, origen.columnas),
      ownerId: null,
    };
    this.mundo.set(nodo.id, nodo);
    return nodo;
  }
}
