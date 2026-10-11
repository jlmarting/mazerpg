import { SpriteManager } from './SpriteManager';
import type { AparienciaAvatar, ZonaAvatar } from './avatarTintes';
import { sanearApariencia, aplicarTintes, claveVariante, LRUCache } from './avatarTintes';
import { ORIGEN_ZONA, APARIENCIA_DEFECTO, UMBRAL_TINTE, LRU_MAX } from '../config/apariencia';

const ZONAS: ZonaAvatar[] = ['piel', 'pelo', 'torso', 'piernas'];

/**
 * Compone variantes tineadas de sprites en runtime (offscreen + caché).
 * Adaptador DOM fino sobre el núcleo puro `avatarTintes`: nada de red ni UI.
 * Nunca lanza: ante cualquier fallo retorna null y el llamador usa la ruta actual.
 */
export class AvatarCompositor {
  private readonly cache: LRUCache<string>;
  /** Bases que ya fallaron (sprite ausente, sin dimensiones, sin contexto): no reintentar ni reloguear. Clave `${clase}|${nombre}` — finita (sprites base × clases). */
  private readonly fallos = new Set<string>();

  constructor(private readonly sm: SpriteManager) {
    this.cache = new LRUCache<string>(LRU_MAX, (clave) => this.sm.eliminarSprite(clave));
  }

  /**
   * Devuelve el nombre registrado de la variante (`tinte:<clave>`) o null
   * (defecto, clase sin zonas mapeadas, o fallo) — el llamador dibuja la ruta actual.
   */
  obtenerVariante(nombreSprite: string, clase: string, apariencia: AparienciaAvatar): string | null {
    const a = sanearApariencia(apariencia, clase);
    const origen = ORIGEN_ZONA[clase] ?? ORIGEN_ZONA.guerrero;
    const mapeadas = ZONAS.filter((z) => (origen[z] ?? []).length > 0);
    if (mapeadas.length === 0) return null;
    const def = APARIENCIA_DEFECTO[clase] ?? APARIENCIA_DEFECTO.guerrero;
    if (mapeadas.every((z) => a.zonas[z] === def.zonas[z])) return null;

    const baseFallida = `${clase}|${nombreSprite}`;
    if (this.fallos.has(baseFallida)) return null;
    const fallar = (msg: string, detalle?: unknown): null => {
      console.warn(`AvatarCompositor: ${msg} (${nombreSprite})`, detalle ?? '');
      this.fallos.add(baseFallida);
      return null;
    };

    const clave = `tinte:${claveVariante(clase, nombreSprite, a)}`;
    const hit = this.cache.get(clave);
    if (hit) return hit;

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
      const img = ctx.getImageData(0, 0, info.sw, info.sh);
      aplicarTintes(img.data, origen, a.zonas, UMBRAL_TINTE);
      ctx.putImageData(img, 0, 0);
      this.sm.definirSpriteCanvas(clave, canvas);
      this.cache.set(clave, clave);
      return clave;
    } catch (e) {
      return fallar('fallo componiendo', e);
    }
  }
}
