import { ArbitroDeltas } from './ArbitroDeltas';
import { FMT_DELTA, type DeltaMundo } from './mundo';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) {
    throw new Error(`FALLO: ${mensaje}`);
  }
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

function delta(nodoId: string, fila: number, columna: number, tick: number): DeltaMundo {
  return {
    fmt: FMT_DELTA,
    nodoId,
    fila,
    columna,
    autoria: 'jugador-1',
    tick,
    cambio: { tipo: 'cavar' },
  };
}

function main(): void {
  const arbitro = new ArbitroDeltas();

  assert(arbitro.puedeAplicar(delta('raiz', 1, 1, 10)), 'una celda sin historial acepta el primer delta');
  arbitro.registrar(delta('raiz', 1, 1, 10));

  assert(
    !arbitro.puedeAplicar(delta('raiz', 1, 1, 4)),
    'un delta de tick inferior al último aplicado se rechaza (stale)',
  );
  assert(
    arbitro.puedeAplicar(delta('raiz', 1, 1, 11)),
    'un delta de tick superior se acepta',
  );
  assert(
    arbitro.puedeAplicar(delta('raiz', 1, 1, 10)),
    'en empate de tick gana el entrante (determinista)',
  );

  assert(
    arbitro.puedeAplicar(delta('raiz', 2, 2, 1)),
    'el historial es por celda: otra celda no queda bloqueada por un tick alto',
  );
  assert(
    arbitro.puedeAplicar(delta('otro-nodo', 1, 1, 1)),
    'el historial es por nodo: la misma celda de otro nodo no interfiere',
  );

  assert(
    new ArbitroDeltas().puedeAplicar(delta('raiz', 0, 0, 1)) === true,
    'un árbitro sin historial acepta cualquier delta',
  );

  console.log(`${ok}/${total} ok`);
}

main();
