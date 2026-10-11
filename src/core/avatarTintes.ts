import { PALETAS, APARIENCIA_DEFECTO } from '../config/apariencia';

export type ZonaAvatar = 'piel' | 'pelo' | 'torso' | 'piernas';

export interface AparienciaAvatar {
  formato: 1;
  zonas: Record<ZonaAvatar, string>;
}

const ZONAS: ZonaAvatar[] = ['piel', 'pelo', 'torso', 'piernas'];
const HEX_RE = /^#[0-9a-f]{6}$/i;

export function hexARgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function dist2(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * Remapea in-situ los píxeles cercanos a un tono-origen al color destino de su zona,
 * conservando el sombreado (traslada el delta de luminosidad respecto al origen).
 * Transparentes (a === 0) y colores lejanos quedan intactos.
 */
export function aplicarTintes(
  datos: Uint8ClampedArray,
  origen: Record<ZonaAvatar, string[]>,
  destino: Record<ZonaAvatar, string>,
  umbral = 40,
): void {
  const u2 = umbral * umbral;
  const tonos: { zona: ZonaAvatar; rgb: [number, number, number] }[] = [];
  for (const zona of ZONAS) {
    for (const t of origen[zona] ?? []) tonos.push({ zona, rgb: hexARgb(t) });
  }
  if (tonos.length === 0) return;
  const destRgb: Record<ZonaAvatar, [number, number, number]> = {
    piel: hexARgb(destino.piel),
    pelo: hexARgb(destino.pelo),
    torso: hexARgb(destino.torso),
    piernas: hexARgb(destino.piernas),
  };
  for (let i = 0; i < datos.length; i += 4) {
    if (datos[i + 3] === 0) continue;
    const p: [number, number, number] = [datos[i], datos[i + 1], datos[i + 2]];
    let mejor: { zona: ZonaAvatar; rgb: [number, number, number]; d: number } | null = null;
    for (const t of tonos) {
      const d = dist2(p, t.rgb);
      if (d <= u2 && (mejor === null || d < mejor.d)) mejor = { zona: t.zona, rgb: t.rgb, d };
    }
    if (!mejor) continue;
    const dst = destRgb[mejor.zona];
    datos[i] = dst[0] + (p[0] - mejor.rgb[0]);
    datos[i + 1] = dst[1] + (p[1] - mejor.rgb[1]);
    datos[i + 2] = dst[2] + (p[2] - mejor.rgb[2]);
  }
}

function defectoDe(clase: string): AparienciaAvatar {
  const d = APARIENCIA_DEFECTO[clase] ?? APARIENCIA_DEFECTO.guerrero;
  return { formato: 1, zonas: { ...d.zonas } };
}

/** Sanea dato externo (sesión, handshake, Firestore): lo inválido cae al defecto, nunca rompe. */
export function sanearApariencia(a: unknown, clase: string): AparienciaAvatar {
  const def = defectoDe(clase);
  if (typeof a !== 'object' || a === null) return def;
  const obj = a as { formato?: unknown; zonas?: unknown };
  if (obj.formato !== 1 || typeof obj.zonas !== 'object' || obj.zonas === null) return def;
  const z = obj.zonas as Record<string, unknown>;
  const zonas = { ...def.zonas };
  for (const zona of ZONAS) {
    const v = z[zona];
    if (typeof v === 'string' && HEX_RE.test(v)) {
      const paleta = PALETAS[zona].map((c) => c.toLowerCase());
      if (paleta.includes(v.toLowerCase())) zonas[zona] = v.toLowerCase();
    }
  }
  return { formato: 1, zonas };
}

/** Apariencia efectiva para render/red: ausente → defecto de la clase (siempre saneada). */
export function aparienciaEfectiva(clase: string, a?: AparienciaAvatar): AparienciaAvatar {
  if (!a) return defectoDe(clase);
  return sanearApariencia(a, clase);
}

/**
 * Frontera de red: aplica la apariencia que trae un mensaje al estado actual.
 * Ausente → conserva la actual (o defecto); basura → defecto de la clase.
 */
export function aplicarAparienciaRemota(
  actual: AparienciaAvatar | undefined,
  recibida: unknown,
  clase: string,
): AparienciaAvatar {
  if (recibida === undefined) return actual ?? defectoDe(clase);
  return sanearApariencia(recibida, clase);
}

export function claveVariante(clase: string, frame: string, a: AparienciaAvatar): string {
  const z = a.zonas;
  return `${clase}|${frame}|${z.piel},${z.pelo},${z.torso},${z.piernas}`.toLowerCase();
}

/** LRU mínima para la caché del compositor (valores opacos, desalojo al superar el máximo). */
export class LRUCache<T> {
  private readonly mapa = new Map<string, T>();
  constructor(
    private readonly maximo = 64,
    private readonly alDesalojar?: (clave: string) => void,
  ) {}

  get(clave: string): T | undefined {
    const v = this.mapa.get(clave);
    if (v === undefined) return undefined;
    this.mapa.delete(clave);
    this.mapa.set(clave, v);
    return v;
  }

  set(clave: string, valor: T): void {
    if (this.mapa.has(clave)) this.mapa.delete(clave);
    this.mapa.set(clave, valor);
    while (this.mapa.size > this.maximo) {
      const primera = this.mapa.keys().next();
      if (primera.done) break;
      this.mapa.delete(primera.value);
      this.alDesalojar?.(primera.value);
    }
  }
}
