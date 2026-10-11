import {
  sanearApariencia,
  aparienciaEfectiva,
  aplicarAparienciaRemota,
  aplicarTintes,
  claveVariante,
  LRUCache,
  hexARgb,
} from './avatarTintes';
import { PALETAS, APARIENCIA_DEFECTO } from '../config/apariencia';

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

// aplicarTintes sobre 2x2: origen exacto, transparente, lejano, sombreado cercano
{
  const origen = { piel: [], pelo: ['#4a301a'], torso: [], piernas: [] };
  const destino = { piel: '#ffffff', pelo: '#ff0000', torso: '#ffffff', piernas: '#ffffff' };
  // rgba: [origen exacto, transparente, color lejano, sombreado (+10,+4,+4 del origen)]
  const datos = new Uint8ClampedArray([74, 48, 26, 255, 0, 0, 0, 0, 20, 60, 30, 255, 84, 52, 30, 255]);
  aplicarTintes(datos, origen, destino, 40);
  assert(datos[0] === 255 && datos[1] === 0 && datos[2] === 0 && datos[3] === 255, 'origen exacto se sustituye por destino exacto');
  assert(datos[4] === 0 && datos[5] === 0 && datos[6] === 0 && datos[7] === 0, 'transparente queda intacto');
  assert(datos[8] === 20 && datos[9] === 60 && datos[10] === 30 && datos[11] === 255, 'color lejano queda intacto');
  assert(datos[12] === 255 && datos[13] === 4 && datos[14] === 4 && datos[15] === 255, 'sombreado cercano conserva su delta de luminosidad');
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
  const b = { formato: 1 as const, zonas: { ...a.zonas, pelo: PALETAS.pelo[1] } };
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
  const valida = { formato: 1 as const, zonas: { piel: '#f2c9a0', pelo: PALETAS.pelo[2], torso: PALETAS.torso[2], piernas: PALETAS.piernas[2] } };
  const r1 = aplicarAparienciaRemota(undefined, valida, 'explorador');
  assert(r1.zonas.pelo === PALETAS.pelo[2], 'handshake con apariencia valida se aplica');
  const r2 = aplicarAparienciaRemota(valida, undefined, 'explorador');
  assert(r2.zonas.pelo === valida.zonas.pelo, 'handshake sin apariencia conserva la actual');
  const r2b = aplicarAparienciaRemota(valida, {}, 'explorador');
  assert(r2b.zonas.pelo === APARIENCIA_DEFECTO.explorador.zonas.pelo, 'campo presente pero malformado cae al defecto');
  const r3 = aplicarAparienciaRemota(valida, { formato: 99 }, 'mago');
  assert(r3.zonas.torso === APARIENCIA_DEFECTO.mago.zonas.torso, 'handshake con basura cae al defecto');
}

console.log(`\n${ok}/${total} asserts de avatarTintes en verde`);
