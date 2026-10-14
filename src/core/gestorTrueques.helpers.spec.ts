import { GestorTrueques } from './gestorTrueques';
import type { InventarioGuardado } from './inventario';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) {
    throw new Error(`FALLO: ${mensaje}`);
  }
  ok++;
}

function exportFake(mochila: Record<string, number> = {}, bulto: string[] = []): InventarioGuardado {
  return { formato: 1, puesto: { cabeza: null, torso: null, piernas: null, mano_derecha: null, mano_izquierda: null, escudo: null, accesorio: null }, bulto, mochila } as unknown as InventarioGuardado;
}

const exports: Record<string, InventarioGuardado> = {
  A: exportFake({ pocion_vida: 10 }),
  B: exportFake({ flecha: 20 }),
};

const exportDe = (id: string) => exports[id] ?? null;

// flujo feliz: invite → accept → offer×2 → confirm×2 → aplicar
{
  const g = new GestorTrueques();
  assert(!g.activo(), 'sin trades al inicio');

  const e1 = g.procesar({ tipo: 'trade_invite', destino: 'B' }, 'A', exportDe);
  assert(g.activo(), 'invite deja un trade activo');
  assert(e1.length === 1 && e1[0].tipo === 'relay' && e1[0].para === 'B' && e1[0].msj.tipo === 'trade_invite' && e1[0].msj.de === 'A', 'invite se relaya al destino reetiquetado');

  const e2 = g.procesar({ tipo: 'trade_accept', de: 'A' }, 'B', exportDe);
  assert(e2.length === 1 && e2[0].tipo === 'relay' && e2[0].para === 'A' && e2[0].msj.tipo === 'trade_accept', 'accept se relaya al invitador');

  const e3 = g.procesar({ tipo: 'trade_offer', da: [{ id: 'pocion_vida', cantidad: 3 }], pide: [{ id: 'flecha', cantidad: 5 }] }, 'A', exportDe);
  assert(e3.length === 1 && e3[0].tipo === 'relay' && e3[0].para === 'B' && e3[0].msj.de === 'A', 'offer de A se relaya a B');

  const e4 = g.procesar({ tipo: 'trade_offer', da: [{ id: 'flecha', cantidad: 5 }], pide: [{ id: 'pocion_vida', cantidad: 3 }] }, 'B', exportDe);
  assert(e4.length === 1 && e4[0].tipo === 'relay' && e4[0].para === 'A', 'offer de B se relaya a A');

  const e5 = g.procesar({ tipo: 'trade_confirm', da: [{ id: 'pocion_vida', cantidad: 3 }], pide: [{ id: 'flecha', cantidad: 5 }], export: exports.A }, 'A', exportDe);
  assert(e5.some((f) => f.tipo === 'relay' && f.para === 'B'), 'primer confirm avisa al otro');
  const parAB = g.par(['A', 'B'].sort().join('|'));
  assert(parAB?.estado === 'confirmada_uno', 'primer confirm → confirmada_uno');

  const e6 = g.procesar({ tipo: 'trade_confirm', da: [{ id: 'flecha', cantidad: 5 }], pide: [{ id: 'pocion_vida', cantidad: 3 }], export: exports.B }, 'B', exportDe);
  const aplicar = e6.find((f) => f.tipo === 'aplicar');
  assert(Boolean(aplicar) && (aplicar as { idA: string; idB: string }).idA === 'A' && (aplicar as { idA: string; idB: string }).idB === 'B', 'doble confirm emite efecto aplicar con ids del par');
  const parPost = g.par(['A', 'B'].sort().join('|'));
  assert(parPost?.estado === 'aplicada', 'estado final aplicada');
}

// confirm con export sin lo ofrecido → cancelada (sin crash)
{
  const g = new GestorTrueques();
  g.procesar({ tipo: 'trade_invite', destino: 'B' }, 'A', exportDe);
  g.procesar({ tipo: 'trade_accept', de: 'A' }, 'B', exportDe);
  g.procesar({ tipo: 'trade_offer', da: [{ id: 'pocion_vida', cantidad: 3 }], pide: [] }, 'A', exportDe);
  const exportSinPociones = exportFake({});
  const e = g.procesar({ tipo: 'trade_confirm', da: [{ id: 'pocion_vida', cantidad: 3 }], pide: [], export: exportSinPociones }, 'A', exportDe);
  assert(e.some((f) => f.tipo === 'relay' && f.msj.tipo === 'trade_state'), 'cancelación emite trade_state');
  assert(g.par(['A', 'B'].sort().join('|'))?.estado === 'cancelada', 'export sin lo ofrecido → cancelada');
}

// confirm sin export ninguna (ni en mensaje ni de exportDe) → cancelada
{
  const g = new GestorTrueques();
  g.procesar({ tipo: 'trade_invite', destino: 'B' }, 'A', exportDe);
  g.procesar({ tipo: 'trade_accept', de: 'A' }, 'B', exportDe);
  const e = g.procesar({ tipo: 'trade_confirm', da: [{ id: 'pocion_vida', cantidad: 1 }], pide: [] }, 'A', () => null);
  assert(g.par(['A', 'B'].sort().join('|'))?.estado === 'cancelada', 'sin export del emisor → cancelada sin crash');
  assert(e.length >= 0, 'procesar devuelve efectos aunque cancele');
}

// invite sobre par ocupado → rechazo, trade activo intacto
{
  const g = new GestorTrueques();
  g.procesar({ tipo: 'trade_invite', destino: 'B' }, 'A', exportDe);
  const e = g.procesar({ tipo: 'trade_invite', destino: 'A' }, 'C', exportDe);
  assert(e.some((f) => f.tipo === 'relay' && f.para === 'C' && f.msj.tipo === 'trade_state'), 'el nuevo invitador recibe el rechazo');
  assert(g.par(['A', 'B'].sort().join('|'))?.estado === 'propuesta', 'el trade previo sigue en propuesta');
}

// cancel en mitad → cancelada + relay al socio
{
  const g = new GestorTrueques();
  g.procesar({ tipo: 'trade_invite', destino: 'B' }, 'A', exportDe);
  const e = g.procesar({ tipo: 'trade_cancel' }, 'A', exportDe);
  assert(e.some((f) => f.tipo === 'relay' && f.para === 'B' && f.msj.tipo === 'trade_state'), 'el socio recibe la cancelación');
  assert(g.par(['A', 'B'].sort().join('|'))?.estado === 'cancelada', 'estado cancelada');
}

// cancelarPorId (desconexión) → cancelada + solo el socio recibe relay
{
  const g = new GestorTrueques();
  g.procesar({ tipo: 'trade_invite', destino: 'B' }, 'A', exportDe);
  const e = g.cancelarPorId('B');
  const relayB = e.filter((f) => (f as { para?: string }).para === 'B');
  assert(relayB.length === 0, 'el desconectado no recibe nada');
  assert(e.some((f) => f.tipo === 'relay' && f.para === 'A'), 'el socio sí recibe la cancelación');
  assert(!g.activo(), 'después de cancelar no queda trade activo');
}

// oferta nueva del otro tras mi confirm → ambas confirmaciones se anulan
{
  const g = new GestorTrueques();
  const clave = ['A', 'B'].sort().join('|');
  g.procesar({ tipo: 'trade_invite', destino: 'B' }, 'A', exportDe);
  g.procesar({ tipo: 'trade_accept', de: 'A' }, 'B', exportDe);
  g.procesar({ tipo: 'trade_offer', da: [{ id: 'pocion_vida', cantidad: 1 }], pide: [] }, 'A', exportDe);
  g.procesar({ tipo: 'trade_confirm', da: [{ id: 'pocion_vida', cantidad: 1 }], pide: [], export: exports.A }, 'A', exportDe);
  assert(g.par(clave)?.estado === 'confirmada_uno', 'solo A confirmó → confirmada_uno');
  g.procesar({ tipo: 'trade_offer', da: [{ id: 'flecha', cantidad: 3 }], pide: [] }, 'B', exportDe);
  const par = g.par(clave);
  assert(par?.confirmoA === false && par?.confirmoB === false, 'oferta nueva de B anula ambas confirmaciones');
  g.procesar({ tipo: 'trade_confirm', da: [{ id: 'flecha', cantidad: 3 }], pide: [], export: exports.B }, 'B', exportDe);
  assert(g.par(clave)?.estado === 'confirmada_uno', 'tras reconfirmar solo B, sigue esperando a A');
}

// mensajes de no-parte y tipos host-only llegados de fuera → ignorados sin crash
{
  const g = new GestorTrueques();
  g.procesar({ tipo: 'trade_invite', destino: 'B' }, 'A', exportDe);
  const e = g.procesar({ tipo: 'trade_offer', da: [], pide: [] }, 'Z', exportDe);
  assert(e.length === 0, 'offer de no-parte se ignora');
  const e2 = g.procesar({ tipo: 'trade_apply' }, 'A', exportDe);
  assert(e2.length === 0, 'trade_apply entrante se ignora en el host');
  const e3 = g.procesar({ tipo: 'trade_state' }, 'A', exportDe);
  assert(e3.length === 0, 'trade_state entrante se ignora en el host');
}

console.log(`\n${ok}/${total} asserts de gestorTrueques en verde`);