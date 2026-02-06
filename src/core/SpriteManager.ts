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
            img.onerror = (err) => reject(err);
        });
        this.loadingPromises.push(promise.then(() => {}));
        return promise;
    }

    definirSprite(nombre: string, imagenNombre: string, sx: number, sy: number, sw: number, sh: number) {
        const image = this.images.get(imagenNombre);
        if (!image) {
            console.warn(`Imagen ${imagenNombre} no encontrada para definir sprite ${nombre}`);
            return;
        }
        this.sprites.set(nombre, { image, sx, sy, sw, sh });
    }

    obtenerSprite(nombre: string): SpriteInfo | undefined {
        return this.sprites.get(nombre);
    }

    async esperarCarga(): Promise<void> {
        await Promise.all(this.loadingPromises);
    }

    dibujarSprite(ctx: CanvasRenderingContext2D, nombre: string, x: number, y: number, w: number, h: number) {
        const sprite = this.obtenerSprite(nombre);
        if (sprite) {
            ctx.drawImage(sprite.image, sprite.sx, sprite.sy, sprite.sw, sprite.sh, x, y, w, h);
        } else {
            // Placeholder si no hay sprite
            ctx.fillStyle = '#f0f';
            ctx.fillRect(x, y, w, h);
        }
    }
}
