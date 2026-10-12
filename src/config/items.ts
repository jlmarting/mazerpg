/**
 * Catálogo de objetos — piloto v1 de inventario/equipamiento.
 *
 * Estructura mínima pero extensible: tipo (equipo/consumible/material), ranura
 * de equipo, manos (armas a dos manos), bonos a características, peso y
 * apilabilidad. `pieza` es el puente visual con el compositor de avatar
 * (`RanuraPieza` del módulo `core/avatarTintes`): el equipo viste al personaje.
 *
 * Los consumibles/materiales NO llevan ranura (se apilan en la mochila).
 */

export type RanuraEquipo =
  | 'cabeza'
  | 'torso'
  | 'piernas'
  | 'mano_derecha'
  | 'mano_izquierda'
  | 'escudo'
  | 'accesorio';

export type TipoItem = 'equipo' | 'consumible' | 'material';

export interface Bonos {
  fuerza?: number;
  agilidad?: number;
  inteligencia?: number;
  vida?: number;
}

export interface ItemDef {
  id: string;
  nombre: string;
  tipo: TipoItem;
  /** Solo para `tipo: 'equipo'`. */
  ranura?: RanuraEquipo;
  /** Armas: 1 (por defecto) o 2 manos. Un arma a dos manos vive en `mano_derecha`. */
  manos?: 1 | 2;
  bonos?: Bonos;
  peso: number;
  apilable: boolean;
  /** Consumibles: vida que restaura al usarlos. */
  curacion?: number;
  /** Variante de pieza del avatar que muestra este item equipado (puente visual). */
  pieza?: string;
  descripcion?: string;
}

export const ITEMS: Record<string, ItemDef> = {
  // --- Armadura / vestimenta (viste al avatar) ---
  casco_hierro: {
    id: 'casco_hierro', nombre: 'Casco de hierro', tipo: 'equipo', ranura: 'cabeza',
    bonos: { fuerza: 1 }, peso: 2, apilable: false, pieza: 'casco', descripcion: 'Protege la cabeza.',
  },
  peto_cuero: {
    id: 'peto_cuero', nombre: 'Peto de cuero', tipo: 'equipo', ranura: 'torso',
    bonos: { agilidad: 1 }, peso: 3, apilable: false, pieza: 'peto', descripcion: 'Ligero y silencioso.',
  },
  botas_veloces: {
    id: 'botas_veloces', nombre: 'Botas veloces', tipo: 'equipo', ranura: 'piernas',
    bonos: { agilidad: 2 }, peso: 1.5, apilable: false, pieza: 'botas', descripcion: 'Pisada ligera.',
  },

  // --- Armas ---
  espada_corta: {
    id: 'espada_corta', nombre: 'Espada corta', tipo: 'equipo', ranura: 'mano_derecha',
    bonos: { fuerza: 2 }, peso: 2, apilable: false, descripcion: 'Fiable a una mano.',
  },
  daga: {
    id: 'daga', nombre: 'Daga', tipo: 'equipo', ranura: 'mano_derecha',
    bonos: { agilidad: 1 }, peso: 0.5, apilable: false, descripcion: 'Rápida y discreta.',
  },
  arco_largo: {
    id: 'arco_largo', nombre: 'Arco largo', tipo: 'equipo', ranura: 'mano_derecha', manos: 2,
    bonos: { agilidad: 3 }, peso: 2.5, apilable: false, descripcion: 'Requiere ambas manos.',
  },
  escudo_madera: {
    id: 'escudo_madera', nombre: 'Escudo de madera', tipo: 'equipo', ranura: 'escudo',
    bonos: { vida: 5 }, peso: 3, apilable: false, descripcion: 'Bloquea golpes.',
  },

  // --- Accesorios ---
  anillo_fuerza: {
    id: 'anillo_fuerza', nombre: 'Anillo de fuerza', tipo: 'equipo', ranura: 'accesorio',
    bonos: { fuerza: 1 }, peso: 0.1, apilable: false, descripcion: 'Poder concentrado.',
  },

  // --- Consumibles / materiales (a la mochila, apilables) ---
  pocion_vida: {
    id: 'pocion_vida', nombre: 'Poción de vida', tipo: 'consumible', peso: 0.5, apilable: true,
    curacion: 25, descripcion: 'Restaura 25 de vida al usarla.',
  },
  flecha: {
    id: 'flecha', nombre: 'Flecha', tipo: 'material', peso: 0.1, apilable: true,
    descripcion: 'Munición para arcos.',
  },
};
