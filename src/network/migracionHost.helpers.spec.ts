import {
  LEASE_HOST_MS,
  PRESENCIA_JUGADOR_MS,
  elegirCandidato,
  hostVivo,
  jugadoresPresentes,
  resolverHost,
  type EstadoSala,
} from './migracionHost';

declare const process: { exit(codigo: number): void };

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) throw new Error(`FALLO: ${mensaje}`);
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

function sala(parcial: Partial<EstadoSala> = {}): EstadoSala {
  return {
    hostId: 'P1',
    hostNick: 'Anfitrión',
    hostPlayerId: 'P1',
    hostEpoch: 1,
    lastSeen: 1000,
    jugadores: {
      P1: { playerId: 'P1', nick: 'Anfitrión', ultimaVez: 1000 },
      P2: { playerId: 'P2', nick: 'Invitado A', ultimaVez: 1000 },
      P3: { playerId: 'P3', nick: 'Invitado B', ultimaVez: 1000 },
    },
    ...parcial,
  };
}

function main(): void {
  // 1. Lease del host.
  {
    assert(hostVivo(sala(), 1000 + LEASE_HOST_MS), 'host vivo justo en el límite del lease');
    assert(!hostVivo(sala(), 1000 + LEASE_HOST_MS + 1), 'host caído pasados el lease');
    assert(!hostVivo(sala({ hostId: '' }), 1000), 'hostId vacío = host caído');
    assert(!hostVivo(sala({ hostId: 'L_placeholder' }), 1000), 'hostId placeholder = host caído');
    assert(!hostVivo(null, 1000), 'sala inexistente = host caído');
  }

  // 2. Presencia.
  {
    const ahora = 1000 + PRESENCIA_JUGADOR_MS;
    const presentes = jugadoresPresentes(sala(), ahora).sort();
    assert(presentes.join(',') === 'P1,P2,P3', 'incluye a todos los presentes en el límite');
    const viejos = jugadoresPresentes(sala({
      jugadores: {
        P1: { playerId: 'P1', nick: 'Anfitrión', ultimaVez: 1000 },
        P2: { playerId: 'P2', nick: 'Invitado A', ultimaVez: 1000 },
        P3: { playerId: 'P3', nick: 'Invitado B', ultimaVez: 0 },
      },
    }), ahora);
    assert(viejos.sort().join(',') === 'P1,P2', 'excluye a los que superan la presencia');
    assert(jugadoresPresentes(null, ahora).length === 0, 'sala null no tiene presentes');
  }

  // 3. Candidato: menor id presente, sin el host caído.
  {
    const ahora = LEASE_HOST_MS + 1;
    const presentes = {
      P1: { playerId: 'P1', nick: 'Anfitrión', ultimaVez: ahora },
      P2: { playerId: 'P2', nick: 'Invitado A', ultimaVez: ahora },
      P3: { playerId: 'P3', nick: 'Invitado B', ultimaVez: ahora },
    };
    const estado = sala({ lastSeen: 0, jugadores: presentes });
    assert(elegirCandidato(estado, ahora) === 'P2', 'candidato = menor id presente excluyendo al host muerto');
    const sinP2 = sala({
      lastSeen: 0,
      jugadores: {
        P1: { playerId: 'P1', nick: 'Anfitrión', ultimaVez: ahora },
        P3: { playerId: 'P3', nick: 'Invitado B', ultimaVez: ahora },
      },
    });
    assert(elegirCandidato(sinP2, ahora) === 'P3', 'candidato cambia si el menor no está');
    assert(elegirCandidato(sala({ lastSeen: 0, jugadores: {} }), ahora) === null, 'sin presentes no hay candidato');
    assert(elegirCandidato(null, ahora) === null, 'sala null no tiene candidato');
  }

  // 4. Decisión del cliente.
  {
    const ahora = 1000;
    const vivo = sala();
    assert(resolverHost(vivo, 'P2', ahora).accion === 'reconectar', 'host vivo y no soy yo → reconectar');
    assert(resolverHost(vivo, 'P1', ahora).accion === 'ninguna', 'host vivo y soy yo → ninguna');
    assert(resolverHost(vivo, 'P2', ahora).hostId === 'P1', 'reconectar apunta al host vigente');

    const ahoraCaido = LEASE_HOST_MS + 1;
    const presentes = {
      P1: { playerId: 'P1', nick: 'Anfitrión', ultimaVez: ahoraCaido },
      P2: { playerId: 'P2', nick: 'Invitado A', ultimaVez: ahoraCaido },
      P3: { playerId: 'P3', nick: 'Invitado B', ultimaVez: ahoraCaido },
    };
    const caido = sala({ lastSeen: 0, jugadores: presentes });
    const yoGano = resolverHost(caido, 'P2', ahoraCaido);
    assert(yoGano.accion === 'reclamar', 'host caído y soy el menor → reclamar');
    const otroGana = resolverHost(caido, 'P3', ahoraCaido);
    assert(otroGana.accion === 'esperar', 'host caído y hay un candidato menor → esperar');
    assert(otroGana.candidatoId === 'P2', 'esperar indica el candidato');

    const vacia = sala({ lastSeen: 0, jugadores: {} });
    assert(resolverHost(vacia, 'P2', ahoraCaido).accion === 'cerrar', 'sin candidatos → cerrar');
    assert(resolverHost(null, 'P2', ahoraCaido).accion === 'cerrar', 'sin sala → cerrar');
  }

  console.log(`\n${ok}/${total} ok`);
  process.exit(ok === total ? 0 : 1);
}

main();
