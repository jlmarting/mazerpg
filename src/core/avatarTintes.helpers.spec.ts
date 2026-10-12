import {
  sanearApariencia,
  aparienciaEfectiva,
  aplicarAparienciaRemota,
  fichaJugador,
  sanearPiezas,
  anclaPara,
  aplicarTintes,
  claveVariante,
  LRUCache,
  hexARgb,
  conservarCoincidencias,
} from './avatarTintes';
import { PALETAS, APARIENCIA_DEFECTO, bandasPara } from '../config/apariencia';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) {
    throw new Error(`FALLO: ${mensaje}`);
  }
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

// formato futuro → defecto de la clase
{
  const a = sanearApariencia({ formato: 2, zonas: { piel: '#000000', pelo: '#000000', torso: '#000000', piernas: '#000000' } }, 'explorador');
  assert(a.formato === 1, 'formato desconocido se sanea a formato 1');
  assert(a.zonas.pelo === APARIENCIA_DEFECTO.explorador.zonas.pelo, 'formato desconocido cae al defecto de la clase');
}

// color fuera de paleta → defecto en esa zona
{
  const a = sanearApariencia({ formato: 1, zonas: { piel: '#ffffff', pelo: '#123456', torso: '#ffffff', piernas: '#ffffff' } }, 'mago');
  assert(a.zonas.pelo === APARIENCIA_DEFECTO.mago.zonas.pelo, 'color fuera de paleta cae al defecto de la zona');
}

// aplicarTintes 3x2 con bandas: pelo solo en mitad superior
{
  const origen = { piel: [], pelo: ['#4a301a'], torso: [], piernas: [] };
  const bandas = { piel: [0, 1] as [number, number], pelo: [0, 0.5] as [number, number], torso: [0, 1] as [number, number], piernas: [0, 1] as [number, number] };
  const destino = { piel: '#ffffff', pelo: '#ff0000', torso: '#ffffff', piernas: '#ffffff' };
  // fila0 (yf~0.25, dentro): [origen exacto, sombreado cercano, transparente]
  // fila1 (yf~0.75, fuera):  [origen exacto, color lejano, origen exacto]
  const datos = new Uint8ClampedArray([
    74, 48, 26, 255, 84, 52, 30, 255, 0, 0, 0, 0,
    74, 48, 26, 255, 20, 60, 30, 255, 74, 48, 26, 255,
  ]);
  aplicarTintes(datos, 3, 2, origen, bandas, destino, 40);
  assert(datos[0] === 255 && datos[1] === 0 && datos[2] === 0 && datos[3] === 255, 'origen exacto en banda se sustituye por destino exacto');
  assert(datos[4] === 255 && datos[5] === 4 && datos[6] === 4 && datos[7] === 255, 'sombreado cercano en banda conserva su delta de luminosidad');
  assert(datos[8] === 0 && datos[9] === 0 && datos[10] === 0 && datos[11] === 0, 'transparente queda intacto');
  assert(datos[12] === 74 && datos[13] === 48 && datos[14] === 26 && datos[15] === 255, 'mismo tono FUERA de banda queda intacto');
  assert(datos[16] === 20 && datos[17] === 60 && datos[18] === 30 && datos[19] === 255, 'color lejano queda intacto');
  assert(datos[20] === 74 && datos[21] === 48 && datos[22] === 26 && datos[23] === 255, 'segundo pixel fuera de banda intacto');
}

// LRU desaloja la entrada 65
{
  const cache = new LRUCache<string>(64);
  for (let i = 0; i < 65; i++) cache.set(`k${i}`, `v${i}`);
  assert(cache.get('k0') === undefined, 'la entrada mas vieja se desaloja al superar 64');
  assert(cache.get('k64') === 'v64', 'la mas reciente sobrevive');
}

// aparienciaEfectiva: ausente → defecto; valida → la misma
{
  const d = aparienciaEfectiva('mago', undefined);
  assert(d.zonas.torso === APARIENCIA_DEFECTO.mago.zonas.torso, 'sin apariencia se usa el defecto de la clase');
}

// claveVariante determinista y sensible al cambio
{
  const a = APARIENCIA_DEFECTO.explorador;
  const b = { formato: 1 as const, genero: 'm' as const, piezas: { pelo: null, torso: null, piernas: null, casco: null }, zonas: { ...a.zonas, pelo: PALETAS.pelo[1] } };
  assert(claveVariante('explorador', 'idle', a) === claveVariante('explorador', 'idle', a), 'clave determinista');
  assert(claveVariante('explorador', 'idle', a) !== claveVariante('explorador', 'idle', b), 'la clave cambia con la apariencia');
}

// LRU avisa al desalojar (el compositor borra el sprite desalojado)
{
  const desalojadas: string[] = [];
  const cache = new LRUCache<string>(2, (k) => desalojadas.push(k));
  cache.set('a', '1');
  cache.set('b', '2');
  cache.set('c', '3');
  assert(desalojadas.join(',') === 'a', 'el desalojo notifica la clave expulsada');
}
{
  const [r, g, b] = hexARgb('#4a301a');
  assert(r === 74 && g === 48 && b === 26, 'hexARgb convierte bien');
}

// aplicarAparienciaRemota: frontera de red (handshake / mensaje avatar)
{
  const valida = { formato: 1 as const, genero: 'm' as const, piezas: { pelo: null, torso: null, piernas: null, casco: null }, zonas: { piel: '#f2c9a0', pelo: PALETAS.pelo[2], torso: PALETAS.torso[2], piernas: PALETAS.piernas[2] } };
  const r1 = aplicarAparienciaRemota(undefined, valida, 'explorador');
  assert(r1.zonas.pelo === PALETAS.pelo[2], 'handshake con apariencia valida se aplica');
  const r2 = aplicarAparienciaRemota(valida, undefined, 'explorador');
  assert(r2.zonas.pelo === valida.zonas.pelo, 'handshake sin apariencia conserva la actual');
  const r2b = aplicarAparienciaRemota(valida, {}, 'explorador');
  assert(r2b.zonas.pelo === APARIENCIA_DEFECTO.explorador.zonas.pelo, 'campo presente pero malformado cae al defecto');
  const r3 = aplicarAparienciaRemota(valida, { formato: 99 }, 'mago');
  assert(r3.zonas.torso === APARIENCIA_DEFECTO.mago.zonas.torso, 'handshake con basura cae al defecto');
}

// conservarCoincidencias: cambio de clase respeta lo personalizado
{
  const prev = APARIENCIA_DEFECTO.explorador;
  const next = APARIENCIA_DEFECTO.mago;
  const elegida = { formato: 1 as const, genero: 'm' as const, piezas: { pelo: null, torso: null, piernas: null, casco: null }, zonas: { ...prev.zonas, torso: PALETAS.torso[4] } };
  const r = conservarCoincidencias(prev, next, elegida);
  assert(r.zonas.pelo === next.zonas.pelo, 'zona sin personalizar sigue a la nueva clase');
  assert(r.zonas.torso === PALETAS.torso[4], 'zona personalizada se conserva');
}

// piezas: unisex neutro, variante desconocida/otro género -> null; ausente -> todo null; IDs legado -f migran
{
  const TABLA_MIN = {
    variantes: {
      'pelo-largo': { ranura: 'pelo', generos: ['m', 'f'], tipo: 'remap', anclas: {} },
      'peto': { ranura: 'torso', generos: ['m', 'f'], tipo: 'remap', anclas: {} },
      'tunica-f': { ranura: 'torso', generos: ['f'], tipo: 'remap', anclas: {} },
      'casco': { ranura: 'casco', generos: ['m', 'f'], tipo: 'overlay', anclas: { 'explorador_m_idle_0': { dx: 0, dy: 0, w: 32, h: 32 } } },
    },
  };
  const r = sanearPiezas({ pelo: 'pelo-largo', torso: 'peto', piernas: null, casco: 'casco' }, TABLA_MIN, 'm');
  assert(r.pelo === 'pelo-largo' && r.torso === 'peto', 'variantes unisex se conservan en hombre');
  assert(r.piernas === null && r.casco === 'casco', 'null se respeta y casco unisex vale');
  const r2 = sanearPiezas({ pelo: 'pelo-largo', torso: 'tunica-f', piernas: null, casco: null }, TABLA_MIN, 'm');
  assert(r2.torso === null, 'variante de otro género cae a null');
  const r2f = sanearPiezas({ pelo: 'pelo-largo', torso: 'tunica-f', piernas: null, casco: null }, TABLA_MIN, 'f');
  assert(r2f.torso === 'tunica-f', 'variante f-only vale en mujer');
  const r3 = sanearPiezas(undefined, TABLA_MIN, 'm');
  assert(r3.pelo === null && r3.torso === null && r3.piernas === null && r3.casco === null, 'sin piezas todo null');
  const legado = sanearPiezas({ pelo: 'pelo-largo-f', torso: 'peto-f', piernas: null, casco: null }, TABLA_MIN, 'm');
  assert(legado.pelo === 'pelo-largo', 'ID legado pelo-largo-f migra');
  assert(legado.torso === 'peto', 'ID legado peto-f migra');
  const legadoInutil = sanearPiezas({ pelo: 'pelo-largo-f', torso: null, piernas: null, casco: null }, TABLA_MIN, 'f');
  assert(legadoInutil.pelo === 'pelo-largo', 'legado migra también en mujer');
  assert(anclaPara(TABLA_MIN, 'casco', 'explorador_m_idle_0') !== null, 'ancla existente se resuelve');
  assert(anclaPara(TABLA_MIN, 'casco', 'otro_frame') === null, 'ancla ausente es null');
  assert(anclaPara(TABLA_MIN, 'pelo-largo', 'explorador_m_idle_0') === null, 'remap no tiene ancla');
}
{
  const base = { formato: 1 as const, zonas: { ...APARIENCIA_DEFECTO.mago.zonas } };
  assert(sanearApariencia(base, 'mago').genero === 'm', 'sin genero se asume m');
  assert(sanearApariencia({ ...base, genero: 'x' }, 'mago').genero === 'm', 'genero basura cae a m');
  assert(sanearApariencia({ ...base, genero: 'f' }, 'mago').genero === 'f', 'genero f se conserva');
  assert(APARIENCIA_DEFECTO.mago.genero === 'm', 'el defecto es m');
}
{
  assert(bandasPara('fallen') === null, 'fallen no tiene bandas (defecto)');
  assert(bandasPara('idle') !== null && bandasPara('idle')!.pelo[1] === 0.38, 'idle usa las bandas por defecto');
}
{
  const ap = { ...APARIENCIA_DEFECTO.mago, genero: 'm' as const, piezas: { pelo: null, torso: null, piernas: null, casco: null } };
  const f = fichaJugador('Ciri', 'mago', ap);
  assert(f.nick === 'Ciri' && f.clase === 'mago', 'la ficha conserva nick y clase');
  assert(f.apariencia.zonas.torso === ap.zonas.torso, 'la ficha conserva la apariencia');
  assert(typeof f.actualizado === 'number' && f.actualizado > 0, 'la ficha lleva timestamp');
}

console.log(`\n${ok}/${total} asserts de avatarTintes en verde`);
