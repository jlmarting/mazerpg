/**
 * Reglas puras de la migración de host: lease, presencia y elección.
 *
 * La sala es la fuente de verdad (Firestore o signaling HTTP). Estas funciones
 * no tocan red ni DOM: reciben una foto de `EstadoSala` y deciden qué hacer.
 */

export interface JugadorSala {
  playerId: string;
  nick: string;
  ultimaVez: number;
}

export interface EstadoSala {
  hostId: string;
  hostNick: string;
  /** playerId estable del host (para reconocer una sesión propia anterior). */
  hostPlayerId: string;
  hostEpoch: number;
  lastSeen: number;
  jugadores: Record<string, JugadorSala>;
  /** La foto vino de la caché local (Firestore offline); no decide elecciones. */
  desdeCache?: boolean;
}

export const LEASE_HOST_MS = 60_000;
export const PRESENCIA_JUGADOR_MS = 30_000;
export const INTERVALO_LATIDO_HOST_MS = 5_000;
export const INTERVALO_PRESENCIA_MS = 10_000;
export const INTERVALO_VIGILANCIA_MS = 2_000;
export const ESPERA_ELECCION_MS = 15_000;

export type AccionHost = 'ninguna' | 'reconectar' | 'reclamar' | 'esperar' | 'cerrar';

export interface DecisionHost {
  accion: AccionHost;
  hostId?: string;
  candidatoId?: string;
}

/** ¿El host de la sala sigue vivo según su lease? */
export function hostVivo(
  estado: EstadoSala | null,
  ahora: number,
  lease: number = LEASE_HOST_MS,
): boolean {
  if (!estado || !estado.hostId || estado.hostId === 'L_placeholder') return false;
  return ahora - (estado.lastSeen ?? 0) <= lease;
}

/** Ids de conexión con presencia vigente. */
export function jugadoresPresentes(
  estado: EstadoSala | null,
  ahora: number,
  ttl: number = PRESENCIA_JUGADOR_MS,
): string[] {
  if (!estado?.jugadores) return [];
  return Object.entries(estado.jugadores)
    .filter(([, jugador]) => !!jugador && ahora - (jugador.ultimaVez ?? 0) <= ttl)
    .map(([id]) => id);
}

/**
 * Candidato a nuevo host: el menor id de conexión con presencia vigente,
 * excluyendo al host caído (si sigue vivo, no hay migración que elegir).
 */
export function elegirCandidato(
  estado: EstadoSala | null,
  ahora: number,
  ttl: number = PRESENCIA_JUGADOR_MS,
): string | null {
  if (!estado) return null;
  const excluido = hostVivo(estado, ahora) ? null : estado.hostId;
  const ids = jugadoresPresentes(estado, ahora, ttl)
    .filter((id) => id !== excluido)
    .sort();
  return ids[0] ?? null;
}

/** Decide qué debe hacer este cliente con la foto actual de la sala. */
export function resolverHost(
  estado: EstadoSala | null,
  selfId: string,
  ahora: number,
): DecisionHost {
  if (!estado) return { accion: 'cerrar' };

  if (hostVivo(estado, ahora)) {
    if (estado.hostId === selfId) return { accion: 'ninguna' };
    return { accion: 'reconectar', hostId: estado.hostId };
  }

  const candidato = elegirCandidato(estado, ahora);
  if (!candidato) return { accion: 'cerrar' };
  if (candidato === selfId) return { accion: 'reclamar' };
  return { accion: 'esperar', candidatoId: candidato };
}

/** ¿La sala considera a este id el host vigente? */
export function esHostVigente(estado: EstadoSala | null, selfId: string): boolean {
  return !!estado && estado.hostId === selfId;
}
