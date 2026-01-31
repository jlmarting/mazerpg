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
    dificultad: 'facil' | 'medio' | 'dificil';
    zoom: number;
    targetZoom: number;
    autoZoom: boolean;
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
    puntosExperiencia: number;
    inmunidadHasta: number;
    bubbleChat: { texto: string, expira: number } | null;
    recibirDano(cantidad: number, atacante?: IEntidadRPG | null): number;
    obtenerIniciativa(): number;
    generarAtaque(): number;
    generarDefensa(): number;
    dibujar(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig, mapaLaberinto?: any): void;
    dibujarBarraVida(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig, mapaLaberinto: any[][]): void;
    dibujarBubbleChat(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig): void;
}

export enum ActionType {
    MOVE = 0,
    HIT = 1,
    SPELL = 2,
    CHAT = 3,
    NPC = 4
}

export interface IActionPacket {
    t: number;   // timestamp (uint32)
    p: number;   // player_id (uint16)
    a: ActionType; // action_type (uint8)
    d: any;      // payload: float32[3] / uint16 / string
}

export interface ISnapshot {
    tick: number;
    tr: number; // tickRate actual
    entities: { idN: number, f: number, c: number, v: number, vm: number, cam: boolean }[];
    actions: IActionPacket[];
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
    procesarMensajeMultiplayer(msg: any, idEmisor: string): string;
    iniciarEleccionHost(): void;
    unirseAPartidaFirestore(id: string): Promise<void>;
    obtenerEntidadPorNombre(nombre: string): IEntidadRPG | null;
    encolarAccion(accion: IActionPacket): void;
}
