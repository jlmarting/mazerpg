import { CoordinadorFirebase, normalizarEstado, type MetadatosPartida } from './coordinadorSala';

declare const process: { exit(codigo: number): void };

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) throw new Error(`FALLO: ${mensaje}`);
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

function clonar<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor));
}

function fusionar(base: any, extra: any): any {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return extra;
  const salida = { ...(base && typeof base === 'object' ? base : {}) };
  for (const [k, v] of Object.entries(extra)) {
    salida[k] = v && typeof v === 'object' && !Array.isArray(v)
      ? fusionar(salida[k], v)
      : v;
  }
  return salida;
}

function escribirRuta(destino: any, ruta: string, valor: any): void {
  const partes = ruta.split('.');
  let actual = destino;
  for (let i = 0; i < partes.length - 1; i++) {
    const clave = partes[i];
    if (!actual[clave] || typeof actual[clave] !== 'object') actual[clave] = {};
    actual = actual[clave];
  }
  actual[partes[partes.length - 1]] = valor;
}

class FakeDoc {
  constructor(private readonly db: FakeDb, private readonly ruta: string) {}
  async get() {
    return {
      exists: this.db.docs.has(this.ruta),
      data: () => (this.db.docs.has(this.ruta) ? clonar(this.db.docs.get(this.ruta)) : undefined),
    };
  }
  async set(datos: any, opciones?: { merge?: boolean }): Promise<void> {
    const actual = this.db.docs.get(this.ruta) ?? {};
    this.db.docs.set(this.ruta, opciones?.merge ? fusionar(actual, datos) : clonar(datos));
  }
  async update(datos: any): Promise<void> {
    const actual = this.db.docs.get(this.ruta) ?? {};
    for (const [ruta, valor] of Object.entries(datos)) escribirRuta(actual, ruta, valor);
    this.db.docs.set(this.ruta, actual);
  }
}

class FakeDb {
  readonly docs: Map<string, any> = new Map();
  collection(nombre: string) {
    return {
      doc: (id: string) => new FakeDoc(this, `${nombre}/${id}`),
    };
  }
  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const tx = {
      get: async (ref: FakeDoc) => ref.get(),
      update: (ref: FakeDoc, datos: any) => ref.update(datos),
    };
    return await fn(tx);
  }
}

async function main(): Promise<void> {
  // 1. Normalización defensiva.
  {
    const estado = normalizarEstado({
      hostId: 'P1',
      hostNick: 'Uno',
      playerId: 'PP1',
      hostEpoch: 3,
      ultimoHb: 500,
      jugadores: {
        P1: { playerId: 'PP1', nick: 'Uno', ultimaVez: 500 },
        P2: null,
        P3: { nick: 'Tres' },
      },
    });
    assert(estado.hostId === 'P1' && estado.hostNick === 'Uno', 'normaliza host');
    assert(estado.hostPlayerId === 'PP1' && estado.hostEpoch === 3, 'normaliza playerId y epoch');
    assert(estado.lastSeen === 500, 'usa ultimoHb como lastSeen si falta lastSeen');
    assert(estado.jugadores.P1.playerId === 'PP1', 'normaliza presencia');
    assert(!estado.jugadores.P2, 'descarta entradas null');
    assert(estado.jugadores.P3.playerId === 'P3' && estado.jugadores.P3.ultimaVez === 0, 'rellena campos ausentes');

    const vacio = normalizarEstado(null);
    assert(vacio.hostId === '' && vacio.hostEpoch === 1 && vacio.lastSeen === 0, 'normaliza datos vacíos');
  }

  // 2. Coordinador Firebase: presencia + CAS + lease.
  {
    const db = new FakeDb();
    db.docs.set('partidas/sala', {
      hostId: 'P1',
      hostNick: 'Uno',
      playerId: 'PP1',
      hostEpoch: 1,
      lastSeen: 1000,
      jugadores: { P1: { playerId: 'PP1', nick: 'Uno', ultimaVez: 1000 } },
    });
    const co = new CoordinadorFirebase(db, 'sala');

    const leido = await co.leerEstado();
    assert(leido?.hostId === 'P1' && leido?.hostEpoch === 1, 'lee el estado inicial');
    assert((await new CoordinadorFirebase(db, 'inexistente').leerEstado()) === null, 'sala inexistente → null');

    await co.registrarJugador('P2', 'PP2', 'Dos');
    const conPresencia = await co.leerEstado();
    assert(conPresencia?.jugadores.P2?.playerId === 'PP2', 'registrarJugador añade presencia');

    const reclamo = await co.reclamarHost('P2', 'Dos', 'PP2', 1);
    assert(reclamo?.ok === true && reclamo?.epoch === 2, 'CAS con epoch vigente gana y avanza epoch');
    const trasReclamo = await co.leerEstado();
    assert(trasReclamo?.hostId === 'P2' && trasReclamo?.hostPlayerId === 'PP2', 'el ganador pasa a ser host');
    assert(trasReclamo?.hostEpoch === 2, 'el epoch queda actualizado');

    const stale = await co.reclamarHost('P3', 'Tres', 'PP3', 1);
    assert(stale?.ok === false && stale?.epoch === 2, 'CAS con epoch viejo pierde y recibe el vigente');
    assert((await co.leerEstado())?.hostId === 'P2', 'el perdedor no cambia el host');

    assert(await co.latirHost('P2', 2) === true, 'lease del host vigente se acepta');
    assert(await co.latirHost('P2', 1) === false, 'lease con epoch viejo se rechaza');
    assert(await co.latirHost('P3', 2) === false, 'lease de otro id se rechaza');

    const meta: MetadatosPartida = {
      inicioPartida: 500,
      dificultad: 'dificil',
      roster: ['PP2'],
      jugadores: { PP2: { nick: 'Dos', oro: 10, xp: 20, bajas: 1 } },
    };
    await co.guardarMetadatos(meta);
    const leida = await co.leerMetadatos();
    assert(leida?.inicioPartida === 500 && leida?.roster?.[0] === 'PP2', 'guardar/leer metadatos');
    assert(leida?.jugadores?.PP2?.oro === 10, 'los metadatos conservan el progreso');

    await co.salirJugador('P2');
    const sinP2 = await co.leerEstado();
    assert(!sinP2?.jugadores.P2, 'salirJugador retira la presencia (null filtrado)');
  }

  console.log(`\n${ok}/${total} ok`);
  process.exit(ok === total ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
