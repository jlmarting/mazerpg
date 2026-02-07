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
                // Por defecto, si cargamos una imagen, definimos un sprite con el mismo nombre que cubra toda la imagen
                this.definirSprite(nombre, nombre, 0, 0, img.width || 32, img.height || 32);
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
        return this.sprites.get(nombre);
    }

    async esperarCarga(): Promise<void> {
        await Promise.all(this.loadingPromises);
    }

    dibujarSprite(ctx: CanvasRenderingContext2D, nombre: string, x: number, y: number, w: number, h: number) {
        let sprite = this.obtenerSprite(nombre);

        // Fallback para animaciones: si no existe el frame específico, buscar el base o el frame 0
        if (!sprite && nombre.match(/_\d+$/)) {
            const lastUnderscore = nombre.lastIndexOf('_');
            const baseNombre = nombre.substring(0, lastUnderscore);
            sprite = this.obtenerSprite(baseNombre) || this.obtenerSprite(`${baseNombre}_0`);
        }

        if (sprite) {
            ctx.drawImage(sprite.image, sprite.sx, sprite.sy, sprite.sw, sprite.sh, x, y, w, h);
        } else {
            // console.warn(`Sprite no encontrado: ${nombre}`);
            // Placeholder magenta
            ctx.fillStyle = '#f0f';
            ctx.fillRect(x, y, w, h);
        }
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
