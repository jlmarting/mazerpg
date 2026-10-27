export type ResultadoLease = 'ok' | 'rechazado' | 'error';

export interface EstadoGraciaLease {
  fallos: number;
}

/** Fallos transitorios consecutivos tolerados antes de degradar al host. */
export const FALLOS_LEASE_MAX = 3;

export function estadoGraciaLease(): EstadoGraciaLease {
  return { fallos: 0 };
}

/**
 * Contrato del lease: un rechazo real (otro host/epoch) degrada de inmediato;
 * un error transitorio solo degrada tras `FALLOS_LEASE_MAX` seguidos.
 */
export function aplicarResultadoLease(
  estado: EstadoGraciaLease,
  resultado: ResultadoLease,
): { degradar: boolean; estado: EstadoGraciaLease } {
  if (resultado === 'ok') return { degradar: false, estado: { fallos: 0 } };
  if (resultado === 'rechazado') return { degradar: true, estado: { fallos: 0 } };
  const fallos = estado.fallos + 1;
  return { degradar: fallos >= FALLOS_LEASE_MAX, estado: { fallos } };
}
