export interface SdpManual {
  type: string;
  sdp: string;
}

export interface PayloadManual {
  token: string | null;
  sdp: SdpManual;
}

/**
 * Normaliza la señalización manual: acepta el formato nuevo
 * `{ token, sdp: { type, sdp } }` y el antiguo/legacy `{ type, sdp }` (SDP
 * plano). Devuelve null si no hay una descripción SDP reconocible.
 */
export function extraerSdpManual(payload: unknown): PayloadManual | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const token = typeof p.token === 'string' ? p.token : null;

  if (p.sdp && typeof p.sdp === 'object') {
    const sdp = p.sdp as Record<string, unknown>;
    if (typeof sdp.type === 'string' && typeof sdp.sdp === 'string') {
      return { token, sdp: { type: sdp.type, sdp: sdp.sdp } };
    }
  }

  if (typeof p.type === 'string' && typeof p.sdp === 'string') {
    return { token, sdp: { type: p.type, sdp: p.sdp } };
  }

  return null;
}
