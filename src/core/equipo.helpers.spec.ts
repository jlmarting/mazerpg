import { ITEMS } from '../config/items';
import {
  RANURAS_EQUIPO,
  CAPACIDAD_BASE,
  equipoVacio,
  sanearEquipo,
  sanearInventario,
  equipar,
  desequipar,
  bonosEquipo,
  aplicarBonos,
  pesoTotal,
  excedeCapacidad,
  anadirAlInventario,
  consumir,
  piezasDeEquipo,
  destinoValido,
  capacidadMaxima,
  penalizacionSobrecarga,
} from './equipo';

function assert(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(mensaje);
}

// --- Catálogo: estructura válida y coherente ---
{
  const ids = Object.keys(ITEMS);
  assert(ids.length >= 8, 'el catálogo piloto trae piezas suficientes');
  for (const [id, it] of Object.entries(ITEMS)) {
    assert(it.id === id, `id coherente con la clave (${id})`);
    assert(['equipo', 'consumible', 'material'].includes(it.tipo), `tipo válido (${id})`);
    assert(it.peso >= 0, `peso no negativo (${id})`);
    assert(typeof it.apilable === 'boolean', `apilable definido (${id})`);
    if (it.tipo === 'equipo') assert(!!it.ranura, `equipo con ranura (${id})`);
    else assert(it.ranura === undefined, `no-equipo sin ranura (${id})`);
    if (it.manos === 2) assert(it.ranura === 'mano_derecha', `dos manos vive en mano_derecha (${id})`);
  }
  assert(ITEMS['espada_corta'].ranura === 'mano_derecha', 'espada a una mano');
  assert(ITEMS['arco_largo'].manos === 2, 'arco a dos manos');
  assert(ITEMS['pocion_vida'].tipo === 'consumible', 'poción consumible');
  assert(ITEMS['flecha'].tipo === 'material', 'flecha material');
}

// --- Ranuras ---
{
  assert(RANURAS_EQUIPO.length === 7, 'siete ranuras de equipo');
  for (const r of ['cabeza', 'torso', 'piernas', 'mano_derecha', 'mano_izquierda', 'escudo', 'accesorio'] as const) {
    assert(RANURAS_EQUIPO.includes(r), `ranura ${r} existe`);
  }
  const v = equipoVacio();
  assert(RANURAS_EQUIPO.every((r) => v[r] === null), 'equipo vacío con todas las ranuras a null');
}

// --- Saneado de equipo: desconocido / tipo / ranura cruzada → null ---
{
  const e = sanearEquipo(
    { cabeza: 'casco_hierro', torso: 'no_existe', piernas: 'pocion_vida', mano_derecha: null, escudo: 'escudo_madera' },
    ITEMS,
  );
  assert(e.cabeza === 'casco_hierro', 'pieza válida se conserva');
  assert(e.torso === null, 'id desconocido cae a null');
  assert(e.piernas === null, 'no-equipo en ranura de equipo cae a null');
  assert(e.escudo === 'escudo_madera', 'escudo válido');
  assert(RANURAS_EQUIPO.every((r) => r in e), 'el resultado cubre todas las ranuras');
  const cruz = sanearEquipo({ cabeza: 'espada_corta' }, ITEMS);
  assert(cruz.cabeza === null, 'pieza en ranura equivocada cae a null');
  const dosManosIzq = sanearEquipo({ mano_izquierda: 'arco_largo' }, ITEMS);
  assert(dosManosIzq.mano_izquierda === null, 'arma a dos manos no vale en mano izquierda');
}

// --- Reglas de empuñadura: equipar resuelve conflictos ---
{
  // arma a dos manos desaloja escudo y mano izquierda
  let eq = sanearEquipo({ escudo: 'escudo_madera', mano_izquierda: null }, ITEMS);
  eq = equipar(eq, 'arco_largo', ITEMS);
  assert(eq.mano_derecha === 'arco_largo', 'arco equipado en mano derecha');
  assert(eq.escudo === null, 'arma a dos manos desaloja el escudo');

  // escudo desaloja arma a dos manos
  eq = equipar(eq, 'escudo_madera', ITEMS);
  assert(eq.escudo === 'escudo_madera', 'escudo equipado');
  assert(eq.mano_derecha === null, 'escudo desaloja el arma a dos manos');

  // un arma a una mano convive con escudo
  eq = equipar(eq, 'espada_corta', ITEMS);
  assert(eq.mano_derecha === 'espada_corta' && eq.escudo === 'escudo_madera', 'espada + escudo conviven');

  // equipar no-equipo no cambia nada
  const antes = JSON.stringify(eq);
  eq = equipar(eq, 'pocion_vida', ITEMS);
  eq = equipar(eq, 'no_existe', ITEMS);
  assert(JSON.stringify(eq) === antes, 'no-equipo / desconocido no altera el equipo');

  // desequipar
  eq = desequipar(eq, 'escudo');
  assert(eq.escudo === null && eq.mano_derecha === 'espada_corta', 'desequipar solo toca su ranura');
}

// --- Bonos agregados y aplicación ---
{
  const eq = sanearEquipo(
    { cabeza: 'casco_hierro', torso: 'peto_cuero', piernas: 'botas_veloces', mano_derecha: 'espada_corta', escudo: 'escudo_madera', accesorio: 'anillo_fuerza' },
    ITEMS,
  );
  const b = bonosEquipo(eq, ITEMS);
  assert(b.fuerza === 1 + 2 + 1, `fuerza agregada (${b.fuerza})`);
  assert(b.agilidad === 1 + 2, `agilidad agregada (${b.agilidad})`);
  assert(b.vida === 5, `vida agregada (${b.vida})`);
  assert(b.inteligencia === 0, 'sin bonus de inteligencia = 0 (no undefined)');

  const base = { fuerza: 10, agilidad: 5, inteligencia: 3 };
  const total = aplicarBonos(base, b);
  assert(total.fuerza === 10 + b.fuerza && total.agilidad === 5 + b.agilidad && total.inteligencia === 3, 'bonos sumados sobre la base');
  assert(base.fuerza === 10, 'aplicarBonos no muta la base');
  const sinBonos = aplicarBonos(base, bonosEquipo(equipoVacio(), ITEMS));
  assert(sinBonos.fuerza === 10 && sinBonos.agilidad === 5 && sinBonos.inteligencia === 3, 'sin equipo los stats no cambian');
}

// --- Peso, capacidad e inventario ---
{
  const eq = sanearEquipo({ cabeza: 'casco_hierro', mano_derecha: 'arco_largo' }, ITEMS);
  const inv = anadirAlInventario(anadirAlInventario({}, 'flecha', 10, ITEMS), 'pocion_vida', 2, ITEMS);
  assert(inv.flecha === 10 && inv.pocion_vida === 2, 'materiales y consumibles se apilan');

  const inv2 = anadirAlInventario(inv, 'espada_corta', 1, ITEMS);
  assert(inv2.espada_corta === undefined, 'el equipo no entra en la mochila');
  const inv3 = anadirAlInventario(inv, 'no_existe', 1, ITEMS);
  assert(inv3.no_existe === undefined, 'item desconocido no entra');

  const peso = pesoTotal(eq, inv, ITEMS);
  const esperado = ITEMS.casco_hierro.peso + ITEMS.arco_largo.peso + 10 * ITEMS.flecha.peso + 2 * ITEMS.pocion_vida.peso;
  assert(Math.abs(peso - esperado) < 1e-9, `peso total exacto (${peso} vs ${esperado})`);
  assert(Math.abs(pesoTotal(equipoVacio(), {}, ITEMS)) < 1e-9, 'sin nada, peso 0');

  assert(CAPACIDAD_BASE > 0, 'capacidad base positiva');
  assert(!excedeCapacidad(equipoVacio(), {}, ITEMS), 'vacío no excede');
  const muchaFlecha = anadirAlInventario({}, 'flecha', 1000, ITEMS);
  assert(excedeCapacidad(equipoVacio(), muchaFlecha, ITEMS), '1000 flechas exceden la mochila');

  const san = sanearInventario({ flecha: 3, pocion_vida: 0, basura: 5, espada_corta: 1 }, ITEMS);
  assert(san.flecha === 3, 'material válido se conserva');
  assert(san.pocion_vida === undefined, 'cantidad 0 se descarta');
  assert(san.basura === undefined && san.espada_corta === undefined, 'desconocidos y equipo fuera del inventario');

  const tras = consumir(inv, 'pocion_vida', 2);
  assert(tras.pocion_vida === undefined && tras.flecha === 10, 'consumir agota y borra la pila');
  const tras2 = consumir(inv, 'pocion_vida', 1);
  assert(tras2.pocion_vida === 1, 'consumir parcial descuenta');
  const sinStock = consumir(inv, 'no_existe', 1);
  assert(sinStock.flecha === 10, 'consumir sin stock no altera');
}

// --- Aspecto: el equipo viste al avatar (puente con el compositor de piezas) ---
{
  const eq = sanearEquipo({ cabeza: 'casco_hierro', torso: 'peto_cuero', piernas: 'botas_veloces', mano_derecha: 'espada_corta', escudo: 'escudo_madera' }, ITEMS);
  const p = piezasDeEquipo(eq, ITEMS);
  assert(p.casco === 'casco', 'cabeza → pieza casco');
  assert(p.torso === 'peto', 'torso → pieza peto');
  assert(p.piernas === 'botas', 'piernas → pieza botas');
  assert(p.pelo === null, 'el pelo no es equipo');
  const vacio = piezasDeEquipo(equipoVacio(), ITEMS);
  assert(vacio.casco === null && vacio.torso === null && vacio.piernas === null && vacio.pelo === null, 'sin equipo no hay piezas');
}

// --- Destino válido (drag&drop) ---
{
  assert(destinoValido('casco_hierro', 'cabeza', ITEMS), 'casco → cabeza');
  assert(!destinoValido('casco_hierro', 'torso', ITEMS), 'casco NO → torso');
  assert(destinoValido('arco_largo', 'mano_derecha', ITEMS), 'arco (2 manos) → mano derecha');
  assert(!destinoValido('arco_largo', 'mano_izquierda', ITEMS), 'arco NO → mano izquierda (vive en la derecha)');
  assert(!destinoValido('pocion_vida', 'cabeza', ITEMS), 'consumible NO → ranura de equipo');
  assert(!destinoValido('no_existe', 'cabeza', ITEMS), 'desconocido NO → ranura');
}

// --- Capacidad por fuerza y penalización por sobrecarga ---
{
  assert(capacidadMaxima(10) === 30, 'capacidad = 10 + 2·fuerza');
  assert(capacidadMaxima(0) === 10, 'fuerza 0 → 10');
  const max = capacidadMaxima(10); // 30, mitad 15
  assert(JSON.stringify(penalizacionSobrecarga(0, max)) === '{"ataque":0,"defensa":0,"movimiento":0}', 'sin peso, sin penalización');
  assert(JSON.stringify(penalizacionSobrecarga(15, max)) === '{"ataque":0,"defensa":0,"movimiento":0}', 'justo en la mitad → sin penalización');
  const mid = penalizacionSobrecarga(22.5, max);
  assert(mid.ataque === 2 && mid.defensa === 2 && Math.abs(mid.movimiento - 0.5) < 1e-9, 'mitad de sobrecarga → 2/2/0.5');
  const tope = penalizacionSobrecarga(30, max);
  assert(tope.ataque === 3 && tope.defensa === 3 && tope.movimiento === 1, 'a tope → 3/3/1');
  const exceso = penalizacionSobrecarga(100, max);
  assert(exceso.ataque === 3 && exceso.movimiento === 1, 'por encima del máximo se acota a 3/1');
}

console.log('equipo.helpers: todas las comprobaciones pasan');
