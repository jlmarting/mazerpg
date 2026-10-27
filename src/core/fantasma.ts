/**
 * Reglas puras del estado fantasma (F5 v1).
 *
 * Sin dependencias del juego: la autoridad de red y el render viven en
 * `main.ts` / `Renderer.ts`; aquí solo se decide qué puede hacer cada estado.
 */

export type EstadoVida = 'vivo' | 'fantasma' | 'fuera';
export type EstadoRoster = EstadoVida | 'ausente';

export interface ConEstadoVida {
  estadoVida?: EstadoVida;
  fila: number;
  columna: number;
}

export interface Celda {
  fila: number;
  columna: number;
}

export function estadoVidaDe(e: ConEstadoVida): EstadoVida {
  return e.estadoVida ?? 'vivo';
}

export function esFantasma(e: ConEstadoVida): boolean {
  return estadoVidaDe(e) === 'fantasma';
}

export function puedeInteractuar(e: ConEstadoVida): boolean {
  return estadoVidaDe(e) === 'vivo';
}

export function esResucitable(e: ConEstadoVida): boolean {
  return estadoVidaDe(e) === 'fantasma';
}

/** 50 % de la vida máxima, con mínimo 1. */
export function calcularVidaResurreccion(vidaMaxima: number): number {
  return Math.max(1, Math.floor(vidaMaxima * 0.5));
}

/** El usuario debe estar en la misma celda o en una de las 4 contiguas. */
export function adyacenteAlCuerpo(usuario: Celda, cuerpo: Celda): boolean {
  return Math.abs(usuario.fila - cuerpo.fila) + Math.abs(usuario.columna - cuerpo.columna) <= 1;
}

export interface OpcionesTeletransporte {
  jugadores: Celda[];
  filas: number;
  columnas: number;
  ocupadas?: Set<string>;
  rng?: () => number;
}

/**
 * Elige una celda libre a 1–3 celdas Manhattan de un jugador al azar.
 * Devuelve `null` si no hay jugadores o no queda hueco.
 */
export function elegirDestinoTeletransporte(opciones: OpcionesTeletransporte): Celda | null {
  const { jugadores, filas, columnas, ocupadas, rng = Math.random } = opciones;
  if (jugadores.length === 0) return null;

  const indice = Math.min(jugadores.length - 1, Math.floor(rng() * jugadores.length));
  const centro = jugadores[indice];
  const candidatos: Celda[] = [];

  for (let df = -3; df <= 3; df++) {
    for (let dc = -3; dc <= 3; dc++) {
      const distancia = Math.abs(df) + Math.abs(dc);
      if (distancia < 1 || distancia > 3) continue;
      const fila = centro.fila + df;
      const columna = centro.columna + dc;
      if (fila < 0 || fila >= filas || columna < 0 || columna >= columnas) continue;
      if (ocupadas?.has(`${fila},${columna}`)) continue;
      candidatos.push({ fila, columna });
    }
  }

  if (candidatos.length === 0) return null;
  const elegido = Math.min(candidatos.length - 1, Math.floor(rng() * candidatos.length));
  return candidatos[elegido];
}

/** La partida solo termina cuando todo el roster está `fuera`. */
export function debeTerminarPartida(estados: Iterable<EstadoRoster>): boolean {
  let total = 0;
  for (const estado of estados) {
    total++;
    if (estado !== 'fuera') return false;
  }
  return total > 0;
}
