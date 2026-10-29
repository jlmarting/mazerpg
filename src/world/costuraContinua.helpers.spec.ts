import { GestorMundo } from './GestorMundo';
import { HousingLocal } from './housing';
import { sembrarMundoBase, sembrarCadenaZonas } from './integracion';
import { celdaDestinoEnCostura } from './costura';
import type { GenSpec } from './mundo';

const GEN_RAIZ: GenSpec = { nombre: 'mazmorra', version: 1, seed: 42, params: {} };

let ok = 0;
let total = 0;
function assert(c: boolean, m: string): void {
  total++;
  if (!c) throw new Error(`FALLO: ${m}`);
  ok++;
  console.log(`ok ${total} - ${m}`);
}

class AlmacenTest {
  private readonly datos: Map<string, string> = new Map();
  get length(): number { return this.datos.size; }
  getItem(k: string): string | null { return this.datos.has(k) ? this.datos.get(k)! : null; }
  setItem(k: string, v: string): void { this.datos.set(k, v); }
  removeItem(k: string): void { this.datos.delete(k); }
  key(i: number): string | null { return Array.from(this.datos.keys())[i] ?? null; }
}

function crucesValidos(gestor: GestorMundo, nodoId: string): { total: number; validos: number } {
  gestor.activarNodo(nodoId);
  const nodo = gestor.mundo.get(nodoId)!;
  const t = gestor.transformAbsoluto(nodoId);
  const colLast = nodo.columnas - 1;
  let totalC = 0;
  let validos = 0;
  for (let r = 0; r < nodo.filas; r++) {
    const c = gestor.conectorEn(r, colLast);
    if (!c || c.lado !== 'este') continue;
    totalC++;
    const destino = gestor.mundo.get(c.nodoDestinoId)!;
    const tDest = gestor.transformAbsoluto(c.nodoDestinoId);
    const target = celdaDestinoEnCostura(c, t, tDest, 0, 1, { filas: destino.filas, columnas: destino.columnas });
    if (target && destino.celdas[target.fila]?.[target.columna]?.esTransitable) validos++;
  }
  return { total: totalC, validos };
}

function main(): void {
  const gestor = new GestorMundo();
  gestor.crearMundoInicial(GEN_RAIZ, 80, 80);
  const base = sembrarMundoBase({ gestor, housing: new HousingLocal('L1', new AlmacenTest()), idLocal: 'L1', filas: 80, columnas: 80 });
  assert(base !== null, 'se siembra la base');
  if (!base) return;
  sembrarCadenaZonas(gestor, base.nodoHijo, 3, { filas: 40, columnas: 40 });

  for (const id of ['raiz', 'zona-abierto-1', 'zona-abierto-2', 'zona-abierto-3']) {
    const { total, validos } = crucesValidos(gestor, id);
    assert(total > 0, `${id} tiene al menos un conector de cruce por el este`);
    assert(total === validos, `${id}: todos los cruces del este tienen objetivo válido (${validos}/${total})`);
  }

  // Regresión: nodos de distinto tamaño con desfase de filas (df) no rompen el cruce.
  const z1 = crucesValidos(gestor, 'zona-abierto-1');
  assert(z1.validos > 1, 'zona-abierto-1 tiene varios cruces válidos pese al desfase df con zona2');

  console.log(`${ok}/${total} ok`);
}

main();
