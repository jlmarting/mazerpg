import {
  KEYBINDS_DEFECTO,
  TECLAS_RESERVADAS,
  sanearKeybinds,
  accionParaTecla,
  asignarTecla,
  cargarKeybinds,
  guardarKeybinds,
  type IdAccion,
} from './keybinds';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) {
    throw new Error(`FALLO: ${mensaje}`);
  }
  ok++;
}

const ESPERADAS: Record<IdAccion, string> = { whirlwind: '1', fireball: '2', freeze: '3', bow: '4', create_food: '5', radar: '6', equipo: 'e' };

// defaults completos: 7 acciones con teclas exactas
{
  const acciones: IdAccion[] = ['whirlwind', 'fireball', 'freeze', 'bow', 'create_food', 'radar', 'equipo'];
  for (const accion of acciones) {
    assert(KEYBINDS_DEFECTO[accion] === ESPERADAS[accion], `default de ${accion} es ${ESPERADAS[accion]}`);
  }
}

// teclas reservadas incluye flechas, wasd, Enter, F9, Escape, M (mapamundi)
{
  for (const tecla of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'Enter', 'F9', 'Escape', 'm']) {
    assert(TECLAS_RESERVADAS.includes(tecla), `${tecla} está reservada`);
  }
}

// sanearKeybinds(null/garbage) → defaults
{
  assert(JSON.stringify(sanearKeybinds(null)) === JSON.stringify(KEYBINDS_DEFECTO), 'sanearKeybinds(null) da defaults');
  assert(JSON.stringify(sanearKeybinds('basura')) === JSON.stringify(KEYBINDS_DEFECTO), 'sanearKeybinds(string) da defaults');
  assert(JSON.stringify(sanearKeybinds(42)) === JSON.stringify(KEYBINDS_DEFECTO), 'sanearKeybinds(numero) da defaults');
}

// sanearKeybinds: tecla válida se conserva, acción desconocida ignorada, resto defaults
{
  const r = sanearKeybinds({ formato: 1, mapa: { fireball: '9', batalla: 'x' } });
  assert(r.fireball === '9', 'fireball remapeada a 9 se conserva');
  assert(r.whirlwind === '1' && r.freeze === '3' && r.bow === '4' && r.create_food === '5' && r.radar === '6' && r.equipo === 'e', 'acciones no presentes caen al default');
  assert((r as Record<string, unknown>).batalla === undefined, 'acción desconocida se ignora');
}

// sanearKeybinds: tecla reservada o vacía → default de esa acción
{
  const r = sanearKeybinds({ formato: 1, mapa: { fireball: 'w', whirlwind: '' } });
  assert(r.fireball === '2', 'tecla reservada (w) saneada a default');
  assert(r.whirlwind === '1', 'tecla vacía saneada a default');
  const r2 = sanearKeybinds({ formato: 99, mapa: { fireball: '9' } });
  assert(r2.fireball === '2', 'formato desconocido cae a defaults');
}

// accionParaTecla: mapeada y no mapeada
{
  assert(accionParaTecla(KEYBINDS_DEFECTO, '2') === 'fireball', 'tecla 2 resuelve fireball');
  assert(accionParaTecla(KEYBINDS_DEFECTO, 'e') === 'equipo', 'tecla e resuelve equipo');
  assert(accionParaTecla(KEYBINDS_DEFECTO, 'x') === null, 'tecla sin mapeo da null');
}

// asignarTecla: ok devuelve mapa nuevo sin mutar el original
{
  const original: Record<IdAccion, string> = { ...KEYBINDS_DEFECTO };
  const r = asignarTecla(original, 'fireball', 'z');
  assert(r.ok && r.mapa.fireball === 'z', 'asignación válida devuelve ok con la tecla aplicada');
  assert(original.fireball === '2', 'el mapa original no se muta');
  assert(r.ok && r.mapa.whirlwind === '1', 'el resto de acciones se conserva');
}

// asignarTecla: en-uso con conflicto correcto
{
  const r = asignarTecla(KEYBINDS_DEFECTO, 'fireball', '1');
  assert(!r.ok && r.motivo === 'en-uso' && r.conflicto === 'whirlwind', 'tecla 1 en uso por whirlwind reporta el conflicto');
}

// asignarTecla: reservada
{
  const r = asignarTecla(KEYBINDS_DEFECTO, 'fireball', 'w');
  assert(!r.ok && r.motivo === 'reservada', 'asignar una tecla reservada (wasd) se rechaza');
  const r2 = asignarTecla(KEYBINDS_DEFECTO, 'fireball', 'F9');
  assert(!r2.ok && r2.motivo === 'reservada', 'asignar F9 se rechaza');
  const r3 = asignarTecla(KEYBINDS_DEFECTO, 'fireball', 'ArrowUp');
  assert(!r3.ok && r3.motivo === 'reservada', 'asignar flecha se rechaza');
}

// cargarKeybinds: JSON corrupto → defaults; ausente → defaults
{
  const sucio = JSON.parse(JSON.stringify(KEYBINDS_DEFECTO));
  assert(JSON.stringify(cargarKeybinds(() => 'no es json')) === JSON.stringify(sucio), 'JSON corrupto cae a defaults');
  assert(JSON.stringify(cargarKeybinds(() => null)) === JSON.stringify(sucio), 'valor ausente cae a defaults');
  assert(JSON.stringify(cargarKeybinds(() => '{malformado')) === JSON.stringify(sucio), 'JSON malformado cae a defaults');
}

// roundtrip: guardarKeybinds + cargarKeybinds con fakes
{
  const almacen: { valor: string | null } = { valor: null };
  const mapa = asignarTecla(KEYBINDS_DEFECTO, 'radar', '0');
  if (!mapa.ok) throw new Error('preparación de roundtrip falló');
  guardarKeybinds(mapa.mapa, (valor) => { almacen.valor = valor; });
  assert(almacen.valor !== null && almacen.valor.includes('"formato":1'), 'guardarKeybinds escribe el contrato formato:1');
  const leido = cargarKeybinds(() => almacen.valor);
  assert(leido.radar === '0' && leido.whirlwind === '1', 'roundtrip conserva el remapeo y el resto');
}

console.log(`\n${ok}/${total} asserts de keybinds en verde`);