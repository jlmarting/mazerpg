import { diagMpActivo } from './diagnosticoMp';

declare const process: { exit(codigo: number): void };

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) throw new Error(`FALLO: ${mensaje}`);
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

assert(diagMpActivo('?diagmp=1'), 'el flag ?diagmp=1 activa el diagnóstico');
assert(diagMpActivo('?foo=bar&diagmp=1'), 'el flag se detecta junto a otros parámetros');
assert(!diagMpActivo(''), 'sin flag el diagnóstico está apagado');
assert(!diagMpActivo('?diagmp=0'), 'diagmp=0 no activa el diagnóstico');
assert(!diagMpActivo('?diagmp'), 'la clave sin valor no activa el diagnóstico');

console.log(`\n${ok}/${total} ok`);
process.exit(ok === total ? 0 : 1);
