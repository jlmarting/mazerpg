import { Celda } from './Celda';
import { generarNodo } from './generadores';
import { eliminarMurosEntre } from './generation';
import { puedeEditarNodo } from './housing';
import {
  colocarNodoDestino,
  direccionDeLado,
  inferirLadoConector,
  ladoOpuesto,
  transformAbsoluto as transformAbsolutoCostura,
} from './costura';
import {
  aplicarDelta as aplicarDeltaEnCeldas,
  type ConectorMundo,
  type DeltaMundo,
  type GenSpec,
  type NodoMundo,
} from './mundo';

interface Vecino {
  df: number;
  dc: number;
  muro: 'superior' | 'derecho' | 'inferior' | 'izquierdo';
  opuesto: 'superior' | 'derecho' | 'inferior' | 'izquierdo';
}

const VECINOS: ReadonlyArray<Vecino> = [
  { df: -1, dc: 0, muro: 'superior', opuesto: 'inferior' },
  { df: 1, dc: 0, muro: 'inferior', opuesto: 'superior' },
  { df: 0, dc: -1, muro: 'izquierdo', opuesto: 'derecho' },
  { df: 0, dc: 1, muro: 'derecho', opuesto: 'izquierdo' },
];

const TIPOS_NODO: ReadonlyArray<NodoMundo['tipo']> = [
  'mazmorra',
  'abierto',
  'planta',
  'natural',
  'personal',
];

export function tipoDesdeNombre(nombre: string): NodoMundo['tipo'] {
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
    const nodo = this.mundo.get(this.nodoActivoId);
    if (!nodo) return null;
    const celdas = nodo.celdas;
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
    const nodoExistente = this.mundo.get(conector.nodoDestinoId) ?? null;
    const origen = this.mundo.get(conector.nodoOrigenId) ?? null;
    const filasDestino = nodoExistente ? nodoExistente.filas : origen ? origen.filas : 0;
    const columnasDestino = nodoExistente
      ? nodoExistente.columnas
      : origen
        ? origen.columnas
        : 0;

    // Comprobar el rango de aparición ANTES de materializar el destino:
    // así un conector mal formado no deja un nodo huérfano en el mundo.
    if (
      conector.filaD < 0 ||
      conector.filaD >= filasDestino ||
      conector.columnaD < 0 ||
      conector.columnaD >= columnasDestino
    ) {
      throw new Error(
        `Aparición fuera de rango en ${conector.nodoDestinoId}: (${conector.filaD}, ${conector.columnaD})`,
      );
    }

    const nodoDestino = nodoExistente ?? this.materializarDestino(conector);

    this.mundo.set(nodoDestino.id, nodoDestino);

    const aparicion = this.prepararAparicion(nodoDestino, conector.filaD, conector.columnaD);

    this.activarNodo(nodoDestino.id);
    return { nodo: nodoDestino, fila: aparicion.fila, columna: aparicion.columna };
  }

  /** Fija el nodo activo sin teletransportar (cruce continuo). */
  activarNodo(nodoId: string): NodoMundo {
    const nodo = this.mundo.get(nodoId);
    if (!nodo) {
      throw new Error(`Nodo desconocido: ${nodoId}`);
    }
    this.nodoActivoId = nodoId;
    return nodo;
  }

  /** Transform absoluto (raíz→nodo) sumando la cadena de padres. */
  transformAbsoluto(nodoId: string): { df: number; dc: number } {
    return transformAbsolutoCostura(this.mundo, nodoId);
  }

  registrarConector(conector: ConectorMundo): void {
    const nodoOrigen = this.mundo.get(conector.nodoOrigenId);
    if (!nodoOrigen) {
      this.conectores.set(conector.id, conector);
      console.warn(
        `registrarConector: nodo origen ausente ${conector.nodoOrigenId}; el conector ${conector.id} queda sin celda.`,
      );
      return;
    }

    const nodoDestino = this.mundo.get(conector.nodoDestinoId) ?? null;
    const dimsDestino = nodoDestino
      ? { filas: nodoDestino.filas, columnas: nodoDestino.columnas }
      : { filas: nodoOrigen.filas, columnas: nodoOrigen.columnas };
    const lado =
      conector.lado === undefined
        ? inferirLadoConector(
            conector,
            { filas: nodoOrigen.filas, columnas: nodoOrigen.columnas },
            dimsDestino,
          )
        : conector.lado;
    conector.lado = lado;
    this.conectores.set(conector.id, conector);

    const celdas = nodoOrigen.celdas;
    if (
      conector.filaO >= 0 && conector.filaO < celdas.length &&
      conector.columnaO >= 0 && conector.columnaO < celdas[conector.filaO].length
    ) {
      celdas[conector.filaO][conector.columnaO].conectorId = conector.id;
    }

    if (lado && nodoDestino) {
      this.colocarDestinoSiProcede(conector, nodoOrigen, nodoDestino);
      if (conector.lado) {
        this.abrirCostura(nodoOrigen, nodoDestino, conector);
      }
    }
  }

  /**
   * Materializa (si falta) y devuelve el destino de un conector sin cambiar el
   * nodo activo. Es la puerta del cruce continuo.
   */
  asegurarNodoDestino(conectorId: string): NodoMundo {
    const conector = this.conectores.get(conectorId);
    if (!conector) {
      throw new Error(`Conector desconocido: ${conectorId}`);
    }
    const existente = this.mundo.get(conector.nodoDestinoId);
    if (existente) return existente;
    return this.materializarDestino(conector);
  }

  /**
   * Re-registra los conectores persistidos como deltas al materializar un nodo.
   * Idempotente por id; los `quitar` eliminan el conector de memoria.
   */
  reconstruirConectoresDesdeDeltas(nodoId: string, deltas: DeltaMundo[]): void {
    for (const delta of deltas) {
      if (delta.nodoId !== nodoId) continue;
      const cambio = delta.cambio;
      if (cambio.tipo !== 'conector') continue;
      if (cambio.accion === 'quitar') {
        this.conectores.delete(cambio.conector.id);
        continue;
      }
      if (this.conectores.has(cambio.conector.id)) continue;
      this.registrarConector(cambio.conector);
    }
  }

  private colocarDestinoSiProcede(
    conector: ConectorMundo,
    origen: NodoMundo,
    destino: NodoMundo,
  ): void {
    // Solo se coloca un hijo real del origen; el padre (conector de vuelta) y
    // los nodos de otra rama conservan su transform.
    if (destino.padreId !== origen.id) return;
    const transform = colocarNodoDestino(
      conector,
      { filas: origen.filas, columnas: origen.columnas },
      { filas: destino.filas, columnas: destino.columnas },
    );
    if (!transform) {
      conector.lado = null;
      return;
    }
    const yaColocado = destino.transform.df !== 0 || destino.transform.dc !== 0;
    if (yaColocado) {
      // Dos conectores continuos que reclaman el mismo hijo con posiciones
      // distintas son incoherentes: se degrada a teletransporte en vez de
      // recolocar el nodo y romper la costura ya existente.
      if (destino.transform.df !== transform.df || destino.transform.dc !== transform.dc) {
        conector.lado = null;
      }
      return;
    }
    destino.transform = transform;
  }

  private abrirCostura(origen: NodoMundo, destino: NodoMundo, conector: ConectorMundo): void {
    const lado = conector.lado;
    if (!lado) return;
    const celdaO = origen.celdas[conector.filaO]?.[conector.columnaO];
    const celdaD = destino.celdas[conector.filaD]?.[conector.columnaD];
    if (!celdaO || !celdaD) return;

    celdaO.esTransitable = true;
    celdaD.esTransitable = true;

    switch (lado) {
      case 'este':
        celdaO.muros.derecho = false;
        celdaD.muros.izquierdo = false;
        break;
      case 'oeste':
        celdaO.muros.izquierdo = false;
        celdaD.muros.derecho = false;
        break;
      case 'sur':
        celdaO.muros.inferior = false;
        celdaD.muros.superior = false;
        break;
      case 'norte':
        celdaO.muros.superior = false;
        celdaD.muros.inferior = false;
        break;
    }

    this.asegurarPasoInterior(celdaO, origen.celdas, ladoOpuesto(lado));
    this.asegurarPasoInterior(celdaD, destino.celdas, lado);
  }

  private asegurarPasoInterior(
    celda: Celda,
    celdas: Celda[][],
    lado: 'norte' | 'sur' | 'este' | 'oeste',
  ): void {
    const direccion = direccionDeLado(lado);
    const fila = celda.fila + direccion.df;
    const columna = celda.columna + direccion.dc;
    const filaCeldas = celdas[fila];
    const vecino = filaCeldas?.[columna];
    if (!vecino) return;
    vecino.esTransitable = true;
    eliminarMurosEntre(celda, vecino);
  }

  registrarPortalPersonal(conector: ConectorMundo): void {
    this.registrarConector(conector);

    const nodoOrigen = this.mundo.get(conector.nodoOrigenId);
    if (!nodoOrigen) return;
    const celdas = nodoOrigen.celdas;
    if (
      conector.filaO >= 0 && conector.filaO < celdas.length &&
      conector.columnaO >= 0 && conector.columnaO < celdas[conector.filaO].length
    ) {
      celdas[conector.filaO][conector.columnaO].esPortal = true;
    }
  }

  aplicarDelta(delta: DeltaMundo): boolean {
    const nodo = this.mundo.get(delta.nodoId);
    if (!nodo) return false;
    if (!puedeEditarNodo(nodo, delta.autoria)) return false;
    return aplicarDeltaEnCeldas(nodo.celdas, delta);
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

    if (conector.lado) {
      const transform = colocarNodoDestino(
        conector,
        { filas: origen.filas, columnas: origen.columnas },
        { filas: nodo.filas, columnas: nodo.columnas },
      );
      if (transform) {
        nodo.transform = transform;
      } else {
        conector.lado = null;
      }
    }

    this.mundo.set(nodo.id, nodo);
    if (conector.lado) {
      this.abrirCostura(origen, nodo, conector);
    }
    return nodo;
  }

  private enRango(celdas: Celda[][], fila: number, columna: number): boolean {
    if (fila < 0 || fila >= celdas.length) return false;
    const filaCeldas = celdas[fila];
    return !!filaCeldas && columna >= 0 && columna < filaCeldas.length;
  }

  private prepararAparicion(
    nodo: NodoMundo,
    fila: number,
    columna: number,
  ): { fila: number; columna: number } {
    const celdas = nodo.celdas;
    if (!this.enRango(celdas, fila, columna)) {
      throw new Error(`Aparición fuera de rango en ${nodo.id}: (${fila}, ${columna})`);
    }

    const celda = celdas[fila][columna];
    celda.esTransitable = true;

    const vecinosEnRango = VECINOS.map((v) => ({
      v,
      fila: fila + v.df,
      columna: columna + v.dc,
    })).filter(({ fila: nf, columna: nc }) => this.enRango(celdas, nf, nc));

    const yaConectada = vecinosEnRango.some(({ v, fila: nf, columna: nc }) => {
      const vecino = celdas[nf][nc];
      return (
        vecino.esTransitable &&
        celda.muros[v.muro] === false &&
        vecino.muros[v.opuesto] === false
      );
    });
    if (yaConectada) return { fila, columna };

    const vecinoTransitable = vecinosEnRango.find(
      ({ fila: nf, columna: nc }) => celdas[nf][nc].esTransitable,
    );
    if (vecinoTransitable) {
      eliminarMurosEntre(celda, celdas[vecinoTransitable.fila][vecinoTransitable.columna]);
      return { fila, columna };
    }

    const vecinoLibre = vecinosEnRango[0];
    if (vecinoLibre) {
      const vecino = celdas[vecinoLibre.fila][vecinoLibre.columna];
      vecino.esTransitable = true;
      eliminarMurosEntre(celda, vecino);
    }
    return { fila, columna };
  }
}
