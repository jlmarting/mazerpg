/**
 * Identidad de jugador y de conexión.
 *
 * - `playerId`: identidad estable de la persona (localStorage). Viaja en el
 *   handshake y permite conservar roster/progreso al volver.
 * - `connId`: identidad de la pestaña (sessionStorage). Es el `idLocal` de red,
 *   el buzón WebRTC y la clave de presencia en la sala. Sobrevive a recargas de
 *   la misma pestaña, pero dos pestañas del mismo navegador no colisionan.
 */

const CLAVE_PLAYER = 'mazerpg.playerId';
const CLAVE_CONN = 'mazerpg.connId';
const RE_ID = /^P[A-Za-z0-9_-]{6,}$/;
const RE_CONN = /^[A-Za-z0-9_-]{6,}$/;

export interface AlmacenLike {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

function trozo(rng: () => number): string {
  return Math.floor(rng() * 0x100000000)
    .toString(36)
    .padStart(7, '0');
}

/** Genera un `playerId` válido y estable si se le pasa un `rng` determinista. */
export function generarIdJugador(rng: () => number = Math.random): string {
  return `P${trozo(rng)}${trozo(rng)}`.slice(0, 20);
}

/**
 * Devuelve el `playerId` persistido en el almacén dado o genera y guarda uno
 * nuevo. Con `sessionStorage` (por pestaña) cada cliente es un jugador distinto;
 * al reanudar una sesión se adopta el `playerId` guardado.
 */
export function obtenerPlayerId(
  almacen: AlmacenLike,
  generar: () => string = () => generarIdJugador(),
): string {
  const existente = almacen.getItem(CLAVE_PLAYER);
  if (existente && RE_ID.test(existente)) return existente;
  const nuevo = generar();
  almacen.setItem(CLAVE_PLAYER, nuevo);
  return nuevo;
}

/**
 * Devuelve el `connId` de esta pestaña. Si la sesión ya tiene uno válido para
 * este `playerId`, se reutiliza (recarga de la misma pestaña); si no, se crea
 * un nonce nuevo y se persiste en `sessionStorage`.
 */
export function crearIdConexion(
  playerId: string,
  sesion: AlmacenLike,
  rng: () => number = Math.random,
): string {
  const existente = sesion.getItem(CLAVE_CONN);
  if (existente && existente.startsWith(`${playerId}-`) && RE_CONN.test(existente)) {
    return existente;
  }
  const connId = `${playerId}-${trozo(rng)}`;
  sesion.setItem(CLAVE_CONN, connId);
  return connId;
}
