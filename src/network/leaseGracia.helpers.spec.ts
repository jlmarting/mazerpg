import { aplicarResultadoLease, estadoGraciaLease, FALLOS_LEASE_MAX } from './leaseGracia';

declare const process: { exit(codigo: number): void };

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) throw new Error(`FALLO: ${mensaje}`);
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

let estado = estadoGraciaLease();

const uno = aplicarResultadoLease(estado, 'error');
assert(!uno.degradar && uno.estado.fallos === 1, 'un error transitorio no degrada');
estado = uno.estado;

const dos = aplicarResultadoLease(estado, 'error');
assert(!dos.degradar && dos.estado.fallos === 2, 'dos errores transitorios seguidos no degradan');
estado = dos.estado;

const tres = aplicarResultadoLease(estado, 'error');
assert(tres.degradar, `el error transitorio ${FALLOS_LEASE_MAX} degrada`);
estado = tres.estado;

estado = aplicarResultadoLease(estadoGraciaLease(), 'error').estado;
const recuperado = aplicarResultadoLease(estado, 'ok');
assert(!recuperado.degradar && recuperado.estado.fallos === 0, 'un lease correcto resetea la gracia');

const rechazo = aplicarResultadoLease(estadoGraciaLease(), 'rechazado');
assert(rechazo.degradar, 'un rechazo real degrada de inmediato');

console.log(`\n${ok}/${total} ok`);
process.exit(ok === total ? 0 : 1);
