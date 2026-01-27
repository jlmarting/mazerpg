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

export interface IEntidadRPG {
    fila: number;
    columna: number;
    nombre: string;
    vidaActual: number;
    vidaMaxima: number;
    estaVivo: boolean;
    estaCaminando: boolean;
    enCombateCon: IEntidadRPG | null;
    bubbleChat: { texto: string, expira: number } | null;
    recibirDano(cantidad: number, atacante?: IEntidadRPG | null): number;
    obtenerIniciativa(): number;
    generarAtaque(): number;
    generarDefensa(): number;
    dibujar(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig, mapaLaberinto?: any): void;
    dibujarBarraVida(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig, mapaLaberinto: any[][]): void;
    dibujarBubbleChat(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig): void;
}

export interface IGame {
    mapaLaberinto: Celda[][];
    config: GameConfig;
    protagonista: IEntidadRPG;
    listaDeEnemigos: IEntidadRPG[];
    jugadoresRemotos: Map<string, any>;
    esHost: boolean;
    juegoTerminado: boolean;
    firebase: any;
    network: any;
    ui: any;
    renderer: any;
    registrarEventoLog(mensaje: string): void;
    resolverRondaDeCombate(pA: IEntidadRPG, pB: IEntidadRPG): void;
    iniciarCombate(atacante: IEntidadRPG, objetivo: IEntidadRPG): void;
    intentarRehuirCombate(l: IEntidadRPG): boolean;
    procesarMensajeMultiplayer(msg: any, idEmisor: string): void;
    iniciarEleccionHost(): void;
    unirseAPartidaFirestore(id: string): Promise<void>;
    obtenerEntidadPorNombre(nombre: string): IEntidadRPG | null;
}
