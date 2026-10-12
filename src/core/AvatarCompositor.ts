import { SpriteManager } from './SpriteManager';
import type { AparienciaAvatar, ZonaAvatar, RanuraPieza } from './avatarTintes';
import { sanearApariencia, aplicarTintes, claveVariante, anclaPara, LRUCache } from './avatarTintes';
import { TABLA_PIEZAS } from './avatarTintes';
import { ORIGEN_ZONA, APARIENCIA_DEFECTO, UMBRAL_TINTE, LRU_MAX, bandasPara } from '../config/apariencia';

const ZONAS: ZonaAvatar[] = ['piel', 'pelo', 'torso', 'piernas'];
const RANURAS: RanuraPieza[] = ['pelo', 'torso', 'piernas', 'casco'];

/** `player[_f]_{clase}_{estado}[_N]` → frameKey `clase_genero_estado_idx` (null si no casa). */
export function extraerFrameKey(nombreSprite: string, clase: string, genero: 'm' | 'f'): string | null {
  const m = nombreSprite.match(/^player(?:_f)?_.+?_(idle|walking|attacking|defending|fallen)(?:_(\d+))?$/);
  if (!m) return null;
  return `${clase}_${genero}_${m[1]}_${m[2] ?? '0'}`;
}

/**
 * Compone variantes de avatar en runtime (offscreen + caché).
 * Orden: base tineada (tintes de usuario) → remaps fijos de pieza → overlays.
 * Adaptador DOM fino sobre el núcleo puro `avatarTintes`: nada de red ni UI.
 * Nunca lanza: ante cualquier fallo retorna null y el llamador usa la ruta actual.
 */
export class AvatarCompositor {
  private readonly cache: LRUCache<string>;
  /** Claves que ya fallaron: no reintentar ni reloguear (finitas en la práctica). */
  private readonly fallos = new Set<string>();

  constructor(private readonly sm: SpriteManager) {
    this.cache = new LRUCache<string>(LRU_MAX, (clave) => this.sm.eliminarSprite(clave));
  }

  obtenerVariante(nombreSprite: string, clase: string, estado: string, apariencia: AparienciaAvatar): string | null {
    const a = sanearApariencia(apariencia, clase);
    const origen = ORIGEN_ZONA[clase] ?? ORIGEN_ZONA.guerrero;
    const bandas = bandasPara(estado);
    if (!bandas) return null;
    const def = APARIENCIA_DEFECTO[clase] ?? APARIENCIA_DEFECTO.guerrero;
    const tineada = ZONAS.some((z) => (origen[z] ?? []).length > 0 && a.zonas[z] !== def.zonas[z]);
    const piezas = RANURAS.map((r) => a.piezas[r]).filter((v): v is string => !!v);
    if (!tineada && piezas.length === 0) return null;

    const clave = `tinte:${claveVariante(clase, nombreSprite, a)}`;
    const hit = this.cache.get(clave);
    if (hit) return hit;
    if (this.fallos.has(clave)) return null;
    const fallar = (msg: string, detalle?: unknown): null => {
      console.warn(`AvatarCompositor: ${msg} (${nombreSprite})`, detalle ?? '');
      this.fallos.add(clave);
      return null;
    };

    let info;
    try {
      info = this.sm.obtenerSprite(nombreSprite);
    } catch {
      return fallar('sin acceso al sprite base');
    }
    if (!info || !info.image || !info.sw || !info.sh) {
      return fallar('sin sprite base o sin dimensiones');
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = info.sw;
      canvas.height = info.sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return fallar('sin contexto 2d');
      ctx.drawImage(info.image, info.sx, info.sy, info.sw, info.sh, 0, 0, info.sw, info.sh);

      if (tineada) {
        const img = ctx.getImageData(0, 0, info.sw, info.sh);
        aplicarTintes(img.data, info.sw, info.sh, origen, bandas, a.zonas, UMBRAL_TINTE);
        ctx.putImageData(img, 0, 0);
      }

      const frameKey = extraerFrameKey(nombreSprite, clase, a.genero);
      for (const v of piezas) {
        const meta = TABLA_PIEZAS.variantes[v];
        if (!meta) continue;
        if (meta.tipo === 'remap' && meta.paleta) {
          const zonasPieza = Object.keys(meta.paleta) as ZonaAvatar[];
          const origenPieza = Object.fromEntries(zonasPieza.map((z) => [z, origen[z] ?? []])) as Record<ZonaAvatar, string[]>;
          const destino = { ...a.zonas, ...meta.paleta } as Record<ZonaAvatar, string>;
          const img = ctx.getImageData(0, 0, info.sw, info.sh);
          aplicarTintes(img.data, info.sw, info.sh, origenPieza, bandas, destino, UMBRAL_TINTE);
          ctx.putImageData(img, 0, 0);
        } else if (meta.tipo === 'overlay' && frameKey) {
          const an = anclaPara(TABLA_PIEZAS, v, frameKey);
          const art = this.sm.obtenerSprite(`pieza_${v}_${frameKey}`);
          if (!an || !art || !art.image) {
            console.warn(`AvatarCompositor: overlay sin ancla o arte (${v}, ${frameKey}); pieza omitida`);
            continue;
          }
          ctx.drawImage(art.image, art.sx, art.sy, art.sw, art.sh, an.dx, an.dy, an.w, an.h);
        }
      }

      this.sm.definirSpriteCanvas(clave, canvas);
      this.cache.set(clave, clave);
      return clave;
    } catch (e) {
      return fallar('fallo componiendo', e);
    }
  }
}
