import { calcularLayoutMapa, proyectarMapa, type NodoMapa } from './mapamundi';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) throw new Error(`FALLO: ${mensaje}`);
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

function nodo(
  id: string,
  df: number,
  dc: number,
  filas: number,
  columnas: number,
  tipo: NodoMapa['tipo'] = 'mazmorra',
): NodoMapa {
  return { id, tipo, transform: { df, dc }, filas, columnas };
}

const CADENA: NodoMapa[] = [
  nodo('raiz', 0, 0, 80, 80),
  nodo('zona-abierto-1', 0, 80, 80, 80, 'abierto'),
  nodo('zona-abierto-2', 1, 160, 40, 40, 'abierto'),
  nodo('zona-abierto-3', 1, 200, 40, 40, 'abierto'),
  nodo('zona-abierto-4', 1, 240, 40, 40, 'abierto'),
  nodo('casa-L1', 0, 0, 9, 16, 'personal'),
];

function main(): void {
  const descubiertos = new Set(['raiz', 'zona-abierto-1']);
  const layout = calcularLayoutMapa(CADENA, descubiertos, 960, 540);
  assert(layout !== null, 'la cadena produce layout');
  if (layout) {
    assert(layout.nodos.length === 5, 'excluye la casa personal del layout');
    assert(
      layout.nodos.find((n) => n.nodo.id === 'raiz')?.descubierto === true &&
        layout.nodos.find((n) => n.nodo.id === 'zona-abierto-1')?.descubierto === true,
      'marca los nodos descubiertos',
    );
    assert(
      layout.nodos.find((n) => n.nodo.id === 'zona-abierto-2')?.descubierto === false,
      'los no descubiertos quedan sin revelar',
    );
    assert(layout.escala > 0 && layout.escala <= 6, 'la escala queda acotada');
    assert(
      layout.bounds.minColumna < layout.bounds.maxColumna &&
        layout.bounds.minFila < layout.bounds.maxFila,
      'los bounds cubren el mundo',
    );
    const raiz = layout.nodos.find((n) => n.nodo.id === 'raiz')!;
    assert(raiz.w > 0 && raiz.h > 0, 'los rectángulos tienen tamaño');
    const p = proyectarMapa(layout, 40, 40);
    assert(
      p.x > raiz.x && p.x < raiz.x + raiz.w && p.y > raiz.y && p.y < raiz.y + raiz.h,
      'la proyección de una celda cae dentro del nodo correcto',
    );
  }

  const casa = calcularLayoutMapa([nodo('casa', 0, 0, 9, 16, 'personal')], new Set(), 300, 200);
  assert(casa === null, 'solo nodos personales → sin layout espacial');

  const vacio = calcularLayoutMapa([], new Set(), 300, 200);
  assert(vacio === null, 'sin nodos → sin layout');

  const uno = calcularLayoutMapa([nodo('raiz', 0, 0, 10, 10)], new Set(), 960, 540);
  assert(uno !== null && uno.escala === 6, 'un mundo pequeño topa con la escala máxima');

  const grande = calcularLayoutMapa([nodo('raiz', 0, 0, 2000, 2000)], new Set(), 400, 300);
  assert(grande !== null && grande.escala === 1, 'un mundo enorme baja al mínimo');

  const jugador = proyectarMapa(layout!, 0, 0);
  assert(
    jugador.x === layout!.nodos.find((n) => n.nodo.id === 'raiz')!.x,
    'proyectar (0,0) coincide con el borde del nodo raíz',
  );

  console.log(`${ok}/${total} ok`);
}

main();
