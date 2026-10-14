import {
  sanearPreferencia,
  resolverEsquema,
  esAcordeonMovil,
  type PreferenciaUI,
  type EsquemaUI,
} from './esquemaAcciones';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) {
    throw new Error(`FALLO: ${mensaje}`);
  }
  ok++;
}

// sanearPreferencia: 3 casos válidos y basura → auto
{
  const validas: PreferenciaUI[] = ['auto', 'dock', 'acordeon'];
  for (const p of validas) {
    assert(sanearPreferencia(p) === p, `preferencia ${p} se conserva`);
  }
  assert(sanearPreferencia('basura') === 'auto', 'preferencia desconocida cae a auto');
  assert(sanearPreferencia(null) === 'auto', 'preferencia null cae a auto');
  assert(sanearPreferencia(42) === 'auto', 'preferencia no-string cae a auto');
  assert(sanearPreferencia(undefined) === 'auto', 'preferencia undefined cae a auto');
}

// resolverEsquema: explícita gana sobre autodetección
{
  let es: EsquemaUI = resolverEsquema('dock', false, 800);
  assert(es === 'dock', 'preferencia dock explícita gana sin puntero tosco');
  es = resolverEsquema('acordeon', true, 2000);
  assert(es === 'acordeon', 'preferencia acordeon explícita gana con puntero tosco y pantalla ancha');
  es = resolverEsquema('acordeon', false, 800);
  assert(es === 'acordeon', 'preferencia acordeon explícita gana en PC');
}

// resolverEsquema: auto usa autodetección con borde exacto 768
{
  assert(resolverEsquema('auto', true, 768) === 'dock', 'auto+tosco+768 (borde exacto) da dock');
  assert(resolverEsquema('auto', true, 767) === 'acordeon', 'auto+tosco+767 da acordeon');
  assert(resolverEsquema('auto', false, 2000) === 'acordeon', 'auto+no-tosco en pantalla ancha da acordeon');
  assert(resolverEsquema(null, true, 1000) === 'dock', 'preferencia null se trata como auto');
}

// esAcordeonMovil: casos límite
{
  assert(esAcordeonMovil('acordeon', true, 767), 'tosco 767 en acordeon es móvil');
  assert(!esAcordeonMovil('acordeon', true, 768), 'tosco 768 en acordeon no es móvil');
  assert(!esAcordeonMovil('acordeon', false, 500), 'no-tosco en acordeon nunca es móvil');
  assert(!esAcordeonMovil('dock', true, 500), 'dock nunca es móvil');
}

console.log(`\n${ok}/${total} asserts de esquemaAcciones en verde`);