import { Celda } from './Celda';
import { generarNodo } from './generadores';
import { aplicarDelta, FMT_DELTA, type DeltaMundo } from './mundo';

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

function objetosIguales(a: Celda[][], b: Celda[][]): boolean {
  if (a.length !== b.length) return false;
  for (let f = 0; f < a.length; f++) {
    if (a[f].length !== b[f].length) return false;
    for (let c = 0; c < a[f].length; c++) {
      const x = a[f][c];
      const y = b[f][c];
      if (JSON.stringify(x.alimento) !== JSON.stringify(y.alimento)) return false;
      if (JSON.stringify(x.burbuja) !== JSON.stringify(y.burbuja)) return false;
      if (x.esPortal !== y.esPortal) return false;
      if (x.tienePico !== y.tienePico) return false;
    }
  }
  return true;
}

function objetosSoloEnTransitables(celdas: Celda[][]): boolean {
  for (const fila of celdas) {
    for (const celda of fila) {
      if (!celda.esTransitable && (celda.alimento || celda.burbuja || celda.esPortal || celda.tienePico)) {
        return false;
      }
    }
  }
  return true;
}

function hayAlgunObjeto(celdas: Celda[][]): boolean {
  for (const fila of celdas) {
    for (const celda of fila) {
      if (celda.alimento || celda.burbuja || celda.esPortal || celda.tienePico) return true;
    }
  }
  return false;
}

function main(): void {
  const gen = { nombre: 'mazmorra', version: 1, seed: 1234, params: {} };

  const a = generarNodo(gen, 30, 30);
  const b = generarNodo(gen, 30, 30);
  assert(objetosIguales(a, b), 'los objetos ambientales se reproducen igual con el mismo gen/seed');

  const c = generarNodo({ ...gen, seed: 4321 }, 30, 30);
  assert(!objetosIguales(a, c), 'los objetos ambientales difieren con otra seed');

  assert(hayAlgunObjeto(a), 'un nodo 30x30 genera al menos un objeto ambiental no vacío');
  assert(objetosSoloEnTransitables(a), 'los objetos ambientales solo ocupan celdas transitables');

  // Replay de delta: recoger/consumir cae encima del spawn determinista.
  let celdaConAlimento: Celda | null = null;
  for (const fila of a) {
    for (const celda of fila) {
      if (celda.alimento) {
        celdaConAlimento = celda;
        break;
      }
    }
    if (celdaConAlimento) break;
  }
  assert(celdaConAlimento !== null, 'hay al menos un alimento para probar el replay de delta');
  if (celdaConAlimento) {
    const delta: DeltaMundo = {
      fmt: FMT_DELTA,
      nodoId: 'raiz',
      fila: celdaConAlimento.fila,
      columna: celdaConAlimento.columna,
      autoria: 'jugador-1',
      tick: 1,
      cambio: { tipo: 'objeto', campo: 'alimento', valor: null },
    };
    assert(aplicarDelta(a, delta) === true, 'el delta de recogida se aplica sobre el spawn determinista');
    assert(
      a[celdaConAlimento.fila][celdaConAlimento.columna].alimento === null,
      'el delta de recogida elimina el alimento regenerado',
    );
  }

  console.log(`${ok}/${total} ok`);
}

main();
