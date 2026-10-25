import type { LadoCostura } from './costura';
import { ladoOpuesto } from './costura';
import type { ConectorMundo, DeltaMundo, GenSpec, NodoMundo } from './mundo';
import { consolidarCeldasLWW } from './mundo';

export interface CosturaRemota {
  lado: LadoCostura;
  fila: number;
  columna: number;
  interior: LadoCostura;
}

export interface NodoRemoto {
  id: string;
  gen: GenSpec;
  filas: number;
  columnas: number;
  tipo: NodoMundo['tipo'];
  ownerId: string | null;
  transform: { df: number; dc: number };
  /** Solo nodos de mundo: deltas de la sesión del host, consolidados. */
  deltas?: DeltaMundo[];
  /** Solo nodos de mundo: aperturas de costura derivadas de conectores. */
  costuras?: CosturaRemota[];
  /** Casa personal/legacy: mapa completo serializado v2. */
  datos?: string;
}

/** Pliega LWW por celda/tipo/campo y ordena por tick para que el invitado aplique. */
export function consolidarDeltasNodo(deltas: DeltaMundo[]): DeltaMundo[] {
  return consolidarCeldasLWW([deltas])
    .slice()
    .sort((a, b) => a.tick - b.tick);
}

/** Costuras remotas en las que participa un nodo (origen o destino). */
export function costurasDeNodo(
  conectores: Iterable<ConectorMundo>,
  nodoId: string,
): CosturaRemota[] {
  const costuras: CosturaRemota[] = [];
  for (const conector of conectores) {
    if (!conector.lado) continue;
    if (conector.nodoOrigenId === nodoId) {
      costuras.push({
        lado: conector.lado,
        fila: conector.filaO,
        columna: conector.columnaO,
        interior: ladoOpuesto(conector.lado),
      });
    }
    if (conector.nodoDestinoId === nodoId) {
      costuras.push({
        lado: ladoOpuesto(conector.lado),
        fila: conector.filaD,
        columna: conector.columnaD,
        interior: conector.lado,
      });
    }
  }
  return costuras;
}
