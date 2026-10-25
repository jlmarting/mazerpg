import { crearIdConexion, generarIdJugador, obtenerPlayerId } from './identidad';

declare const process: { exit(codigo: number): void };

class AlmacenTest {
  private readonly datos: Map<string, string> = new Map();
  constructor(inicial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(inicial)) this.datos.set(k, v);
  }
  getItem(clave: string): string | null {
    return this.datos.has(clave) ? (this.datos.get(clave) as string) : null;
  }
  setItem(clave: string, valor: string): void {
    this.datos.set(clave, valor);
  }
  removeItem(clave: string): void {
    this.datos.delete(clave);
  }
}

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) throw new Error(`FALLO: ${mensaje}`);
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

function main(): void {
  // 1. Genera un id válido y con prefijo estable.
  {
    const id = generarIdJugador(() => 0.123456789);
    assert(/^P[A-Za-z0-9_-]{6,}$/.test(id), `id generado válido (${id})`);
    assert(id === generarIdJugador(() => 0.123456789), 'el generador determinista produce el mismo id');
    assert(generarIdJugador(() => 0.987654321) !== id, 'dos semillas distintas producen ids distintos');
  }

  // 2. Persiste y reutiliza el playerId.
  {
    const almacen = new AlmacenTest();
    const primero = obtenerPlayerId(almacen, () => 'Ptest1234');
    const segundo = obtenerPlayerId(almacen, () => 'Pdistinto9');
    assert(primero === 'Ptest1234', 'primer playerId generado');
    assert(segundo === primero, 'segunda llamada conserva el playerId persistido');
    assert(almacen.getItem('mazerpg.playerId') === primero, 'el playerId queda persistido');
  }

  // 3. Respeta un playerId existente válido y sanea uno inválido.
  {
    const valido = new AlmacenTest({ 'mazerpg.playerId': 'Pjugador_01' });
    assert(obtenerPlayerId(valido, () => 'Pnuevo') === 'Pjugador_01', 'respeta el playerId existente');

    const invalido = new AlmacenTest({ 'mazerpg.playerId': 'ñ y espacios' });
    const corregido = obtenerPlayerId(invalido, () => 'Pcorregido1');
    assert(corregido === 'Pcorregido1', 'reemplaza un playerId inválido');
    assert(invalido.getItem('mazerpg.playerId') === 'Pcorregido1', 're-guarda el playerId corregido');
  }

  // 4. connId: estable en la misma pestaña, distinto entre pestañas.
  {
    const sesionA = new AlmacenTest();
    const sesionB = new AlmacenTest();
    const a1 = crearIdConexion('Pjugador1', sesionA, () => 0.11);
    const a2 = crearIdConexion('Pjugador1', sesionA, () => 0.77);
    const b1 = crearIdConexion('Pjugador1', sesionB, () => 0.77);
    assert(a1 === a2, 'connId estable en la misma pestaña');
    assert(a1 !== b1, 'connId distinto en pestañas distintas');
    assert(a1.startsWith('Pjugador1-'), 'connId incluye el playerId');
    assert(/^[A-Za-z0-9_-]+$/.test(a1), 'connId usa caracteres seguros para URL/buzón');
    assert(sesionA.getItem('mazerpg.connId') === a1, 'el connId queda persistido en la sesión');
  }

  console.log(`\n${ok}/${total} ok`);
  process.exit(ok === total ? 0 : 1);
}

main();
