export type Lado = 'superior' | 'inferior' | 'izquierdo' | 'derecho';

export interface VecinosSuelo {
  superior: boolean;
  inferior: boolean;
  izquierdo: boolean;
  derecho: boolean;
}

/** Hash determinista fila/columna → [0,1). Multiplicacion de 32 bits reales. */
export function hashCelda(fila: number, columna: number): number {
  let h = (fila * 73856093) ^ (columna * 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** Caras del muro que dan a suelo transitable (las únicas que se pintan). */
export function carasHaciaSuelo(vecinos: VecinosSuelo): Lado[] {
  const caras: Lado[] = [];
  if (vecinos.superior) caras.push('superior');
  if (vecinos.inferior) caras.push('inferior');
  if (vecinos.izquierdo) caras.push('izquierdo');
  if (vecinos.derecho) caras.push('derecho');
  return caras;
}

/** Variante de suelo determinista: cesped comun, tierra rara, grieta escasa. */
export function varianteSuelo(fila: number, columna: number): 'cesped' | 'normal' | 'grieta' {
  const h = hashCelda(fila, columna);
  if (h < 0.70) return 'cesped';
  if (h < 0.88) return 'normal';
  return 'grieta';
}
