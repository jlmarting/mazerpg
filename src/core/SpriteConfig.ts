
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
                    fila: number;
                    frames: number;
                }
            }
        }
    }
}

export const SpriteConfig: ISpriteSheetConfig = {
    imagen: 'spritesheet_global', // Nombre base de la imagen cargada
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
    // Aquí registraríamos las animaciones basándonos en SpriteConfig
    const c = SpriteConfig;

    // Jugadores
    for (const [clase, estados] of Object.entries(c.mapeo.jugadores)) {
        for (const [estado, info] of Object.entries(estados)) {
            sm.definirAnimacion(`player_${clase}_${estado}`, 'sheet_players', info.frames, info.fila, c.dimensiones.sw, c.dimensiones.sh, c.dimensiones.padding);
        }
    }

    // NPCs
    for (const [clase, estados] of Object.entries(c.mapeo.npcs)) {
        for (const [estado, info] of Object.entries(estados)) {
            sm.definirAnimacion(`npc_${clase}_${estado}`, 'sheet_npcs', info.frames, info.fila, c.dimensiones.sw, c.dimensiones.sh, c.dimensiones.padding);
        }
    }

    // Escenario Estático
    for (const [tipo, variantes] of Object.entries(c.mapeo.escenario_estatico)) {
        for (const [variante, info] of Object.entries(variantes)) {
            sm.definirSprite(`static_${tipo}_${variante}`, 'sheet_static', 0, info.fila * c.dimensiones.sh, c.dimensiones.sw, c.dimensiones.sh);
        }
    }

    // Escenario Dinámico
    for (const [tipo, estados] of Object.entries(c.mapeo.escenario_dinamico)) {
        for (const [estado, info] of Object.entries(estados)) {
            sm.definirAnimacion(`dynamic_${tipo}_${estado}`, 'sheet_dynamic', info.frames, info.fila, c.dimensiones.sw, c.dimensiones.sh, c.dimensiones.padding);
        }
    }
}
