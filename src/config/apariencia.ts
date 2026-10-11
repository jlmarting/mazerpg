import type { ZonaAvatar } from '../core/avatarTintes';

/** Paletas cerradas por zona (sin color libre: acota la caché y garantiza armonía). */
export const PALETAS: Record<ZonaAvatar, string[]> = {
  piel: ['#f2c9a0', '#d9a066', '#a0663a', '#7a4a26', '#4a2c14'],
  pelo: ['#4a301a', '#463c5a', '#5a2220', '#2b1a0e', '#8b5a2b', '#d9d9d9', '#1a1a1a', '#7a2e2e'],
  torso: ['#143c1e', '#2d1455', '#525b74', '#2e783c', '#693caf', '#7a1f1f', '#1f3a7a', '#202020'],
  piernas: ['#8b5a2b', '#cdcde1', '#d7cfc0', '#4a301a', '#2b2b2b', '#3a5a7a', '#5a3a2e', '#6e6e6e'],
};

/**
 * Tonos del sprite base que identifican cada zona (muestreados de public/sprites/players.png).
 * Lista vacía = zona indistinguible → no se tiñe en v1. Los tonos pueden repetirse
 * entre zonas (p. ej. grises del guerrero): la banda vertical desambigua.
 */
export const ORIGEN_ZONA: Record<string, Record<ZonaAvatar, string[]>> = {
  explorador: {
    piel: ['#ffc47d', '#e17235', '#e1b273', '#ffde88', '#f8cf83', '#f0c57a', '#fad27e', '#ffcd7b', '#ffd87c', '#ffdd81', '#da8a4b', '#edcb91', '#c29859', '#ccb8bb', '#9d7478', '#9e512b', '#a45f37'],
    pelo: ['#4a301a'],
    torso: ['#143c1e', '#2e783c'],
    piernas: ['#8b5a2b'],
  },
  mago: {
    piel: ['#ffc47d', '#e17235', '#e1b273', '#ffde88', '#f8cf83', '#f0c57a', '#fad27e', '#ffcd7b', '#ffd87c', '#ffdd81', '#da8a4b', '#edcb91', '#c29859', '#ccb8bb', '#9d7478', '#9e512b', '#a45f37'],
    pelo: ['#463c5a'],
    torso: ['#2d1455', '#693caf'],
    piernas: ['#cdcde1'],
  },
  guerrero: {
    piel: ['#a19690', '#d7cfc0'],
    pelo: ['#5a2220', '#a19690'],
    torso: ['#525b74', '#131f3a'],
    piernas: ['#d7cfc0', '#310004'],
  },
};

/**
 * Bandas verticales por zona (fracción de alto del frame): el píxel pertenece
 * a la zona si su tono es cercano Y su (y+0.5)/alto cae en la banda.
 * Los solapes son intencionales (fronteras): el tono más cercano decide.
 */
export const BANDAS: Record<ZonaAvatar, [number, number]> = {
  pelo: [0, 0.38],
  piel: [0.30, 0.48],
  torso: [0.40, 0.70],
  piernas: [0.62, 1],
};

/** Bandas por estado: caídos (y defensa, sin frames propios) van en defecto. */
export function bandasPara(estado: string): Record<ZonaAvatar, [number, number]> | null {
  if (estado === 'fallen' || estado === 'defending') return null;
  return BANDAS;
}

/** Defecto por clase ≡ sprite actual (primeros tonos de ORIGEN; piel = primer hex de su paleta). */
export const APARIENCIA_DEFECTO: Record<string, { formato: 1; zonas: Record<ZonaAvatar, string> }> = {
  explorador: { formato: 1, zonas: { piel: '#f2c9a0', pelo: '#4a301a', torso: '#143c1e', piernas: '#8b5a2b' } },
  mago: { formato: 1, zonas: { piel: '#f2c9a0', pelo: '#463c5a', torso: '#2d1455', piernas: '#cdcde1' } },
  guerrero: { formato: 1, zonas: { piel: '#f2c9a0', pelo: '#5a2220', torso: '#525b74', piernas: '#d7cfc0' } },
};

export const UMBRAL_TINTE = 40;
export const LRU_MAX = 64;
