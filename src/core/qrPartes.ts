export const PREFIJO_QR = 'MZ3/';
export const NUM_PARTES_QR = 3;

/**
 * Divide un payload (base64 del SDP) en `n` partes con cabecera
 * `MZ3/{i}/{n}|`. El SDP completo genera un QR demasiado denso; 3 partes
 * permiten mostrarlo en secuencia y escanearlo con un móvil.
 */
export function dividirEnPartes(datos: string, n: number = NUM_PARTES_QR): string[] {
  if (n <= 0) return [];
  const tam = Math.ceil(datos.length / n);
  return Array.from(
    { length: n },
    (_, i) => `${PREFIJO_QR}${i + 1}/${n}|${datos.slice(i * tam, (i + 1) * tam)}`,
  );
}

/**
 * Reensambla las partes `MZ3/i/n|` presentes en el texto (una por línea o
 * separadas por espacios). Si no están todas, devuelve el texto recortado:
 * así un QR antiguo de una sola pieza sigue funcionando.
 */
export function reensamblarPartes(texto: string): string {
  const re = /MZ3\/(\d+)\/(\d+)\|([A-Za-z0-9+/=]+)/g;
  const partes = new Map<number, string>();
  let total = 0;
  for (const m of texto.matchAll(re)) {
    partes.set(Number(m[1]), m[3]);
    total = Number(m[2]);
  }
  if (total > 0 && partes.size === total) {
    let out = '';
    for (let i = 1; i <= total; i++) out += partes.get(i) ?? '';
    return out;
  }
  return texto.trim();
}
