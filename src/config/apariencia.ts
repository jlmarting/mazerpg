import type { ZonaAvatar } from '../core/avatarTintes';

/** Paletas cerradas por zona (sin color libre: acota la caché y garantiza armonía). */
export const PALETAS: Record<ZonaAvatar, string[]> = {
  piel: ['#f2c9a0', '#d9a066', '#a0663a', '#7a4a26', '#4a2c14'],
  pelo: ['#4a301a', '#463c5a', '#2b1a0e', '#8b5a2b', '#d9d9d9', '#1a1a1a', '#7a2e2e', '#e8e0d0'],
  torso: ['#143c1e', '#2d1455', '#2e783c', '#693caf', '#7a1f1f', '#1f3a7a', '#5a5a5a', '#202020'],
  piernas: ['#8b5a2b', '#cdcde1', '#4a301a', '#2b2b2b', '#3a5a7a', '#5a3a2e', '#6e6e6e', '#101010'],
};

/**
 * Tonos del sprite base que identifican cada zona (muestreados de public/sprites/players.png).
 * Lista vacía = zona indistinguible (guerrero fotográfico; piel sin tono propio) → no se tiñe en v1.
 */
export const ORIGEN_ZONA: Record<string, Record<ZonaAvatar, string[]>> = {
  explorador: { piel: [], pelo: ['#4a301a'], torso: ['#143c1e', '#2e783c'], piernas: ['#8b5a2b'] },
  mago: { piel: [], pelo: ['#463c5a'], torso: ['#2d1455', '#693caf'], piernas: ['#cdcde1'] },
  guerrero: { piel: [], pelo: [], torso: [], piernas: [] },
};

/** Defecto por clase ≡ sprite actual (primeros tonos de ORIGEN; piel = primer hex de su paleta). */
export const APARIENCIA_DEFECTO: Record<string, { formato: 1; zonas: Record<ZonaAvatar, string> }> = {
  explorador: { formato: 1, zonas: { piel: '#f2c9a0', pelo: '#4a301a', torso: '#143c1e', piernas: '#8b5a2b' } },
  mago: { formato: 1, zonas: { piel: '#f2c9a0', pelo: '#463c5a', torso: '#2d1455', piernas: '#cdcde1' } },
  guerrero: { formato: 1, zonas: { piel: '#f2c9a0', pelo: '#4a301a', torso: '#143c1e', piernas: '#8b5a2b' } },
};

export const UMBRAL_TINTE = 40;
export const LRU_MAX = 64;
