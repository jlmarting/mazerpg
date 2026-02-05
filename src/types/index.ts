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
    dificultad: 'facil' | 'medio' | 'dificil' | 'locura';
    zoom: number;
    targetZoom: number;
    autoZoom: boolean;
    tickRate: number;
    esHogar?: boolean;
}

export interface CameraOffset {
    colOffset: number;
    filaOffset: number;
}

export interface IEntidadRPG {
    id: any;
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
    fuerza: number;
    agilidad: number;
    inteligencia: number;
    clase?: string;
    color?: string;
    ultimaVezHabilidad?: { fireball: number, bow: number, food: number, radar: number, whirlwind: number, freeze: number };
    consecutiveInteractions?: Map<string, number>;
    tienePico?: boolean;
    ultimaCasillaAtacada?: {f: number, c: number} | null;
    pasosDesdeUltimoDano?: number;
    personajeCreado?: boolean;
    huyendoHasta?: number;
    inmovilizadoHasta?: number;
    recibirDano(cantidad: number, atacante?: IEntidadRPG | null): number;
    obtenerIniciativa(): number;
    generarAtaque(): number;
    generarDefensa(): number;
    actualizarIA?(game: IGame): void;
    dibujar(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig, mapaLaberinto?: any): void;
    dibujarBarraVida(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig, mapaLaberinto: any[][]): void;
    dibujarBubbleChat(ctx: CanvasRenderingContext2D, offset: CameraOffset, config: GameConfig): void;
}

export interface IGame {
    mapaLaberinto: Celda[][];
    mapaHogar: Celda[][] | null;
    posicionLaberinto: { f: number, c: number } | null;
    posicionHogar: { f: number, c: number } | null;
    estaEnHogar: boolean;
    config: GameConfig;
    protagonista: IEntidadRPG;
    listaDeEnemigos: IEntidadRPG[];
    jugadoresRemotos: Map<string, any>;
    esHost: boolean;
    juegoTerminado: boolean;
    colaAcciones: any[];
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
    resolverAccion(id: string, accion: any): void;
}
