import { Celda } from '../world/Celda';

export interface GameConfig {
    NUMERO_FILAS: number;
    NUMERO_COLUMNAS: number;
    TAMANO_CELDA: number;
    ALTO_UI_TOP: number;
    ALTO_UI_BOTTOM: number;
    RADIO_VISION: number;
    TIEMPO_DESVANECIMIENTO_NIEBLA: number;
    CELDAS_VISIBLES_X: number;
    CELDAS_VISIBLES_Y: number;
    vistaDebugActivada: boolean;
}

export interface CameraOffset {
    colOffset: number;
    filaOffset: number;
}

export interface DrawingContext {
    ctx: CanvasRenderingContext2D;
    offset: CameraOffset;
    config: GameConfig;
    mapaLaberinto: Celda[][];
}
