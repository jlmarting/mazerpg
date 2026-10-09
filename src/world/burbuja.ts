export const RADIO_SIM_DEFECTO = 2;

export function dentroDeBurbuja(
  fila: number,
  columna: number,
  f0: number,
  c0: number,
  radio: number,
): boolean {
  const df = fila - f0;
  const dc = columna - c0;
  return Math.sqrt(df * df + dc * dc) <= radio;
}

export function radioSimPorDefecto(radioVis: number): number {
  return Math.min(radioVis, RADIO_SIM_DEFECTO);
}
