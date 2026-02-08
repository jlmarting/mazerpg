
/**
 * Configuración de mapeo de Spritesheets.
 * Este archivo centraliza la relación entre estados lógicos y coordenadas en las hojas de sprites.
 */

import SpriteConfigJSON from '../config/sprites.json';

export interface ISpriteSheetConfig {
    recursos: { [key: string]: string };
    dimensiones: { sw: number, sh: number, padding: number };
    mapeo: {
        [categoria: string]: {
            [clase: string]: {
                [estado: string]: {
                    fila?: number;
                    frames?: number;
                    puntos?: { x: number, y: number, w: number, h: number }[];
                    imagen?: string;
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
        items: {
            clases: ['comida', 'pico', 'portal'],
            acciones: ['idle']
        }
    }
};

import { ExternalSpriteMetadata } from './ExternalMetadata';

/**
 * Utilidad para generar las claves de los sprites en el SpriteManager
 * basadas en la configuración centralizada y metadatos externos.
 */
export function inicializarSpritesheets(sm: any) {
    const c = SpriteConfig;

    const procesarMapping = (mapping: any, prefijo: string, defaultImagen: string) => {
        if (!mapping) return;
        for (const [clase, estados] of Object.entries(mapping)) {
            for (const [estado, infoRaw] of Object.entries(estados as any)) {
                const info = infoRaw as any;
                const keyBase = `${prefijo}_${clase}_${estado}`;
                const imagen = info.imagen || defaultImagen;

                if (info.puntos && info.puntos.length > 0) {
                    // Mapeo preciso (Prioritario, ej. desde STRUCTOR)
                    info.puntos.forEach((p: any, i: number) => {
                        sm.definirSprite(`${keyBase}_${i}`, imagen, p.x, p.y, p.w, p.h);
                    });
                    // Registrar también una clave sin índice para el frame 0 como fallback
                    sm.definirSprite(keyBase, imagen, info.puntos[0].x, info.puntos[0].y, info.puntos[0].w, info.puntos[0].h);
                } else if (info.fila !== undefined) {
                    // Mapeo tradicional por rejilla
                    sm.definirAnimacion(keyBase, imagen, info.frames || 1, info.fila, c.dimensiones.sw, c.dimensiones.sh, c.dimensiones.padding);
                }
            }
        }
    };

    // 1. Cargar Mapeos por defecto del Motor
    procesarMapping(c.mapeo.jugadores, 'player', 'sheet_players');
    procesarMapping(c.mapeo.npcs, 'npc', 'sheet_npcs');
    procesarMapping(c.mapeo.escenario_estatico, 'static', 'sheet_static');
    procesarMapping(c.mapeo.escenario_dinamico, 'dynamic', 'sheet_dynamic');

    // 2. Sobrescribir con Metadatos Externos (STRUCTOR)
    if (ExternalSpriteMetadata && ExternalSpriteMetadata.mapeo) {
        const ext = ExternalSpriteMetadata.mapeo;
        procesarMapping(ext.jugadores, 'player', ExternalSpriteMetadata.imagen);
        procesarMapping(ext.npcs, 'npc', ExternalSpriteMetadata.imagen);
        procesarMapping(ext.escenario_estatico, 'static', ExternalSpriteMetadata.imagen);
        procesarMapping(ext.escenario_dinamico, 'dynamic', ExternalSpriteMetadata.imagen);
        procesarMapping(ext.vfx, 'vfx', ExternalSpriteMetadata.imagen);
        procesarMapping(ext.items, 'item', ExternalSpriteMetadata.imagen);
    }
}
