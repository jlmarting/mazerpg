export type EsquemaUI = 'dock' | 'acordeon';

export type PreferenciaUI = 'auto' | 'dock' | 'acordeon';

export const UMBRAL_DOCK_PX = 768;

export function sanearPreferencia(raw: unknown): PreferenciaUI {
  if (raw === 'auto' || raw === 'dock' || raw === 'acordeon') {
    return raw;
  }
  return 'auto';
}

export function resolverEsquema(preferencia: PreferenciaUI | null, punteroTosco: boolean, anchoPx: number): EsquemaUI {
  if (preferencia === 'dock') return 'dock';
  if (preferencia === 'acordeon') return 'acordeon';
  return punteroTosco && anchoPx >= UMBRAL_DOCK_PX ? 'dock' : 'acordeon';
}

export function esAcordeonMovil(esquema: EsquemaUI, punteroTosco: boolean, anchoPx: number): boolean {
  return esquema === 'acordeon' && punteroTosco && anchoPx < UMBRAL_DOCK_PX;
}