import { consolidarDeltasNodo, costurasDeNodo } from './mundoRemoto';
import { FMT_DELTA, type ConectorMundo, type DeltaMundo } from './mundo';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) throw new Error(`FALLO: ${mensaje}`);
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

function delta(
  fila: number,
  columna: number,
  tick: number,
  cambio: DeltaMundo['cambio'],
  nodoId = 'raiz',
): DeltaMundo {
  return { fmt: FMT_DELTA, nodoId, fila, columna, autoria: 'L1', tick, cambio };
}

function conector(overrides: Partial<ConectorMundo> = {}): ConectorMundo {
  return {
    id: 'c1',
    tipo: 'salida',
    nodoOrigenId: 'a',
    filaO: 5,
    columnaO: 9,
    nodoDestinoId: 'b',
    filaD: 5,
    columnaD: 0,
    housingOwnerId: null,
    lado: 'este',
    ...overrides,
  };
}

function main(): void {
  const cavarViejo = delta(1, 1, 1, { tipo: 'cavar' });
  const cavarNuevo = delta(1, 1, 2, { tipo: 'cavar' });
  const comida = delta(1, 1, 3, { tipo: 'objeto', campo: 'alimento', valor: null });
  const otraCelda = delta(2, 2, 4, { tipo: 'cavar' });

  const consolidados = consolidarDeltasNodo([cavarNuevo, comida, cavarViejo, otraCelda]);
  assert(consolidados.length === 3, 'consolida deltas: gana el último cavar de la celda');
  assert(
    consolidados.some((d) => d.tick === 2) && !consolidados.some((d) => d.tick === 1),
    'LWW: el cavar viejo se descarta',
  );
  assert(
    consolidados.some((d) => d.cambio.tipo === 'objeto') && consolidados.some((d) => d.fila === 2),
    'conserva efectos ortogonales y de otras celdas',
  );
  assert(
    consolidados.every((d, i) => i === 0 || consolidados[i - 1].tick <= d.tick),
    'devuelve los deltas ordenados por tick',
  );
  assert(consolidarDeltasNodo([]).length === 0, 'lista vacía devuelve vacío');

  const ida = costurasDeNodo([conector()], 'a');
  assert(ida.length === 1 && ida[0].lado === 'este' && ida[0].interior === 'oeste', 'costura origen: lado e interior opuesto');
  assert(ida[0].fila === 5 && ida[0].columna === 9, 'costura origen usa filaO/columnaO');

  const vuelta = costurasDeNodo([conector()], 'b');
  assert(vuelta.length === 1 && vuelta[0].lado === 'oeste' && vuelta[0].interior === 'este', 'costura destino: lado opuesto e interior del conector');
  assert(vuelta[0].fila === 5 && vuelta[0].columna === 0, 'costura destino usa filaD/columnaD');

  const sinLado = costurasDeNodo([conector({ lado: null })], 'a');
  assert(sinLado.length === 0, 'un portal sin lado no genera costura');

  const ajeno = costurasDeNodo([conector()], 'otro');
  assert(ajeno.length === 0, 'un nodo ajeno no recibe costuras');

  console.log(`${ok}/${total} ok`);
}

main();
