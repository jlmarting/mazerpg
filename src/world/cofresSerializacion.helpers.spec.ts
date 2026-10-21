import { Celda } from './Celda';
import { serializarMapa, deserializarMapa } from './serialization';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function mapa(filas: number, columnas: number): Celda[][] {
  return Array.from({ length: filas }, (_, f) =>
    Array.from({ length: columnas }, (_, c) => new Celda(f, c)),
  );
}

const origen = mapa(5, 5);
origen[1][1].cofre = 'hierro';
origen[2][2].cofre = 'acero';
origen[2][2].cofreAbierto = true;
origen[3][3].llave = 'hierro';

const payload = serializarMapa(origen, { v2: true });
assert(payload.includes('|C'), 'emite sección C');
assert(payload.includes('|K'), 'emite sección K');

const destino = mapa(5, 5);
deserializarMapa(destino, payload);
assert(destino[1][1].cofre === 'hierro' && destino[1][1].cofreAbierto === false, 'cofre cerrado round-trip');
assert(destino[2][2].cofre === 'acero' && destino[2][2].cofreAbierto === true, 'cofre abierto round-trip');
assert(destino[3][3].llave === 'hierro', 'llave round-trip');

const viejo = mapa(5, 5);
deserializarMapa(viejo, serializarMapa(origen));
assert(viejo[1][1].cofre === null && viejo[3][3].llave === null, 'payload v1 no inventa cofres ni llaves');

const sucio = mapa(5, 5);
deserializarMapa(sucio, `${serializarMapa(origen, { v2: true })}|C9,9,plomo,0;1,1,hierro,1`);
assert(sucio[1][1].cofre === 'hierro' && sucio[1][1].cofreAbierto === true, 'tipo inválido ignorado, válido aplicado');

console.log('cofresSerializacion.helpers: todas las comprobaciones pasan');
