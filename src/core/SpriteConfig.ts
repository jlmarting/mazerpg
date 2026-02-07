
/**
 * Configuración de mapeo de Spritesheets.
 * Este archivo centraliza la relación entre estados lógicos y coordenadas en las hojas de sprites.
 */

export interface ISpriteSheetConfig {
    imagen: string;
    dimensiones: { sw: number, sh: number, padding: number };
    mapeo: {
        [categoria: string]: {
            [clase: string]: {
                [estado: string]: {
                    fila?: number; // Para retrocompatibilidad o definición por rejilla
                    frames?: number;
                    puntos?: { x: number, y: number, w: number, h: number }[]; // Definición precisa para STRUCTOR
                }
            }
        }
    }
}

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

export const SpriteConfig: ISpriteSheetConfig = {
    imagen: 'sheet_players', // Obsolescente: STRUCTOR usa mapeo dinámico
    dimensiones: { sw: 32, sh: 32, padding: 0 },
    mapeo: {
        jugadores: {
            guerrero: {
                idle: { fila: 0, frames: 1 },
                walking: { fila: 1, frames: 3 },
                attacking: { fila: 2, frames: 3 },
                defending: { fila: 3, frames: 1 },
                fallen: { fila: 4, frames: 3 }
            },
            explorador: {
                idle: { fila: 5, frames: 1 },
                walking: { fila: 6, frames: 3 },
                attacking: { fila: 7, frames: 3 },
                defending: { fila: 8, frames: 1 },
                fallen: { fila: 9, frames: 3 }
            },
            mago: {
                idle: { fila: 10, frames: 1 },
                walking: { fila: 11, frames: 3 },
                attacking: { fila: 12, frames: 3 },
                defending: { fila: 13, frames: 1 },
                fallen: { fila: 14, frames: 3 }
            }
        },
        npcs: {
            esqueleto: {
                idle: { fila: 15, frames: 1 },
                walking: { fila: 16, frames: 3 },
                attacking: { fila: 17, frames: 3 },
                fallen: { fila: 18, frames: 3 }
            },
            orco: {
                idle: { fila: 19, frames: 1 },
                walking: { fila: 20, frames: 3 },
                attacking: { fila: 21, frames: 3 },
                fallen: { fila: 22, frames: 3 }
            }
        },
        escenario_estatico: {
            muro: {
                normal: { fila: 23, frames: 1 },
                musgo: { fila: 24, frames: 1 }
            },
            suelo: {
                cesped: { fila: 25, frames: 1 },
                piedra: { fila: 26, frames: 1 }
            }
        },
        escenario_dinamico: {
            puerta: {
                cerrada: { fila: 27, frames: 1 },
                abierta: { fila: 28, frames: 1 }
            },
            trampa: {
                inactiva: { fila: 29, frames: 1 },
                activa: { fila: 30, frames: 3 }
            }
        }
    }
};

/**
 * Utilidad para generar las claves de los sprites en el SpriteManager
 * basadas en la configuración centralizada.
 */
export function inicializarSpritesheets(sm: any) {
    const c = SpriteConfig;

    const procesarMapping = (mapping: any, prefijo: string, defaultImagen: string) => {
        for (const [clase, estados] of Object.entries(mapping)) {
            for (const [estado, infoRaw] of Object.entries(estados as any)) {
                const info = infoRaw as any;
                const keyBase = `${prefijo}_${clase}_${estado}`;
                const imagen = info.imagen || defaultImagen;

                if (info.puntos && info.puntos.length > 0) {
                    // Mapeo preciso desde STRUCTOR
                    info.puntos.forEach((p: any, i: number) => {
                        sm.definirSprite(`${keyBase}_${i}`, imagen, p.x, p.y, p.w, p.h);
                    });
                } else if (info.fila !== undefined) {
                    // Mapeo tradicional por rejilla
                    sm.definirAnimacion(keyBase, imagen, info.frames || 1, info.fila, c.dimensiones.sw, c.dimensiones.sh, c.dimensiones.padding);
                }
            }
        }
    };

    procesarMapping(c.mapeo.jugadores, 'player', 'sheet_players');
    procesarMapping(c.mapeo.npcs, 'npc', 'sheet_npcs');
    procesarMapping(c.mapeo.escenario_estatico, 'static', 'sheet_static');
    procesarMapping(c.mapeo.escenario_dinamico, 'dynamic', 'sheet_dynamic');
}
