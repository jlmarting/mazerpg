
/**
 * Configuración de mapeo de Spritesheets.
 * Este archivo centraliza la relación entre estados lógicos y coordenadas en las hojas de sprites.
 */

import SpriteConfigJSON from '../config/sprites.json';

export interface ISpriteSheetConfig {
    recursos: { [key: string]: string };
    mapeo: {
        [categoria: string]: {
            [clase: string]: {
                [estado: string]: {
                    puntos: { x: number, y: number, w: number, h: number }[];
                    imagen: string;
                }
            }
        }
    }
}

export const SpriteConfig = SpriteConfigJSON as ISpriteSheetConfig;

/**
 * CONTRATO ENTRE JUEGO Y HERRAMIENTA (Schema)
 * Define qué categorías, entidades y acciones espera el motor.
 */
export const GameSpriteContract = {
    categorias: {
        jugadores: {
            clases: ['guerrero', 'explorador', 'mago'],
            acciones: ['idle', 'walking', 'attacking', 'defending', 'fallen']
        },
        npcs: {
            clases: ['esqueleto', 'orco', 'goblin', 'minotauro'],
            acciones: ['idle', 'walking', 'attacking', 'fallen']
        },
        escenario_estatico: {
            clases: ['suelo', 'muro'],
            acciones: ['normal', 'variante1', 'variante2']
        },
        escenario_dinamico: {
            clases: ['puerta', 'trampa'],
            acciones: ['abierta', 'cerrada', 'activa', 'inactiva']
        },
        vfx: {
            clases: ['bola_fuego', 'hielo', 'flecha', 'remolino'],
            acciones: ['play']
        },
        food: {
            clases: ['manzana', 'platano', 'kiwi', 'brocoli', 'pollo', 'chuleta', 'pescado'],
            acciones: ['idle']
        },
        items: {
            clases: ['pickaxe', 'portal'],
            acciones: ['idle']
        }
    }
};

/**
 * Utilidad para generar las claves de los sprites en el SpriteManager
 * basadas en la configuración centralizada (estándar STRUCTOR).
 */
export function inicializarSpritesheets(sm: any) {
    const c = SpriteConfig;

    const procesarMapping = (mapping: any, prefijo: string) => {
        if (!mapping) return;
        for (const [clase, estados] of Object.entries(mapping)) {
            for (const [estado, infoRaw] of Object.entries(estados as any)) {
                const info = infoRaw as any;
                const keyBase = `${prefijo}_${clase}_${estado}`;
                const imagen = info.imagen;

                if (info.puntos && info.puntos.length > 0) {
                    // Mapeo por puntos (Estándar Único)
                    info.puntos.forEach((p: any, i: number) => {
                        sm.definirSprite(`${keyBase}_${i}`, imagen, p.x, p.y, p.w, p.h);
                    });
                    // Registrar también una clave sin índice para el frame 0 como fallback
                    sm.definirSprite(keyBase, imagen, info.puntos[0].x, info.puntos[0].y, info.puntos[0].w, info.puntos[0].h);

                    // Registrar alias simplificado si es el estado por defecto
                    if (estado === 'idle' || estado === 'normal') {
                        const keySimple = prefijo ? `${prefijo}_${clase}` : clase;
                        sm.definirSprite(keySimple, imagen, info.puntos[0].x, info.puntos[0].y, info.puntos[0].w, info.puntos[0].h);
                    }
                }
            }
        }
    };

    // Cargar todos los mapeos definidos en el JSON centralizado
    procesarMapping(c.mapeo.jugadores, 'player');
    procesarMapping(c.mapeo.npcs, 'npc');
    procesarMapping(c.mapeo.escenario_estatico, 'static');
    procesarMapping(c.mapeo.escenario_dinamico, 'dynamic');
    procesarMapping((c.mapeo as any).vfx, 'vfx');
    procesarMapping((c.mapeo as any).food, 'food');
    procesarMapping((c.mapeo as any).items, ''); // Sin prefijo para que coincida con keys como 'pickaxe'
    procesarMapping((c.mapeo as any).compat, ''); // Sin prefijo para retrocompatibilidad
}
