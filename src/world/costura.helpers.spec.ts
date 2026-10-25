import { Celda } from './Celda';
import type { ConectorMundo, NodoMundo } from './mundo';
import {
  abrirCeldaCostura,
  celdaDestinoEnCostura,
  colocarNodoDestino,
  inferirLadoConector,
  nodosVisibles,
  transformAbsoluto,
} from './costura';

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

function crearNodo(
  id: string,
  padreId: string | null,
  filas: number,
  columnas: number,
  transform: { df: number; dc: number } = { df: 0, dc: 0 },
): NodoMundo {
  const celdas: Celda[][] = [];
  for (let f = 0; f < filas; f++) {
    celdas[f] = [];
    for (let c = 0; c < columnas; c++) {
      celdas[f][c] = new Celda(f, c);
    }
  }
  return {
    id,
    padreId,
    transform,
    filas,
    columnas,
    tipo: 'mazmorra',
    gen: { nombre: 'mazmorra', version: 1, seed: 1, params: {} },
    celdas,
    ownerId: null,
  };
}

function conector(overrides: Partial<ConectorMundo> = {}): ConectorMundo {
  return {
    id: 'c1',
    tipo: 'salida',
    nodoOrigenId: 'origen',
    filaO: 3,
    columnaO: 9,
    nodoDestinoId: 'destino',
    filaD: 0,
    columnaD: 0,
    housingOwnerId: null,
    ...overrides,
  };
}

function main(): void {
  // --- inferirLadoConector ---
  assert(
    inferirLadoConector(conector(), { filas: 10, columnas: 10 }, { filas: 8, columnas: 8 }) === 'este',
    'infiere costura este (salida en borde derecho, llegada en borde izquierdo)',
  );
  assert(
    inferirLadoConector(
      conector({ filaO: 3, columnaO: 0, filaD: 0, columnaD: 7 }),
      { filas: 10, columnas: 10 },
      { filas: 8, columnas: 8 },
    ) === 'oeste',
    'infiere costura oeste',
  );
  assert(
    inferirLadoConector(
      conector({ filaO: 9, columnaO: 4, filaD: 0, columnaD: 2 }),
      { filas: 10, columnas: 10 },
      { filas: 8, columnas: 8 },
    ) === 'sur',
    'infiere costura sur',
  );
  assert(
    inferirLadoConector(
      conector({ filaO: 0, columnaO: 4, filaD: 7, columnaD: 2 }),
      { filas: 10, columnas: 10 },
      { filas: 8, columnas: 8 },
    ) === 'norte',
    'infiere costura norte',
  );
  assert(
    inferirLadoConector(
      conector({ filaO: 4, columnaO: 4, filaD: 3, columnaD: 3 }),
      { filas: 10, columnas: 10 },
      { filas: 8, columnas: 8 },
    ) === null,
    'conector interior no es costura',
  );
  assert(
    inferirLadoConector(
      conector({ tipo: 'portal', filaO: 3, columnaO: 9, filaD: 0, columnaD: 0 }),
      { filas: 10, columnas: 10 },
      { filas: 8, columnas: 8 },
    ) === null,
    'portal nunca es costura (housing/teletransporte)',
  );
  assert(
    inferirLadoConector(
      conector({ filaO: 3, columnaO: 9, filaD: 3, columnaD: 1 }),
      { filas: 10, columnas: 10 },
      { filas: 8, columnas: 8 },
    ) === null,
    'llegada que no está en el borde opuesto no es costura',
  );

  // --- colocarNodoDestino ---
  const este = colocarNodoDestino(conector(), { filas: 10, columnas: 10 }, { filas: 8, columnas: 8 });
  assert(este !== null && este.df === 3 && este.dc === 10, 'coloca el destino al este (df=filaO, dc=columnas)');

  const oeste = colocarNodoDestino(
    conector({ filaO: 3, columnaO: 0, filaD: 0, columnaD: 7 }),
    { filas: 10, columnas: 10 },
    { filas: 8, columnas: 8 },
  );
  assert(oeste !== null && oeste.df === 3 && oeste.dc === -8, 'coloca el destino al oeste (dc=-columnasDestino)');

  const sur = colocarNodoDestino(
    conector({ filaO: 9, columnaO: 4, filaD: 0, columnaD: 2 }),
    { filas: 10, columnas: 10 },
    { filas: 8, columnas: 8 },
  );
  assert(sur !== null && sur.df === 10 && sur.dc === 2, 'coloca el destino al sur (df=filasOrigen)');

  const norte = colocarNodoDestino(
    conector({ filaO: 0, columnaO: 4, filaD: 7, columnaD: 2 }),
    { filas: 10, columnas: 10 },
    { filas: 8, columnas: 8 },
  );
  assert(norte !== null && norte.df === -8 && norte.dc === 2, 'coloca el destino al norte (df=-filasDestino)');

  assert(
    colocarNodoDestino(conector({ filaO: 4, columnaO: 4, filaD: 3, columnaD: 3 }), { filas: 10, columnas: 10 }, { filas: 8, columnas: 8 }) === null,
    'conector interior no se coloca',
  );
  assert(
    colocarNodoDestino(
      conector({ tipo: 'portal', filaO: 9, columnaO: 9, filaD: 0, columnaD: 0 }),
      { filas: 10, columnas: 10 },
      { filas: 8, columnas: 8 },
    ) === null,
    'portal no se coloca (teletransporte)',
  );
  assert(
    colocarNodoDestino(
      conector({ lado: 'oeste', filaO: 3, columnaO: 9, filaD: 0, columnaD: 0 }),
      { filas: 10, columnas: 10 },
      { filas: 8, columnas: 8 },
    ) === null,
    'lado explícito incoherente con las celdas no se coloca',
  );

  // --- transformAbsoluto ---
  const mundo = new Map<string, NodoMundo>();
  const raiz = crearNodo('raiz', null, 10, 10);
  const hijo = crearNodo('hijo', 'raiz', 8, 8, { df: 0, dc: 10 });
  const nieto = crearNodo('nieto', 'hijo', 6, 6, { df: 5, dc: 0 });
  mundo.set(raiz.id, raiz);
  mundo.set(hijo.id, hijo);
  mundo.set(nieto.id, nieto);
  assert(JSON.stringify(transformAbsoluto(mundo, 'raiz')) === JSON.stringify({ df: 0, dc: 0 }), 'transform absoluto de la raíz es 0,0');
  assert(JSON.stringify(transformAbsoluto(mundo, 'hijo')) === JSON.stringify({ df: 0, dc: 10 }), 'transform absoluto del hijo suma al padre');
  assert(JSON.stringify(transformAbsoluto(mundo, 'nieto')) === JSON.stringify({ df: 5, dc: 10 }), 'transform absoluto del nieto acumula la cadena');

  const huerfano = crearNodo('huerfano', 'ausente', 5, 5, { df: 2, dc: 3 });
  mundo.set(huerfano.id, huerfano);
  assert(
    JSON.stringify(transformAbsoluto(mundo, 'huerfano')) === JSON.stringify({ df: 2, dc: 3 }),
    'si el padre no está cargado, el transform almacenado se trata como absoluto',
  );

  // --- celdaDestinoEnCostura ---
  const esteDestino = celdaDestinoEnCostura(
    conector({ lado: 'este' }),
    { df: 0, dc: 0 },
    { df: 3, dc: 10 },
    0,
    1,
    { filas: 8, columnas: 8 },
  );
  assert(esteDestino !== null && esteDestino.fila === 0 && esteDestino.columna === 0, 'este: la celda de salida del origen cae en el borde oeste del destino');

  const norteDestino = celdaDestinoEnCostura(
    conector({ lado: 'norte', filaO: 0, columnaO: 4, filaD: 7, columnaD: 2 }),
    { df: 0, dc: 0 },
    { df: -8, dc: 2 },
    -1,
    0,
    { filas: 8, columnas: 8 },
  );
  assert(norteDestino !== null && norteDestino.fila === 7 && norteDestino.columna === 2, 'norte: el cruce cae en el borde sur del destino');

  assert(
    celdaDestinoEnCostura(conector({ lado: 'este' }), { df: 0, dc: 0 }, { df: 3, dc: 10 }, 1, 0, { filas: 8, columnas: 8 }) === null,
    'dirección que no coincide con el lado devuelve null',
  );
  assert(
    celdaDestinoEnCostura(conector({ lado: 'este' }), { df: 0, dc: 0 }, { df: -10, dc: 10 }, 0, 1, { filas: 8, columnas: 8 }) === null,
    'destino fuera de rango devuelve null',
  );

  // --- nodosVisibles ---
  const visibles = nodosVisibles(
    [
      { id: 'a', transform: { df: 0, dc: 0 }, filas: 10, columnas: 10 },
      { id: 'b', transform: { df: 0, dc: 10 }, filas: 10, columnas: 10 },
      { id: 'c', transform: { df: 0, dc: 30 }, filas: 10, columnas: 10 },
      { id: 'd', transform: { df: 30, dc: 0 }, filas: 10, columnas: 10 },
    ],
    { colOffset: 0, filaOffset: 0 },
    { CELDAS_VISIBLES_X: 10, CELDAS_VISIBLES_Y: 10 },
  );
  assert(visibles.includes('a') && visibles.includes('b'), 'nodosVisibles incluye los nodos que cortan el viewport');
  assert(!visibles.includes('c') && !visibles.includes('d'), 'nodosVisibles excluye los nodos lejanos');


  // --- abrirCeldaCostura ---
  const celdasCostura: Celda[][] = [];
  for (let f = 0; f < 3; f++) {
    celdasCostura[f] = [];
    for (let c = 0; c < 3; c++) celdasCostura[f][c] = new Celda(f, c);
  }
  abrirCeldaCostura(celdasCostura, { lado: 'este', fila: 1, columna: 2, interior: 'oeste' });
  assert(celdasCostura[1][2].esTransitable, 'abrirCeldaCostura hace transitable el borde');
  assert(celdasCostura[1][2].muros.derecho === false, 'abrirCeldaCostura quita el muro del lado de la costura');
  assert(
    celdasCostura[1][1].esTransitable && celdasCostura[1][2].muros.izquierdo === false,
    'abrirCeldaCostura abre un paso hacia el interior',
  );
  abrirCeldaCostura(celdasCostura, { lado: 'este', fila: 99, columna: 99, interior: 'oeste' });
  assert(true, 'abrirCeldaCostura fuera de rango no lanza');

  console.log(`${ok}/${total} ok`);

}

main();
