import { resolverLWW, type DeltaMundo } from './mundo';

/**
 * Árbitro last-writer-wins por celda (nodoId:fila:columna). Un delta de tick
 * menor que el último aplicado en esa celda se descarta, evitando que un delta
 * tardío machaque uno más nuevo. `resolverLWW` es la única regla de comparación
 * (empate: gana el entrante, determinista).
 */
export class ArbitroDeltas {
  private readonly ultimos: Map<string, DeltaMundo> = new Map();

  private clave(delta: DeltaMundo): string {
    return `${delta.nodoId}:${delta.fila}:${delta.columna}`;
  }

  puedeAplicar(delta: DeltaMundo): boolean {
    const actual = this.ultimos.get(this.clave(delta)) ?? null;
    return resolverLWW(actual, delta) === delta;
  }

  registrar(delta: DeltaMundo): void {
    this.ultimos.set(this.clave(delta), delta);
  }
}
