import { Celda } from './Celda';
import { serializarMapa, deserializarMapa } from './serialization';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function mapa(): Celda[][] {
  return Array.from({ length: 5 }, (_, f) =>
    Array.from({ length: 5 }, (_, c) => new Celda(f, c)),
  );
}

const origen = mapa();
origen[2][3].esSalida = true;
const payload = serializarMapa(origen, { v2: true });
assert(payload.includes('|X'), 'emite sección X');

const destino = mapa();
destino[0][0].esSalida = true;
deserializarMapa(destino, payload);
assert(destino[2][3].esSalida === true && !destino[0][0].esSalida, 'round-trip y reset');

const viejo = mapa();
deserializarMapa(viejo, serializarMapa(origen));
assert(!viejo.some((f) => f.some((c) => c.esSalida)), 'payload v1 no inventa salida');

const sucio = mapa();
const sinX = serializarMapa(mapa(), { v2: true });
deserializarMapa(sucio, `${sinX}|X9,9`);
assert(!sucio.some((f) => f.some((c) => c.esSalida)), 'coordenada inválida ignorada');

console.log('salidaSerializacion.helpers: todas las comprobaciones pasan');
