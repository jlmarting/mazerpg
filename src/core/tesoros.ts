export type TipoCofre = 'hierro' | 'acero' | 'titanio';

/** Probabilidad de que un cofre incluya una pócima de resurrección (F5). */
export const PROBABILIDAD_POCIMA_RESURRECCION = 0.08;

/** Sortea si el cofre suelta la pócima; `rng` inyectable para tests. */
export function cofreSueltaPocimaResurreccion(rng: () => number = Math.random): boolean {
  return rng() < PROBABILIDAD_POCIMA_RESURRECCION;
}
export type TipoLlave = TipoCofre;

export const ORO_POR_COFRE: Record<TipoCofre, number> = {
  hierro: 10,
  acero: 30,
  titanio: 100,
};

export const LLAVE_POR_COFRE: Record<TipoCofre, string> = {
  hierro: 'llave_hierro',
  acero: 'llave_acero',
  titanio: 'llave_titanio',
};

export function llaveDeCofre(tipo: TipoCofre): string {
  return LLAVE_POR_COFRE[tipo];
}

export function oroDeCofre(tipo: TipoCofre): number {
  return ORO_POR_COFRE[tipo];
}

/** La llave es reutilizable: basta con tener al menos una. */
export function puedeAbrirCofre(tipo: TipoCofre, inventario: Record<string, number>): boolean {
  return (inventario[llaveDeCofre(tipo)] ?? 0) > 0;
}
