export type Dispositivo = 'movil' | 'tablet' | 'pc';

export interface RadiosInteres {
  radioSim: number;
  radioVis: number;
}

export interface EstadoInteres extends RadiosInteres {
  dispositivo: Dispositivo;
  fps: number;
  jugadores: number;
}

export interface MetricasInteres {
  dispositivo: Dispositivo;
  clase: string;
  jugadores: number;
  fps: number;
  fpsBajoMs: number;
  fpsAltoMs: number;
  anterior: RadiosInteres | null;
}

/** Radio fijo con el que el host procesa acciones de jugadores remotos. */
export const RADIO_SIM_AUTORIDAD = 3;

const BASE_VIS = 3;
const MIN_SIM = 1;
const MIN_VIS = 2;

const CAPS: Record<Dispositivo, { sim: number; vis: number; baseSim: number }> = {
  movil: { sim: 2, vis: 3, baseSim: 1 },
  tablet: { sim: 2, vis: 4, baseSim: 2 },
  pc: { sim: 3, vis: 5, baseSim: 2 },
};

function clamp(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(maximo, valor));
}

function sanearAnterior(
  anterior: RadiosInteres | null,
  caps: { sim: number; vis: number },
): RadiosInteres | null {
  if (!anterior) return null;
  if (!Number.isFinite(anterior.radioSim) || !Number.isFinite(anterior.radioVis)) return null;
  const radioVis = clamp(Math.round(anterior.radioVis), MIN_VIS, caps.vis);
  const radioSim = clamp(Math.round(anterior.radioSim), MIN_SIM, Math.min(radioVis, caps.sim));
  return { radioSim, radioVis };
}

/**
 * Calcula los radios adaptativos de la burbuja. Es puro: no muta nada y la
 * histéresis (un paso por ventana) la marcan `fpsBajoMs`/`fpsAltoMs`, que el
 * llamador acumula y resetea cuando aplica un cambio.
 *
 * Orden: base por dispositivo/clase → caps por jugadores → un paso por FPS →
 * saneo e invariante `1 <= radioSim <= radioVis <= cap`.
 */
export function calcularRadiosInteres(metricas: MetricasInteres): RadiosInteres {
  const caps = CAPS[metricas.dispositivo] ?? CAPS.pc;
  const baseVis = Math.min(caps.vis, BASE_VIS + (metricas.clase === 'explorador' ? 1 : 0));
  const previo = sanearAnterior(metricas.anterior, caps);

  let radioVis = previo?.radioVis ?? baseVis;
  let radioSim = previo?.radioSim ?? Math.min(caps.sim, caps.baseSim, radioVis);

  const simCapJugadores = metricas.jugadores >= 5 ? 1 : metricas.jugadores >= 3 ? 2 : caps.sim;

  if (metricas.fpsBajoMs >= 2000) {
    if (radioSim > MIN_SIM) {
      radioSim -= 1;
    } else if (radioVis > MIN_VIS) {
      radioVis -= 1;
    }
  } else if (metricas.fpsAltoMs >= 5000) {
    // Crece sim hasta su cap o hasta vis; si ya no cabe, crece vis. Así el
    // invariante sim <= vis se mantiene en todo momento.
    if (radioSim < Math.min(caps.sim, simCapJugadores) && radioSim < radioVis) {
      radioSim += 1;
    } else if (radioVis < caps.vis) {
      radioVis += 1;
    }
  }

  radioVis = clamp(radioVis, MIN_VIS, caps.vis);
  radioSim = clamp(radioSim, MIN_SIM, Math.min(radioVis, caps.sim, simCapJugadores));
  return { radioSim, radioVis };
}
