/**
 * Cliente de señalización HTTP para WebRTC.
 * Reemplaza a FirebaseManager.ts usando un servidor HTTP propio (FastAPI)
 * en lugar de Firebase Firestore.
 */

export interface SignalingConfig {
  serverUrl: string;
  pollInterval?: number;
}

export interface PartidaInfo {
  id: string;
  hostId: string;
  hostNick: string;
  nombre?: string;
  numJugadores: number;
  creacion: number;
  ultimoHb?: number;
}

export interface SignalPayload {
  type: 'offer' | 'answer' | 'ice';
  data: any;
}

export class SignalingClient {
  private serverUrl: string;
  private pollInterval: number;
  private pollTimer: number | null = null;
  private onSignalCallbacks: ((fromId: string, payload: SignalPayload) => void)[] = [];
  private onPartidasCallbacks: ((partidas: PartidaInfo[]) => void)[] = [];
  private initialized: boolean = false;
  private idPartidaActual: string | null = null;

  constructor(config: SignalingConfig) {
    this.serverUrl = config.serverUrl.replace(/\/$/, '');
    this.pollInterval = config.pollInterval || 1000;
    
    if (!this.serverUrl) {
      console.warn("SignalServer no configurado. El lobby multijugador no funcionará.");
      return;
    }
    
    this.initialized = true;
    console.log(`SignalingClient conectado a: ${this.serverUrl}`);
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getServerUrl(): string {
    return this.serverUrl;
  }

  private async fetchJson(url: string, options?: RequestInit): Promise<any> {
    const response = await fetch(`${this.serverUrl}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }

  async crearPartida(_partidaId: string, hostId: string, hostNick: string, nombre?: string): Promise<{ id: string } | null> {
    if (!this.initialized) return null;
    
    try {
      const result = await this.fetchJson('/partidas', {
        method: 'POST',
        body: JSON.stringify({ hostId, hostNick, nombre }),
      });
      
      this.idPartidaActual = result.id;
      console.log(`Partida creada: ${result.id}`);
      return result;
    } catch (e) {
      console.error("Error creando partida:", e);
      return null;
    }
  }

  async updateHeartbeat(partidaId: string, numJugadores: number): Promise<void> {
    if (!this.initialized || !partidaId) return;
    
    try {
      await this.fetchJson(`/partidas/${partidaId}/hb`, {
        method: 'POST',
        body: JSON.stringify({ numJugadores }),
      });
    } catch (e) {
      console.warn("Error en heartbeat:", e);
    }
  }

  async getPartidasActivas(): Promise<PartidaInfo[]> {
    if (!this.initialized) return [];
    
    try {
      const result = await this.fetchJson('/partidas');
      return result.partidas || [];
    } catch (e) {
      console.error("Error listando partidas:", e);
      return [];
    }
  }

  async registrarGuest(partidaId: string, guestId: string, nick: string): Promise<boolean> {
    if (!this.initialized) return false;
    
    try {
      await this.fetchJson(`/partidas/${partidaId}/guests`, {
        method: 'POST',
        body: JSON.stringify({ guestId, nick }),
      });
      return true;
    } catch (e) {
      console.error("Error registrando guest:", e);
      return false;
    }
  }

  async getGuests(partidaId: string): Promise<{guestId: string, nick: string}[]> {
    if (!this.initialized) return [];
    
    try {
      const result = await this.fetchJson(`/partidas/${partidaId}/guests`);
      return result.guests || [];
    } catch (e) {
      console.error("Error obteniendo guests:", e);
      return [];
    }
  }

  async removeGuest(partidaId: string, guestId: string): Promise<void> {
    if (!this.initialized) return;
    
    try {
      await this.fetchJson(`/partidas/${partidaId}/guests/${guestId}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.warn("Error removiendo guest:", e);
    }
  }

  async enviarSenal(partidaId: string, fromId: string, toId: string, payload: SignalPayload): Promise<boolean> {
    if (!this.initialized) return false;
    
    try {
      await this.fetchJson(`/signal/${partidaId}/${fromId}`, {
        method: 'POST',
        body: JSON.stringify({ toId, payload }),
      });
      return true;
    } catch (e) {
      console.error("Error enviando señal:", e);
      return false;
    }
  }

  onSignal(callback: (fromId: string, payload: SignalPayload) => void): () => void {
    this.onSignalCallbacks.push(callback);
    return () => {
      const idx = this.onSignalCallbacks.indexOf(callback);
      if (idx >= 0) this.onSignalCallbacks.splice(idx, 1);
    };
  }

  onPartidasChange(callback: (partidas: PartidaInfo[]) => void): () => void {
    this.onPartidasCallbacks.push(callback);
    return () => {
      const idx = this.onPartidasCallbacks.indexOf(callback);
      if (idx >= 0) this.onPartidasCallbacks.splice(idx, 1);
    };
  }

  async limpiarSignaling(partidaId: string, guestId: string): Promise<void> {
    if (!this.initialized) return;
    // El servidor limpia automáticamente tras polling, así que esto es un no-op
    // pero mantenemos la interfaz para compatibilidad
    console.log(`Limpiando signaling (no-op para HTTP): partida=${partidaId}, guest=${guestId}`);
  }

  setPartidaActual(partidaId: string | null): void {
    this.idPartidaActual = partidaId;
  }

  setPeerIdLocal(_id: string): void {
  }

  getPartidaActual(): string | null {
    return this.idPartidaActual;
  }

  async pollSenales(peerId: string): Promise<void> {
    if (!this.initialized || !this.idPartidaActual) return;
    
    try {
      const result = await this.fetchJson(`/signal/${this.idPartidaActual}/${peerId}`);
      
      if (result.senales && result.senales.length > 0) {
        for (const senal of result.senales) {
          for (const callback of this.onSignalCallbacks) {
            callback(senal.fromId, { type: senal.type, data: senal.data });
          }
        }
      }
    } catch (e) {
      // Silencioso - el polling puede fallar si no hay partida
    }
  }

  async pollPartidas(): Promise<void> {
    if (!this.initialized) return;
    
    try {
      const partidas = await this.getPartidasActivas();
      for (const callback of this.onPartidasCallbacks) {
        callback(partidas);
      }
    } catch (e) {
      // Silencioso
    }
  }

  iniciarPolling(peerId: string): void {
    this.detenerPolling();
    
    this.pollTimer = window.setInterval(() => {
      this.pollSenales(peerId);
      this.pollPartidas();
    }, this.pollInterval);
    
    console.log(`Polling iniciado (intervalo: ${this.pollInterval}ms)`);
  }

  detenerPolling(): void {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
      console.log("Polling detenido");
    }
  }

  desconectar(): void {
    this.detenerPolling();
    this.initialized = false;
    this.idPartidaActual = null;
    // TODO(jl): clear callback arrays to prevent lingering references
    this.onSignalCallbacks = [];
    this.onPartidasCallbacks = [];
  }
}

export const SIGNALING_CONFIG_KEY = 'SIGNALING_SERVER_URL';
export const SIGNALING_DEFAULT = 'http://localhost:8080';

export function getSignalingUrl(): string {
  // Siempre usar el hostname actual con puerto 8080
  // Esto evita problemas con localhost cacheado
  const url = window.location.protocol + '//' + window.location.hostname + ':8080';
  console.log('Signal Server URL:', url);
  return url;
}

export function crearSignalingClient(url?: string): SignalingClient {
  return new SignalingClient({ serverUrl: url || getSignalingUrl() });
}
