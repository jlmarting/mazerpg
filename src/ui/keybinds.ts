export type IdAccion = 'whirlwind' | 'fireball' | 'freeze' | 'bow' | 'create_food' | 'radar' | 'equipo';

export const ACCIONES_VALIDAS: readonly IdAccion[] = ['whirlwind', 'fireball', 'freeze', 'bow', 'create_food', 'radar', 'equipo'];

export const KEYBINDS_DEFECTO: Record<IdAccion, string> = {
  whirlwind: '1',
  fireball: '2',
  freeze: '3',
  bow: '4',
  create_food: '5',
  radar: '6',
  equipo: 'e',
};

export const TECLAS_RESERVADAS: readonly string[] = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'w',
  'a',
  's',
  'd',
  'Enter',
  'F9',
  'Escape',
];

type MapaTecla = Record<IdAccion, string>;

function teclaValida(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0 && !(TECLAS_RESERVADAS as readonly string[]).includes(valor);
}

export function sanearKeybinds(raw: unknown): MapaTecla {
  const base: MapaTecla = { ...KEYBINDS_DEFECTO };
  if (raw === null || raw === undefined || typeof raw !== 'object') return base;
  const obj = raw as { formato?: unknown; mapa?: unknown };
  if (obj.formato !== 1 || obj.mapa === null || obj.mapa === undefined || typeof obj.mapa !== 'object') return base;
  const mapa = obj.mapa as Record<string, unknown>;
  const limpio: MapaTecla = { ...base };
  for (const accion of ACCIONES_VALIDAS) {
    const tecla = mapa[accion];
    const presente = Object.prototype.hasOwnProperty.call(mapa, accion);
    if (presente && teclaValida(tecla)) {
      limpio[accion] = tecla;
    }
  }
  // conflicto interno: teclas repetidas → la última de recorrido gana a la primera
  const vistas = new Map<string, IdAccion>();
  for (const accion of ACCIONES_VALIDAS) {
    const tecla = limpio[accion];
    const anterior = vistas.get(tecla);
    if (anterior !== undefined) {
      limpio[anterior] = KEYBINDS_DEFECTO[anterior];
    }
    vistas.set(tecla, accion);
  }
  return limpio;
}

export function accionParaTecla(mapa: MapaTecla, tecla: string): IdAccion | null {
  for (const accion of ACCIONES_VALIDAS) {
    if (mapa[accion] === tecla) return accion;
  }
  return null;
}

export function asignarTecla(
  mapa: MapaTecla,
  accion: IdAccion,
  tecla: string,
): { ok: true; mapa: MapaTecla } | { ok: false; motivo: 'reservada' | 'en-uso'; conflicto?: IdAccion } {
  if ((TECLAS_RESERVADAS as readonly string[]).includes(tecla)) {
    return { ok: false, motivo: 'reservada' };
  }
  if (mapa[accion] === tecla) {
    return { ok: true, mapa: { ...mapa } };
  }
  for (const otra of ACCIONES_VALIDAS) {
    if (otra !== accion && mapa[otra] === tecla) {
      return { ok: false, motivo: 'en-uso', conflicto: otra };
    }
  }
  return { ok: true, mapa: { ...mapa, [accion]: tecla } };
}

export function cargarKeybinds(leer: () => string | null): MapaTecla {
  const crudo = leer();
  if (crudo === null || crudo === undefined) return { ...KEYBINDS_DEFECTO };
  let parseado: unknown;
  try {
    parseado = JSON.parse(crudo);
  } catch {
    return { ...KEYBINDS_DEFECTO };
  }
  return sanearKeybinds(parseado);
}

export function guardarKeybinds(mapa: MapaTecla, escribir: (valor: string) => void): void {
  const limpio: MapaTecla = { ...KEYBINDS_DEFECTO };
  for (const accion of ACCIONES_VALIDAS) {
    const tecla = mapa[accion];
    if (typeof tecla === 'string' && tecla.length > 0) {
      limpio[accion] = tecla;
    }
  }
  escribir(JSON.stringify({ formato: 1, mapa: limpio }));
}