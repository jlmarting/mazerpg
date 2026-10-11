import { PALETAS, APARIENCIA_DEFECTO } from '../config/apariencia';
import PiezasJSON from '../config/piezas.json';

export type ZonaAvatar = 'piel' | 'pelo' | 'torso' | 'piernas';
export type RanuraPieza = 'pelo' | 'torso' | 'piernas' | 'casco';

export interface AparienciaAvatar {
  formato: 1;
  zonas: Record<ZonaAvatar, string>;
  genero: 'm' | 'f';
  piezas: Record<RanuraPieza, string | null>;
}

export interface VariantePieza {
  ranura: string;
  generos: string[];
  tipo: string;
  paleta?: Record<string, string>;
  anclas?: Record<string, { dx: number; dy: number; w: number; h: number }>;
}

export interface TablaPiezas {
  variantes: Record<string, VariantePieza>;
}

const TABLA_PIEZAS = PiezasJSON as unknown as TablaPiezas;

/** Tabla real de piezas (para el compositor y la UI; los tests inyectan la suya). */
export { TABLA_PIEZAS };

function piezasNulas(): Record<RanuraPieza, string | null> {
  return { pelo: null, torso: null, piernas: null, casco: null };
}

/** Sanea el bloque de piezas: variante desconocida, de otro género o de otra ranura → null. */
export function sanearPiezas(p: unknown, tabla: TablaPiezas, genero: 'm' | 'f'): Record<RanuraPieza, string | null> {
  const out = piezasNulas();
  if (typeof p !== 'object' || p === null) return out;
  const obj = p as Record<string, unknown>;
  for (const ranura of RANURAS) {
    const v = obj[ranura];
    if (typeof v !== 'string') continue;
    const meta = tabla.variantes[v];
    if (meta && meta.ranura === ranura && meta.generos.includes(genero)) out[ranura] = v;
  }
  return out;
}

/** Resuelve el ancla de una pieza overlay para un frame (null si no hay: se omite la pieza). */
export function anclaPara(tabla: TablaPiezas, variante: string, frameKey: string): { dx: number; dy: number; w: number; h: number } | null {
  const meta = tabla.variantes[variante];
  if (!meta || meta.tipo !== 'overlay') return null;
  return meta.anclas?.[frameKey] ?? null;
}

const ZONAS: ZonaAvatar[] = ['piel', 'pelo', 'torso', 'piernas'];

/** Ranuras de pieza (orden de UI y de composición). */
export const RANURAS: RanuraPieza[] = ['pelo', 'torso', 'piernas', 'casco'];
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
 * Remapea in-situ los píxeles de una zona: tono cercano a un tono-origen
 * Y dentro de su banda vertical ((y+0.5)/alto en [y0,y1]).
 * Conserva el sombreado (traslada el delta de luminosidad respecto al origen).
 * Transparentes, colores lejanos y píxeles fuera de banda quedan intactos.
 */
export function aplicarTintes(
  datos: Uint8ClampedArray,
  ancho: number,
  alto: number,
  origen: Record<ZonaAvatar, string[]>,
  bandas: Record<ZonaAvatar, [number, number]>,
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
  for (let j = 0; j < alto; j++) {
    const yf = (j + 0.5) / alto;
    for (let i = 0; i < ancho; i++) {
      const k = (j * ancho + i) * 4;
      if (datos[k + 3] === 0) continue;
      const p: [number, number, number] = [datos[k], datos[k + 1], datos[k + 2]];
      let mejor: { zona: ZonaAvatar; rgb: [number, number, number]; d: number } | null = null;
      for (const t of tonos) {
        const [y0, y1] = bandas[t.zona] ?? [0, 1];
        if (yf < y0 || yf > y1) continue;
        const d = dist2(p, t.rgb);
        if (d <= u2 && (mejor === null || d < mejor.d)) mejor = { zona: t.zona, rgb: t.rgb, d };
      }
      if (!mejor) continue;
      const dst = destRgb[mejor.zona];
      datos[k] = dst[0] + (p[0] - mejor.rgb[0]);
      datos[k + 1] = dst[1] + (p[1] - mejor.rgb[1]);
      datos[k + 2] = dst[2] + (p[2] - mejor.rgb[2]);
    }
  }
}

function defectoDe(clase: string): AparienciaAvatar {
  const d = APARIENCIA_DEFECTO[clase] ?? APARIENCIA_DEFECTO.guerrero;
  return { formato: 1, zonas: { ...d.zonas }, genero: 'm', piezas: piezasNulas() };
}

/** Sanea dato externo (sesión, handshake, Firestore): lo inválido cae al defecto, nunca rompe. */
export function sanearApariencia(a: unknown, clase: string): AparienciaAvatar {
  const def = defectoDe(clase);
  if (typeof a !== 'object' || a === null) return def;
  const obj = a as { formato?: unknown; zonas?: unknown; genero?: unknown; piezas?: unknown };
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
  const genero = obj.genero === 'f' ? 'f' : 'm';
  return { formato: 1, zonas, genero, piezas: sanearPiezas(obj.piezas, TABLA_PIEZAS, genero) };
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
  const p = a.piezas;
  return `${clase}|${a.genero}|${frame}|${z.piel},${z.pelo},${z.torso},${z.piernas}|${p.pelo},${p.torso},${p.piernas},${p.casco}`.toLowerCase();
}

/**
 * Cambio de clase: las zonas sin personalizar (iguales al defecto anterior)
 * siguen al defecto nuevo; las personalizadas se conservan (las paletas son
 * compartidas entre clases, así que el color sigue siendo elegible).
 */
export function conservarCoincidencias(
  defectoPrevio: AparienciaAvatar,
  defectoNuevo: AparienciaAvatar,
  elegida: AparienciaAvatar,
): AparienciaAvatar {
  const zonas = { ...elegida.zonas };
  for (const zona of ZONAS) {
    if (elegida.zonas[zona] === defectoPrevio.zonas[zona]) zonas[zona] = defectoNuevo.zonas[zona];
  }
  return { formato: 1, zonas, genero: elegida.genero === 'f' ? 'f' : 'm', piezas: { ...elegida.piezas } };
}

/**
 * Forma del doc partidas/{pid}/jugadores/{jid} (paridad con fichaOk de reglas).
 */
export function fichaJugador(nick: string, clase: string, apariencia: AparienciaAvatar): {
  nick: string;
  clase: string;
  apariencia: AparienciaAvatar;
  actualizado: number;
} {
  return { nick, clase, apariencia: sanearApariencia(apariencia, clase), actualizado: Date.now() };
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
