import {
  sanearCesta,
  validarDisposicion,
  aplicarIntercambio,
  type EstadoParte,
  type CestaTrade,
  type OfertaTrade,
} from './intercambio';
import { equipoVacio } from './equipo';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) {
    throw new Error(`FALLO: ${mensaje}`);
  }
  ok++;
}

function estadoParte(bulto: string[], inventario: Record<string, number>, fuerza: number): EstadoParte {
  return { equipo: equipoVacio(), bulto, inventario, fuerza };
}

// sanearCesta: basura filtrada
{
  const c = sanearCesta([
    null,
    'texto',
    { id: 'espada_corta' },            // sin cantidad
    { id: 'espada_corta', cantidad: 0 },  // cantidad <= 0
    { id: 'espada_corta', cantidad: -2 },
    { id: 'espada_corta', cantidad: '3' },
    { cantidad: 2 },                   // sin id
    { id: 'desconocido_x', cantidad: 2 }, // item fuera de catálogo
  ]);
  assert(c.length === 0, 'sanearCesta filtra todas las líneas basura');
}

// sanearCesta: no-apilable truncado a 1; apilable conserva entero
{
  const c = sanearCesta([
    { id: 'espada_corta', cantidad: 3 },
    { id: 'casco_hierro', cantidad: 2 },
    { id: 'pocion_vida', cantidad: 2.9 },
  ]);
  assert(c.length === 3, 'tres líneas válidas sobreviven');
  const espada = c.find((l) => l.id === 'espada_corta');
  const casco = c.find((l) => l.id === 'casco_hierro');
  const pocion = c.find((l) => l.id === 'pocion_vida');
  assert(espada?.cantidad === 1, 'espada (no apilable) se trunca a 1');
  assert(casco?.cantidad === 1, 'casco (no apilable) se trunca a 1');
  assert(pocion?.cantidad === 2, 'pocion conservada con cantidad entera (2.9 → 2)');
}

// sanearCesta: dedup por id sumando (tras clamp de no-apilable)
{
  const c = sanearCesta([
    { id: 'pocion_vida', cantidad: 2 },
    { id: 'pocion_vida', cantidad: 3 },
    { id: 'espada_corta', cantidad: 1 },
    { id: 'espada_corta', cantidad: 1 },
    { id: 'espada_corta', cantidad: 1 },
  ]);
  assert(c.length === 2, 'dedup por id deja una línea por item');
  const pocion = c.find((l) => l.id === 'pocion_vida');
  const espada = c.find((l) => l.id === 'espada_corta');
  assert(pocion?.cantidad === 5, 'pila se suma (2+3=5)');
  assert(espada?.cantidad === 1, 'equipo no apilable clamp tras suma (1+1+1→1)');
}

// sanearCesta: entrada no-array o basura total → []
{
  assert(sanearCesta(null).length === 0, 'sanearCesta(null) da vacía');
  assert(sanearCesta('nada').length === 0, 'sanearCesta(string) da vacía');
}

// validarDisposicion: equipo por copias de bulto, consumibles por pila
{
  const cesta: CestaTrade = [
    { id: 'espada_corta', cantidad: 1 },
    { id: 'pocion_vida', cantidad: 3 },
  ];
  assert(validarDisposicion(cesta, ['espada_corta', 'daga'], { pocion_vida: 4 }), 'disposición válida con copias suficientes');
  assert(!validarDisposicion(cesta, ['daga'], { pocion_vida: 4 }), 'sin espada en bulto, disposición inválida');
  assert(!validarDisposicion(cesta, ['espada_corta'], { pocion_vida: 2 }), 'pila de pociones insuficiente');
  assert(validarDisposicion(cesta, ['espada_corta'], { pocion_vida: 3 }), 'exactamente lo pedido basta');
  assert(validarDisposicion([], ['espada_corta'], {}), 'cesta vacía siempre válida');
  assert(!validarDisposicion([{ id: 'mapa', cantidad: 1 }], [], { mapa: 1 }), 'el mapa no se puede ofrecer en trueque');
}

// aplicarIntercambio: caso feliz, entradas intactas
{
  const a: OfertaTrade = { de: 'A', da: [{ id: 'espada_corta', cantidad: 1 }, { id: 'pocion_vida', cantidad: 3 }], pide: [{ id: 'casco_hierro', cantidad: 1 }, { id: 'flecha', cantidad: 5 }] };
  const b: OfertaTrade = { de: 'B', da: [{ id: 'casco_hierro', cantidad: 1 }, { id: 'flecha', cantidad: 5 }], pide: [{ id: 'espada_corta', cantidad: 1 }, { id: 'pocion_vida', cantidad: 3 }] };
  const estadoA = estadoParte(['espada_corta', 'daga'], { pocion_vida: 4 }, 10);
  const estadoB = estadoParte(['casco_hierro'], { flecha: 20 }, 10);
  const r = aplicarIntercambio(a, b, estadoA, estadoB);
  assert(r !== null, 'trueque feliz se aplica');
  if (r) {
    assert(JSON.stringify(r.a.bulto) === '["daga","casco_hierro"]', 'A despide la espada y recibe el casco en el bulto');
    assert(r.a.inventario.pocion_vida === 1 && r.a.inventario.flecha === 5, 'mochila de A: pierde 3 pociones, gana 5 flechas');
    assert(JSON.stringify(r.b.bulto) === '["espada_corta"]', 'B despide el casco y recibe la espada');
    assert(r.b.inventario.flecha === 15 && r.b.inventario.pocion_vida === 3, 'mochila de B: pierde 5 flechas, gana 3 pociones');
  }
  assert(JSON.stringify(estadoA) === JSON.stringify(estadoParte(['espada_corta', 'daga'], { pocion_vida: 4 }, 10)), 'estado A sin mutar');
  assert(JSON.stringify(estadoB) === JSON.stringify(estadoParte(['casco_hierro'], { flecha: 20 }, 10)), 'estado B sin mutar');
}

// aplicarIntercambio: cestas cruzadas que no casan → null
{
  const a: OfertaTrade = { de: 'A', da: [{ id: 'espada_corta', cantidad: 1 }], pide: [{ id: 'casco_hierro', cantidad: 1 }] };
  const b: OfertaTrade = { de: 'B', da: [{ id: 'casco_hierro', cantidad: 1 }], pide: [{ id: 'espada_corta', cantidad: 1 }, { id: 'pocion_vida', cantidad: 1 }] };
  assert(aplicarIntercambio(a, b, estadoParte(['espada_corta'], {}, 10), estadoParte(['casco_hierro'], {}, 10)) === null, 'pide más de lo que se ofrece → null');
}

// aplicarIntercambio: posesión insuficiente al aplicar → null, sin mutar
{
  const a: OfertaTrade = { de: 'A', da: [{ id: 'pocion_vida', cantidad: 3 }], pide: [] };
  const b: OfertaTrade = { de: 'B', da: [], pide: [{ id: 'pocion_vida', cantidad: 3 }] };
  const estadoA = estadoParte([], { pocion_vida: 2 }, 10);
  const estadoB = estadoParte([], {}, 10);
  const r = aplicarIntercambio(a, b, estadoA, estadoB);
  assert(r === null, 'A ya no posee las 3 pociones → null');
  assert(estadoA.inventario.pocion_vida === 2, 'estado A intacto tras fallo');
}

// aplicarIntercambio: capacidad excedida → null
{
  const a: OfertaTrade = { de: 'A', da: [{ id: 'pocion_vida', cantidad: 30 }], pide: [] };
  const b: OfertaTrade = { de: 'B', da: [], pide: [{ id: 'pocion_vida', cantidad: 30 }] };
  // Capacidad de B: 10 + 2*2 = 14 kg; 30 pociones pesan 15 kg
  const r = aplicarIntercambio(a, b, estadoParte([], { pocion_vida: 30 }, 10), estadoParte([], { flecha: 1 }, 2));
  assert(r === null, 'receptor excede su capacidad → null');
}

// aplicarIntercambio: cesta vacía de una parte = donación (si la otra acepta)
{
  const a: OfertaTrade = { de: 'A', da: [{ id: 'pocion_vida', cantidad: 1 }], pide: [] };
  const b: OfertaTrade = { de: 'B', da: [], pide: [{ id: 'pocion_vida', cantidad: 1 }] };
  const r = aplicarIntercambio(a, b, estadoParte([], { pocion_vida: 1 }, 10), estadoParte([], {}, 10));
  assert(r !== null, 'donación unilateral permitida');
  if (r) {
    assert(r.a.inventario.pocion_vida === 0 || r.a.inventario.pocion_vida === undefined, 'A pierde su poción');
    assert(r.b.inventario.pocion_vida === 1, 'B recibe la poción');
  }
}

console.log(`\n${ok}/${total} asserts de intercambio en verde`);