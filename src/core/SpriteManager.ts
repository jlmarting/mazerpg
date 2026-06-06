export interface SpriteInfo {
    image: HTMLImageElement;
    sx: number;
    sy: number;
    sw: number;
    sh: number;
}

export class SpriteManager {
    private images: Map<string, HTMLImageElement> = new Map();
    private sprites: Map<string, SpriteInfo> = new Map();
    private loadingPromises: Promise<void>[] = [];

    constructor() {}

    async cargarImagen(nombre: string, url: string): Promise<HTMLImageElement> {
        const promise = new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.src = url;
            img.onload = () => {
                this.images.set(nombre, img);
                resolve(img);
            };
            img.onerror = (err) => {
                console.error(`Error cargando imagen ${nombre}. URL inválida o recurso no encontrado.`);
                reject(err);
            };
        });
        this.loadingPromises.push(promise.then(() => {}).catch(() => {}));
        return promise;
    }

    definirSprite(nombre: string, imagenNombre: string, sx: number, sy: number, sw: number, sh: number) {
        const image = this.images.get(imagenNombre);
        if (!image) {
            console.warn(`Imagen ${imagenNombre} no encontrada para definir sprite ${nombre}. Imágenes disponibles: ${Array.from(this.images.keys()).join(', ')}`);
            return;
        }
        this.sprites.set(nombre, { image, sx, sy, sw, sh });
    }

    /**
     * Define múltiples sprites a partir de una cuadrícula (spritesheet).
     */
    definirCuadricula(imagenNombre: string, prefijo: string, columnas: number, filas: number, sw: number, sh: number, padding: number = 0) {
        for (let f = 0; f < filas; f++) {
            for (let c = 0; c < columnas; c++) {
                const nombre = `${prefijo}_${f}_${c}`;
                this.definirSprite(nombre, imagenNombre, c * (sw + padding), f * (sh + padding), sw, sh);
            }
        }
    }

    /**
     * Define una animación a partir de una fila o secuencia en la hoja.
     */
    definirAnimacion(nombreAnim: string, imagenNombre: string, frames: number, fila: number, sw: number, sh: number, padding: number = 0) {
        for (let i = 0; i < frames; i++) {
            this.definirSprite(`${nombreAnim}_${i}`, imagenNombre, i * (sw + padding), fila * (sh + padding), sw, sh);
        }
    }

    obtenerSprite(nombre: string): SpriteInfo | undefined {
        const sprite = this.sprites.get(nombre);
        if (!sprite) return undefined;

        // Validar que el sprite esté dentro de los límites de la imagen
        if (sprite.image) {
            const imgW = sprite.image.naturalWidth || sprite.image.width;
            const imgH = sprite.image.naturalHeight || sprite.image.height;
            if (imgW === 0 || imgH === 0) {
                console.warn(`Sprite ${nombre} referencia imagen sin dimensiones (${imgW}x${imgH}).`);
                return undefined;
            }
            if (sprite.sx < 0 || sprite.sy < 0 ||
                sprite.sx >= imgW ||
                sprite.sy >= imgH ||
                sprite.sx + sprite.sw > imgW ||
                sprite.sy + sprite.sh > imgH) {
                console.warn(`Sprite ${nombre} fuera de límites de la imagen: sx=${sprite.sx}, sy=${sprite.sy}, sw=${sprite.sw}, sh=${sprite.sh} vs img=${imgW}x${imgH}.`);
                return undefined;
            }
        }

        return sprite;
    }

    async esperarCarga(): Promise<void> {
        await Promise.all(this.loadingPromises);
    }

    /**
     * Permite inyectar una imagen ya cargada (útil para herramientas de edición o DataURLs).
     */
    inyectarImagen(nombre: string, img: HTMLImageElement) {
        this.images.set(nombre, img);
    }

    tieneImagen(nombre: string): boolean {
        return this.images.has(nombre);
    }

    dibujarSprite(ctx: CanvasRenderingContext2D, nombre: string, x: number, y: number, w: number, h: number): boolean {
        let sprite = this.obtenerSprite(nombre);

        // Fallback para animaciones: si no existe el frame específico, buscar el base o el frame 0
        if (!sprite && nombre.match(/_\d+$/)) {
            const lastUnderscore = nombre.lastIndexOf('_');
            const baseNombre = nombre.substring(0, lastUnderscore);
            sprite = this.obtenerSprite(baseNombre) || this.obtenerSprite(`${baseNombre}_0`);
        }

        if (sprite && sprite.image) {
            const imgW = sprite.image.naturalWidth || sprite.image.width;
            const imgH = sprite.image.naturalHeight || sprite.image.height;
            const validSX = sprite.sx >= 0 && sprite.sx < imgW;
            const validSY = sprite.sy >= 0 && sprite.sy < imgH;
            const validSW = sprite.sx + sprite.sw <= imgW;
            const validSH = sprite.sy + sprite.sh <= imgH;

            if (validSX && validSY && validSW && validSH) {
                ctx.drawImage(sprite.image, sprite.sx, sprite.sy, sprite.sw, sprite.sh, x, y, w, h);
                return true;
            } else {
                console.warn(`dibujarSprite: sprite ${nombre} tiene coordenadas inválidas para drawImage.`);
            }
        }

        return false;
    }

    /**
     * Cuenta cuántos frames tiene una animación registrada.
     */
    obtenerContadorFrames(nombreBase: string): number {
        let count = 0;
        while (this.sprites.has(`${nombreBase}_${count}`)) {
            count++;
        }
        return count;
    }
}
