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
