import { calcularStreaming, type NodoStreaming, type VistaStreaming } from './streaming';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) throw new Error(`FALLO: ${mensaje}`);
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

const CADENA: NodoStreaming[] = [
  { id: 'raiz', transform: { df: 0, dc: 0 }, filas: 80, columnas: 80 },
  { id: 'zona-abierto-1', transform: { df: 0, dc: 80 }, filas: 80, columnas: 80 },
  { id: 'zona-abierto-2', transform: { df: 1, dc: 160 }, filas: 40, columnas: 40 },
  { id: 'zona-abierto-3', transform: { df: 1, dc: 200 }, filas: 40, columnas: 40 },
  { id: 'zona-abierto-4', transform: { df: 1, dc: 240 }, filas: 40, columnas: 40 },
];

function vista(minColumna: number, maxColumna: number, minFila = 0, maxFila = 40): VistaStreaming {
  return { minFila, maxFila, minColumna, maxColumna };
}

function comprobarInvariantes(seleccion: ReturnType<typeof calcularStreaming>, etiqueta: string): void {
  const hot = new Set(seleccion.hot);
  const lod = new Set(seleccion.lod);
  const cold = new Set(seleccion.cold);
  assert(seleccion.hot.length <= 3, `${etiqueta}: hot no supera el cap 3`);
  for (const id of hot) assert(!lod.has(id) && !cold.has(id), `${etiqueta}: ${id} no está en dos niveles`);
  for (const id of lod) assert(!cold.has(id), `${etiqueta}: ${id} no está en lod y cold`);
  assert(hot.size + lod.size + cold.size === CADENA.length, `${etiqueta}: la unión cubre los 5 nodos`);
}

function main(): void {
  const enRaiz = calcularStreaming(CADENA, 'raiz', vista(20, 60));
  assert(enRaiz.niveles.get('raiz') === 'activo', 'raíz es el nodo activo');
  assert(enRaiz.niveles.get('zona-abierto-1') === 'lod', 'zona-abierto-1 entra en lod por el margen de 40');
  assert(enRaiz.niveles.get('zona-abierto-2') === 'cold', 'zona-abierto-2 está fría desde la raíz');
  comprobarInvariantes(enRaiz, 'vista raíz');

  const enZona1 = calcularStreaming(CADENA, 'zona-abierto-1', vista(90, 130));
  assert(enZona1.niveles.get('zona-abierto-1') === 'activo', 'zona1 activa');
  assert(enZona1.hot.includes('zona-abierto-1'), 'el activo está en hot');
  comprobarInvariantes(enZona1, 'vista zona1');

  const enZona2 = calcularStreaming(CADENA, 'zona-abierto-2', vista(160, 200));
  assert(enZona2.niveles.get('zona-abierto-2') === 'activo', 'zona2 activa');
  assert(enZona2.niveles.get('zona-abierto-3') === 'hot', 'zona3 es vecina caliente');
  assert(enZona2.niveles.get('zona-abierto-1') === 'hot', 'zona1 es vecina caliente');
  assert(enZona2.niveles.get('raiz') === 'cold', 'la raíz queda fría desde zona2');
  comprobarInvariantes(enZona2, 'vista zona2');

  const enZona3 = calcularStreaming(CADENA, 'zona-abierto-3', vista(200, 240));
  assert(enZona3.niveles.get('zona-abierto-4') === 'hot', 'zona4 es vecina caliente de zona3');
  assert(enZona3.hot.length === 3, 'zona3 mantiene 3 nodos calientes (activo + vecinos)');
  comprobarInvariantes(enZona3, 'vista zona3');

  const lod = calcularStreaming(CADENA, 'zona-abierto-2', vista(165, 205));
  assert(lod.niveles.get('zona-abierto-4') === 'lod', 'zona4 entra en lod con el margen de 40');
  comprobarInvariantes(lod, 'vista lod');

  const cap = calcularStreaming(CADENA, 'zona-abierto-2', vista(70, 280));
  assert(cap.hot.length === 3, 'una vista que corta toda la cadena respeta el cap 3');
  assert(cap.lod.length >= 1, 'los candidatos que no caben pasan a lod');
  comprobarInvariantes(cap, 'vista amplia');

  const sinActivo = calcularStreaming(CADENA, 'inexistente', vista(20, 60));
  assert(sinActivo.niveles.size === CADENA.length, 'sin activo se clasifican todos los nodos');
  assert(!sinActivo.hot.includes('inexistente'), 'sin activo no inventa el id');
  comprobarInvariantes(sinActivo, 'sin activo');

  const vacio = calcularStreaming([], 'raiz', vista(0, 10));
  assert(vacio.hot.length === 0 && vacio.lod.length === 0 && vacio.cold.length === 0, 'lista vacía no rompe');

  const margenes = calcularStreaming(CADENA, 'zona-abierto-3', vista(210, 230), { margenHot: 2, margenLod: 10, maxHot: 2 });
  assert(margenes.hot.length <= 2, 'maxHot configurable se respeta');
  assert(margenes.niveles.get('zona-abierto-4') === 'cold', 'con margen LOD 10 zona4 queda fría');
  comprobarInvariantes(margenes, 'márgenes personalizados');

  console.log(`${ok}/${total} ok`);
}

main();
