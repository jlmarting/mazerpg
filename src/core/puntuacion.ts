export interface Marcador {
  oro: number;
  xp: number;
  bajas: number;
  segundos: number;
}

export interface ResultadoPartida extends Marcador {
  nombre: string;
  puntuacion: number;
}

/** Puntuación F4: oro + XP·2 + bajas·10 + bonus de tiempo (máx. 900 s). */
export function calcularPuntuacion(m: Marcador): number {
  return m.oro + m.xp * 2 + m.bajas * 10 + Math.max(0, 900 - m.segundos);
}
