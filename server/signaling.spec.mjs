/**
 * Spec de aceptación del servidor local de signaling.
 * Ejerce la API HTTP real sobre un puerto efímero con el `fetch` global de Node 20.
 * Ejecutar: node server/signaling.spec.mjs
 */

import { crearServidor } from './signaling.mjs';

let total = 0;
let exitos = 0;

function ok(condicion, mensaje) {
  total++;
  if (condicion) {
    exitos++;
    return;
  }
  console.error(`  ✗ ${mensaje}`);
}

async function json(res) {
  return res.json();
}

async function main() {
  let reloj = 1_000_000;
  const servidor = crearServidor({ ahora: () => reloj });

  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  try {
    // 1. OPTIONS preflight → 204 + CORS abierto
    {
      const res = await fetch(`${base}/cualquier-cosa`, {
        method: 'OPTIONS',
        headers: { 'Content-Type': 'application/json' },
      });
      ok(res.status === 204, `OPTIONS devuelve 204 (recibido ${res.status})`);
      ok(
        res.headers.get('access-control-allow-origin') === '*',
        'OPTIONS incluye Access-Control-Allow-Origin: *',
      );
      ok(
        (res.headers.get('access-control-allow-methods') || '').includes('DELETE'),
        'OPTIONS incluye Allow-Methods con DELETE',
      );
      await res.text();
    }

    // 2. POST /partidas devuelve {id}; GET /partidas lo lista con metadatos
    let idPartida;
    {
      const res = await fetch(`${base}/partidas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: 'host-1', hostNick: 'Anfitrión', nombre: 'Cueva' }),
      });
      ok(res.status === 200, `POST /partidas → 200 (recibido ${res.status})`);
      const data = await json(res);
      idPartida = data.id;
      ok(typeof idPartida === 'string' && idPartida.length > 0, 'POST /partidas devuelve un id no vacío');

      const lista = await json(await fetch(`${base}/partidas`));
      const p = (lista.partidas || []).find((x) => x.id === idPartida);
      ok(!!p, 'GET /partidas incluye la partida creada');
      ok(p && p.hostNick === 'Anfitrión', 'GET /partidas expone hostNick');
      ok(p && typeof p.numJugadores === 'number', 'GET /partidas expone numJugadores numérico');
    }

    // 3. Guests: registrar, listar, eliminar
    {
      const reg = await fetch(`${base}/partidas/${idPartida}/guests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestId: 'g1', nick: 'Invitado' }),
      });
      ok(reg.status === 200, `POST guests → 200 (recibido ${reg.status})`);

      const lista = await json(await fetch(`${base}/partidas/${idPartida}/guests`));
      const g = (lista.guests || []).find((x) => x.guestId === 'g1');
      ok(!!g && g.nick === 'Invitado', 'GET guests refleja el guest registrado');

      const del = await fetch(`${base}/partidas/${idPartida}/guests/g1`, { method: 'DELETE' });
      ok(del.status === 200, `DELETE guest → 200 (recibido ${del.status})`);
      const lista2 = await json(await fetch(`${base}/partidas/${idPartida}/guests`));
      ok(!(lista2.guests || []).some((x) => x.guestId === 'g1'), 'DELETE guests/:gid elimina el guest');
    }

    // 4. Señal dirigida: solo la recibe `toId`; la bandeja se vacía al leer
    {
      const envio = await fetch(`${base}/signal/${idPartida}/peerA`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toId: 'peerB', payload: { type: 'offer', data: { sdp: 'xyz' } } }),
      });
      ok(envio.status === 200, `POST signal → 200 (recibido ${envio.status})`);

      const paraA = await json(await fetch(`${base}/signal/${idPartida}/peerA`));
      ok((paraA.senales || []).length === 0, 'La señal NO llega al emisor (bandeja de peerA vacía)');

      const paraB = await json(await fetch(`${base}/signal/${idPartida}/peerB`));
      const s = (paraB.senales || [])[0];
      ok(
        !!s && s.fromId === 'peerA' && s.type === 'offer' && s.data && s.data.sdp === 'xyz',
        'GET signal entrega {fromId,type,data} correctos al destinatario',
      );

      const paraB2 = await json(await fetch(`${base}/signal/${idPartida}/peerB`));
      ok(
        (paraB2.senales || []).length === 0,
        'La segunda lectura vacía la bandeja (senales: [])',
      );
    }

    // 4b. Migración de host: estado, presencia, CAS, lease y metadatos
    {
      const creada = await json(
        await fetch(`${base}/partidas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostId: 'P1', hostNick: 'Uno', nombre: 'Sala migrable' }),
        }),
      );
      const pid = creada.id;

      const estado0 = await json(await fetch(`${base}/partidas/${pid}/estado`));
      ok(estado0.hostId === 'P1', 'GET estado expone el host inicial');
      ok(estado0.hostEpoch === 1, 'la sala nace con hostEpoch 1');
      ok(estado0.lastSeen === reloj, 'lastSeen inicial = reloj de creación');
      ok(estado0.jugadores && typeof estado0.jugadores === 'object', 'estado expone jugadores como objeto');

      const reg = await fetch(`${base}/partidas/${pid}/jugadores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'P2', playerId: 'P2', nick: 'Dos' }),
      });
      ok(reg.status === 200, `POST jugadores → 200 (recibido ${reg.status})`);
      const estado1 = await json(await fetch(`${base}/partidas/${pid}/estado`));
      ok(estado1.jugadores.P2?.playerId === 'P2', 'estado incluye la presencia registrada');
      ok(estado1.jugadores.P2?.ultimaVez === reloj, 'la presencia lleva ultimaVez');

      const claim1 = await fetch(`${base}/partidas/${pid}/host`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'P2', nick: 'Dos', expectedEpoch: 1 }),
      });
      const claim1Data = await json(claim1);
      ok(claim1.status === 200, `CAS de host con epoch vigente → 200 (recibido ${claim1.status})`);
      ok(claim1Data.ok === true && claim1Data.hostEpoch === 2, 'el ganador del CAS recibe epoch+1');

      const claim2 = await fetch(`${base}/partidas/${pid}/host`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'P3', nick: 'Tres', expectedEpoch: 1 }),
      });
      const claim2Data = await json(claim2);
      ok(claim2.status === 409, `CAS con epoch viejo → 409 (recibido ${claim2.status})`);
      ok(claim2Data.ok === false && claim2Data.hostEpoch === 2, 'el perdedor recibe el epoch vigente');

      const leaseOk = await fetch(`${base}/partidas/${pid}/lease`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'P2', hostEpoch: 2 }),
      });
      ok(leaseOk.status === 200, `lease del host vigente → 200 (recibido ${leaseOk.status})`);

      const leaseMal = await fetch(`${base}/partidas/${pid}/lease`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'P2', hostEpoch: 1 }),
      });
      ok(leaseMal.status === 409, `lease con epoch viejo → 409 (recibido ${leaseMal.status})`);

      const estado2 = await json(await fetch(`${base}/partidas/${pid}/estado`));
      ok(estado2.hostId === 'P2' && estado2.hostEpoch === 2, 'estado refleja al host ganador');
      ok(estado2.lastSeen === reloj, 'el lease actualiza lastSeen');

      const meta = {
        inicioPartida: reloj - 5000,
        dificultad: 'dificil',
        roster: ['P2'],
        jugadores: { P2: { nick: 'Dos', oro: 10, xp: 20, bajas: 1 } },
      };
      const metaPost = await fetch(`${base}/partidas/${pid}/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(meta),
      });
      ok(metaPost.status === 200, `POST meta → 200 (recibido ${metaPost.status})`);
      const metaGet = await json(await fetch(`${base}/partidas/${pid}/meta`));
      ok(metaGet.inicioPartida === meta.inicioPartida, 'GET meta conserva inicioPartida');
      ok(metaGet.roster?.[0] === 'P2', 'GET meta conserva el roster');
      ok(metaGet.jugadores?.P2?.oro === 10, 'GET meta conserva el progreso');

      const del = await fetch(`${base}/partidas/${pid}/jugadores/P2`, { method: 'DELETE' });
      ok(del.status === 200, `DELETE jugador → 200 (recibido ${del.status})`);
      const estado3 = await json(await fetch(`${base}/partidas/${pid}/estado`));
      ok(!estado3.jugadores.P2, 'DELETE jugadores/:id elimina la presencia');
    }

    // 5. 404 en partida inexistente y en ruta desconocida
    {
      const signalMal = await fetch(`${base}/signal/inexistente/peerA`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toId: 'peerB', payload: { type: 'offer', data: {} } }),
      });
      ok(signalMal.status === 404, `POST signal a partida inexistente → 404 (recibido ${signalMal.status})`);

      const hbMal = await fetch(`${base}/partidas/inexistente/hb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numJugadores: 2 }),
      });
      ok(hbMal.status === 404, `POST hb a partida inexistente → 404 (recibido ${hbMal.status})`);

      const ruta = await fetch(`${base}/ruta/desconocida`);
      ok(ruta.status === 404, `Ruta desconocida → 404 (recibido ${ruta.status})`);
    }

    // 6. Cuerpo JSON inválido → 400 y el servidor sigue vivo; cuerpo vacío → {}
    {
      const mal = await fetch(`${base}/partidas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'esto no es json {',
      });
      ok(mal.status === 400, `JSON inválido → 400 (recibido ${mal.status})`);

      const hbVacio = await fetch(`${base}/partidas/${idPartida}/hb`, { method: 'POST' });
      ok(hbVacio.status === 200, `POST hb sin cuerpo → 200 (recibido ${hbVacio.status})`);

      const otra = await json(
        await fetch(`${base}/partidas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostId: 'host-2', hostNick: 'Dos' }),
        }),
      );
      ok(typeof otra.id === 'string', 'Tras un JSON inválido el servidor sigue respondiendo');
    }

    // 7. Expiración perezosa ~60 s con reloj inyectado
    {
      const creada = await json(
        await fetch(`${base}/partidas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostId: 'host-3', hostNick: 'Tres' }),
        }),
      );
      reloj += 61_000;
      const lista = await json(await fetch(`${base}/partidas`));
      ok(
        !(lista.partidas || []).some((x) => x.id === creada.id),
        'GET /partidas purga la partida tras >60 s sin heartbeat',
      );
    }
  } catch (e) {
    console.error('  ✗ Excepción no controlada:', e);
    total++;
  } finally {
    await new Promise((resolver) => servidor.close(resolver));
  }

  console.log(`\n${exitos}/${total} ok`);
  process.exit(exitos === total ? 0 : 1);
}

main();
