import { generarNodo } from './generadores';
import { generarPoblacion } from './poblacion';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) throw new Error(`FALLO: ${mensaje}`);
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

function main(): void {
  const gen = { nombre: 'abierto', version: 1, seed: 4242, params: {} };
  const celdas = generarNodo(gen, 40, 40);

  const a = generarPoblacion({ seed: gen.seed, celdas, filas: 40, columnas: 40, dificultad: 'dificil' });
  const b = generarPoblacion({ seed: gen.seed, celdas, filas: 40, columnas: 40, dificultad: 'dificil' });
  assert(a.length > 0, 'la población determinista no está vacía');
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    'misma semilla + mismas celdas ⇒ misma población',
  );

  const otra = generarPoblacion({ seed: gen.seed + 1, celdas, filas: 40, columnas: 40, dificultad: 'dificil' });
  assert(
    JSON.stringify(a) !== JSON.stringify(otra),
    'semillas distintas ⇒ poblaciones distintas',
  );

  assert(
    generarPoblacion({ seed: gen.seed, celdas, filas: 40, columnas: 40, dificultad: 'dificil', spec: { modo: 'ninguna' } }).length === 0,
    'spec modo=ninguna deja el nodo vacío',
  );

  const tipos = generarPoblacion({
    seed: gen.seed,
    celdas,
    filas: 40,
    columnas: 40,
    dificultad: 'dificil',
    spec: { tipos: ['Lobo'] },
  });
  assert(tipos.every((e) => e.tipo === 'Lobo'), 'spec.tipos restringe los tipos de mob');

  const mitad = generarPoblacion({
    seed: gen.seed,
    celdas,
    filas: 40,
    columnas: 40,
    dificultad: 'dificil',
    spec: { densidad: 0.5 },
  });
  assert(mitad.length <= a.length, 'spec.densidad reduce (o iguala) la cantidad');

  assert(
    a.every((e) => celdas[e.fila]?.[e.columna]?.esTransitable === true),
    'todos los mobs caen en celdas transitables',
  );

  console.log(`${ok}/${total} ok`);
}

main();
