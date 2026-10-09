import { Celda } from './Celda';
import { generarNombreBurbuja } from '../utils/session';

export interface AlimentoMundo {
  tipo: string;
  pc: number;
}

const ALIMENTOS: ReadonlyArray<AlimentoMundo> = [
  { tipo: 'Manzana', pc: 5 },
  { tipo: 'Plátano', pc: 8 },
  { tipo: 'Kiwi', pc: 10 },
  { tipo: 'Brócoli', pc: 25 },
  { tipo: 'Muslo de pollo', pc: 35 },
  { tipo: 'Chuleta', pc: 40 },
  { tipo: 'Pescado', pc: 70 },
];

/**
 * Coloca los objetos ambientales (comida, burbujas, portales clásicos y picos)
 * de forma determinista a partir del rng sembrado del nodo. Al ser reproducible,
 * un nodo cargado reconstruye exactamente los mismos objetos y los deltas de
 * recogida/consumo (que se aplican después) caen encima sin divergir.
 */
export function poblarObjetosAmbiente(celdas: Celda[][], rng: () => number): void {
  const filas = celdas.length;
  const columnas = filas > 0 ? celdas[0].length : 0;
  if (filas === 0 || columnas === 0) return;

  const buscarTransitable = (excluir?: (celda: Celda) => boolean): Celda | null => {
    for (let intento = 0; intento < 1000; intento++) {
      const f = Math.floor(rng() * filas);
      const c = Math.floor(rng() * columnas);
      const celda = celdas[f][c];
      if (celda.esTransitable && (!excluir || !excluir(celda))) return celda;
    }
    return null;
  };

  for (let i = 0; i < 30; i++) {
    const celda = buscarTransitable();
    if (!celda) break;
    const base = ALIMENTOS[Math.floor(rng() * ALIMENTOS.length)];
    celda.alimento = { tipo: base.tipo, pc: base.pc };
  }

  const nombres = new Set<string>();
  const burbujas: Array<{ celda: Celda; nombre: string }> = [];
  for (let i = 0; i < 5; i++) {
    const celda = buscarTransitable((c) => c.burbuja !== null);
    if (!celda) continue;
    let nombre = '';
    for (let intento = 0; intento < 100; intento++) {
      nombre = generarNombreBurbuja(rng);
      if (!nombres.has(nombre)) break;
    }
    nombres.add(nombre);
    burbujas.push({ celda, nombre });
  }

  burbujas.forEach((b, i) => {
    const siguiente = burbujas[(i + 1) % burbujas.length];
    b.celda.burbuja = { nombreSecreto: b.nombre, destino: siguiente ? siguiente.nombre : b.nombre };
  });

  const opcionesPortales = [0, 2, 5];
  const numPortales = opcionesPortales[Math.floor(rng() * opcionesPortales.length)];
  for (let i = 0; i < numPortales; i++) {
    const celda = buscarTransitable((c) => c.burbuja !== null || c.esPortal);
    if (celda) celda.esPortal = true;
  }

  const numPicos = Math.floor(rng() * 11);
  for (let i = 0; i < numPicos; i++) {
    const celda = buscarTransitable((c) => c.burbuja !== null || c.esPortal || c.tienePico);
    if (celda) celda.tienePico = true;
  }
}
