import { Celda } from './Celda';
import { serializarMapa, deserializarMapa } from './serialization';

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

function mapaBasico(filas: number, columnas: number): Celda[][] {
  const mapa: Celda[][] = [];
  for (let f = 0; f < filas; f++) {
    const fila: Celda[] = [];
    for (let c = 0; c < columnas; c++) fila.push(new Celda(f, c));
    mapa.push(fila);
  }
  return mapa;
}

/** 5x5: bordes con muros cerrados, interior transitable con muros variados. */
function mapaCasa(): Celda[][] {
  const mapa = mapaBasico(5, 5);
  for (let f = 1; f < 4; f++) {
    for (let c = 1; c < 4; c++) {
      mapa[f][c].esTransitable = true;
      if (f < 3) mapa[f][c].muros.inferior = false;
      if (c < 3) mapa[f][c].muros.derecho = false;
    }
  }
  return mapa;
}

function decorarCasa(mapa: Celda[][]): void {
  mapa[1][2].sueloDecor = 'madera';
  mapa[2][3].sueloDecor = 'alfombra';
  mapa[1][3].mueble = 'cama';
  mapa[3][1].mueble = 'estante';
  mapa[0][0].tipoEscenario = 'puerta';
  mapa[0][0].estadoEscenario = 'cerrada';
  mapa[4][4].tipoEscenario = 'trampa';
  mapa[4][4].estadoEscenario = 'armada';
}

function estructurasIguales(a: Celda[][], b: Celda[][]): boolean {
  if (a.length !== b.length) return false;
  for (let f = 0; f < a.length; f++) {
    if (a[f].length !== b[f].length) return false;
    for (let c = 0; c < a[f].length; c++) {
      const x = a[f][c];
      const y = b[f][c];
      if (x.esTransitable !== y.esTransitable) return false;
      if (x.muros.superior !== y.muros.superior) return false;
      if (x.muros.derecho !== y.muros.derecho) return false;
      if (x.muros.inferior !== y.muros.inferior) return false;
      if (x.muros.izquierdo !== y.muros.izquierdo) return false;
    }
  }
  return true;
}

/** Nodo 60x60 determinista con decor disperso para el presupuesto. */
function mapaGrande(): Celda[][] {
  const N = 60;
  const mapa = mapaBasico(N, N);
  const suelos: Array<'madera' | 'baldosa' | 'alfombra'> = ['madera', 'baldosa', 'alfombra'];
  for (let f = 0; f < N; f++) {
    for (let c = 0; c < N; c++) {
      const cel = mapa[f][c];
      cel.esTransitable = f > 0 && c > 0 && f < N - 1 && c < N - 1;
      if (cel.esTransitable) {
        if (f < N - 2) cel.muros.inferior = false;
        if (c < N - 2) cel.muros.derecho = false;
      }
      if ((f * 61 + c) % 37 === 0) cel.sueloDecor = suelos[(f + c) % 3];
      if ((f * 67 + c) % 53 === 0) cel.mueble = 'estante';
      if ((f * 71 + c) % 97 === 0) {
        cel.tipoEscenario = 'trampa';
        cel.estadoEscenario = 'armada';
      }
      if ((f * 73 + c) % 101 === 0) {
        cel.tipoEscenario = 'puerta';
        cel.estadoEscenario = 'cerrada';
      }
    }
  }
  return mapa;
}

function main(): void {
  // 1. v1 round trip sin cambios
  const casa = mapaCasa();
  const payloadV1 = serializarMapa(casa);
  const destinoV1: Celda[][] = [];
  const dimsV1 = deserializarMapa(destinoV1, payloadV1);
  assert(dimsV1.filas === 5 && dimsV1.columnas === 5, 'v1 round trip devuelve {filas:5, columnas:5}');
  assert(estructurasIguales(casa, destinoV1), 'v1 round trip conserva muros y transitable');
  assert(payloadV1.indexOf('|') === -1, 'v1 payload no contiene tail (ningún |)');

  // 1b. v1 payload idéntico byte a byte al algoritmo de fase 1
  const mini = mapaBasico(1, 2);
  mini[0][0].esTransitable = true;
  mini[0][0].muros.inferior = false;
  assert(serializarMapa(mini) === '001002rf', 'v1 payload idéntico a fase 1 (001002rf)');

  // 2. v2 round trip: estructura + decor en celdas concretas
  const casaV2 = mapaCasa();
  decorarCasa(casaV2);
  const payloadV2 = serializarMapa(casaV2, { v2: true });
  const destinoV2: Celda[][] = [];
  const dimsV2 = deserializarMapa(destinoV2, payloadV2);
  assert(dimsV2.filas === 5 && dimsV2.columnas === 5, 'v2 round trip devuelve {filas:5, columnas:5}');
  assert(estructurasIguales(casaV2, destinoV2), 'v2 round trip conserva muros y transitable');
  assert(
    destinoV2[1][2].sueloDecor === 'madera' && destinoV2[2][3].sueloDecor === 'alfombra',
    'v2 round trip conserva sueloDecor en celdas concretas',
  );
  assert(
    destinoV2[1][3].mueble === 'cama' && destinoV2[3][1].mueble === 'estante',
    'v2 round trip conserva muebles en celdas concretas',
  );
  assert(
    destinoV2[0][0].tipoEscenario === 'puerta' && destinoV2[0][0].estadoEscenario === 'cerrada' &&
      destinoV2[4][4].tipoEscenario === 'trampa' && destinoV2[4][4].estadoEscenario === 'armada',
    'v2 round trip conserva escenario (tipo + estado) en celdas concretas',
  );
  assert(
    destinoV2[0][1].sueloDecor === null && destinoV2[0][1].mueble === null &&
      destinoV2[0][1].tipoEscenario === 'ninguno',
    'v2 round trip deja por defecto las celdas sin decor',
  );

  // 3. secciones del tail: solo las no vacías, en orden S, D, E
  const numSecciones = (payloadV2.match(/\|/g) || []).length;
  assert(numSecciones === 3, 'v2 payload emite exactamente 3 secciones (|S|D|E)');
  const iS = payloadV2.indexOf('|S');
  const iD = payloadV2.indexOf('|D');
  const iE = payloadV2.indexOf('|E');
  assert(iS !== -1 && iD !== -1 && iE !== -1 && iS < iD && iD < iE, 'v2 ordena las secciones S, D, E');
  assert(payloadV2.includes('|S1,2,madera'), 'v2 sección S usa coordenadas base36 y valor textual');
  assert(payloadV2.includes('|E0,0,puerta,cerrada'), 'v2 sección E emite triple f,c,tipo,estado');

  // 4. v2 sin decor → tail ausente
  const casaLimpia = mapaCasa();
  const payloadV2Limpio = serializarMapa(casaLimpia, { v2: true });
  assert(
    payloadV2Limpio === payloadV1 && payloadV2Limpio.indexOf('|') === -1,
    'v2 sin decor produce exactamente el payload v1 (tail ausente)',
  );

  // 5. receptor-v1: bloque base extraído del payload v2 decodifica limpio
  const base = payloadV2.substring(0, payloadV2.indexOf('|'));
  const destinoReceptor: Celda[][] = [];
  const dimsReceptor = deserializarMapa(destinoReceptor, base);
  assert(dimsReceptor.filas === 5 && dimsReceptor.columnas === 5, 'receptor-v1 extrae {filas:5, columnas:5} del bloque base');
  assert(estructurasIguales(casa, destinoReceptor), 'receptor-v1 decodifica muros/transitable del bloque base');
  assert(
    destinoReceptor[1][2].sueloDecor === null && destinoReceptor[1][3].mueble === null &&
      destinoReceptor[0][0].tipoEscenario === 'ninguno',
    'receptor-v1 no aplica decor (queda en valores por defecto)',
  );
  const destinoCompleto: Celda[][] = [];
  const dimsCompleto = deserializarMapa(destinoCompleto, payloadV2);
  assert(dimsCompleto.filas === 5 && dimsCompleto.columnas === 5, 'payload v2 completo no crashea y devuelve {filas:5, columnas:5}');

  // 6. sección desconocida se salta hasta el próximo |
  const dosDosBase = serializarMapa(mapaBasico(2, 2));
  const destinoX: Celda[][] = [];
  deserializarMapa(destinoX, dosDosBase + '|X1,1,zz|S1,0,madera');
  assert(dimsOk(destinoX, 2, 2), 'sección desconocida |X...| salta sin crash');
  assert(destinoX[1][0].sueloDecor === 'madera', 'la sección válida tras la desconocida se aplica');

  // 6b. sección desconocida al final
  const destinoXCola: Celda[][] = [];
  deserializarMapa(destinoXCola, dosDosBase + '|S0,1,baldosa|Xzz');
  assert(
    dimsOk(destinoXCola, 2, 2) && destinoXCola[0][1].sueloDecor === 'baldosa',
    'sección desconocida al final del tail se salta sin crash',
  );

  // 7. registros fuera de rango o con coordenadas basura se ignoran
  const destinoFuera: Celda[][] = [];
  deserializarMapa(destinoFuera, dosDosBase + '|S9,9,alfombra|Szz,0,madera|D0,1');
  assert(dimsOk(destinoFuera, 2, 2), 'registros fuera de rango / coord basura no crashean');
  assert(
    destinoFuera[0][0].sueloDecor === null && destinoFuera[0][1].sueloDecor === null &&
      destinoFuera[1][0].sueloDecor === null && destinoFuera[1][1].sueloDecor === null,
    'registros fuera de rango / coord basura se ignoran (sin aplicar decor)',
  );

  // 8. presupuesto: decode 60x60 v2 ≤ 5 ms
  const grande = mapaGrande();
  const payloadGrande = serializarMapa(grande, { v2: true });
  // Calentamiento JIT antes de medir; el presupuesto mide el coste del algoritmo
  deserializarMapa([], payloadGrande);
  deserializarMapa([], payloadGrande);
  let dtDecode = Infinity;
  let dimsGrande: { filas: number, columnas: number } = { filas: 0, columnas: 0 };
  for (let intento = 0; intento < 5; intento++) {
    const destino: Celda[][] = [];
    const t0 = performance.now();
    dimsGrande = deserializarMapa(destino, payloadGrande);
    const dt = performance.now() - t0;
    if (dt < dtDecode) dtDecode = dt;
  }
  const destinoGrande: Celda[][] = [];
  deserializarMapa(destinoGrande, payloadGrande);
  assert(dimsGrande.filas === 60 && dimsGrande.columnas === 60 && estructurasIguales(grande, destinoGrande) &&
    destinoGrande[0][1].sueloDecor !== undefined,
    'decode del nodo 60x60 v2 es consistente',
  );
  assert(dtDecode <= 5, `presupuesto: decode 60x60 v2 ≤ 5 ms (medido ${dtDecode.toFixed(3)} ms)`);

  // 9. presupuesto: encode nodo + JSON.stringify snapshot de 40 enemigos ≤ 10 ms
  const enemigos: Array<{ id: string, f: number, c: number, n: string, t: string, v: number, vm: number }> = [];
  for (let i = 0; i < 40; i++) {
    enemigos.push({ id: `enemigo-${i}`, f: i % 60, c: (i * 7) % 60, n: 'goblin', t: 'esqueleto', v: 3 + i, vm: 20 });
  }
  serializarMapa(grande, { v2: true }); // calentamiento JIT
  let dtEncode = Infinity;
  for (let intento = 0; intento < 5; intento++) {
    const t1 = performance.now();
    const payloadGrande2 = serializarMapa(grande, { v2: true });
    const snapshot = JSON.stringify({ tipo: 'enemigos', lista: enemigos });
    const dt = performance.now() - t1;
    if (payloadGrande2 !== payloadGrande || snapshot.length === 0) {
      throw new Error('FALLO: encode del nodo + JSON.stringify del snapshot son consistentes');
    }
    if (dt < dtEncode) dtEncode = dt;
  }
  assert(dtEncode <= 10, `presupuesto: encode nodo + JSON.stringify snapshot 40 enemigos ≤ 10 ms (medido ${dtEncode.toFixed(3)} ms)`);

  console.log(`${ok}/${total} ok`);
}

function dimsOk(mapa: Celda[][], filas: number, columnas: number): boolean {
  return mapa.length === filas && mapa[filas - 1].length === columnas;
}

main();