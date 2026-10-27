type DatosDiag = Record<string, unknown>;

let cacheActivo: boolean | null = null;
const contadores = new Map<string, number>();

/** Activa el diagnóstico con `?diagmp=1`; sin flag no imprime ni acumula nada. */
export function diagMpActivo(search?: string): boolean {
  if (search !== undefined) {
    return new URLSearchParams(search).get('diagmp') === '1';
  }
  if (cacheActivo === null) {
    const actual = typeof window !== 'undefined' ? window.location.search : '';
    cacheActivo = new URLSearchParams(actual).get('diagmp') === '1';
  }
  return cacheActivo;
}

export function diagMp(evento: string, datos?: DatosDiag): void {
  if (!diagMpActivo()) return;
  console.log(`[DIAG-MP] ${evento} ${JSON.stringify(datos ?? {})}`);
}

export function diagMpContar(clave: string, cantidad: number = 1): void {
  if (!diagMpActivo()) return;
  contadores.set(clave, (contadores.get(clave) ?? 0) + cantidad);
}

/** Vuelca y resetea los contadores acumulados desde el último volcado. */
export function diagMpVolcar(etiqueta: string, datos?: DatosDiag): void {
  if (!diagMpActivo()) return;
  const salida: DatosDiag = { ...datos };
  for (const [clave, valor] of contadores) salida[clave] = valor;
  contadores.clear();
  console.log(`[DIAG-MP] ${etiqueta} ${JSON.stringify(salida)}`);
}
