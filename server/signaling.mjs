/**
 * Servidor local de signaling para mazerpg.
 *
 * HTTP mínimo, en memoria, sin dependencias ni persistencia. Implementa el
 * contrato que consume `src/network/SignalingClient.ts`.
 *
 * Uso: node server/signaling.mjs   (PORT por defecto: 8080)
 */

import http from 'node:http';
import { pathToFileURL } from 'node:url';

const TTL_SIN_HB = 60_000;

/**
 * Fábrica del servidor. No arranca el listener: eso lo decide quien la use.
 * @param {{ ahora?: () => number }} [opciones]
 * @returns {http.Server}
 */
export function crearServidor({ ahora = Date.now } = {}) {
  /** @type {Map<string, any>} */
  const partidas = new Map();
  /** @type {Map<string, Array<{fromId: string, type: string, data: any}>>} */
  const senales = new Map();

  function purgarExpiradas() {
    for (const [id, partida] of partidas) {
      const referencia = partida.ultimoHb ?? partida.creacion;
      if (ahora() - referencia <= TTL_SIN_HB) continue;
      partidas.delete(id);
      for (const clave of senales.keys()) {
        if (clave.startsWith(`${id}:`)) senales.delete(clave);
      }
    }
  }

  function aplicarCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  function responderJson(res, estado, cuerpo) {
    res.writeHead(estado, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cuerpo));
  }

  async function leerCuerpo(req) {
    let bruto = '';
    for await (const trozo of req) bruto += trozo;
    if (bruto.trim() === '') return {};
    return JSON.parse(bruto);
  }

  async function manejar(req, res) {
    aplicarCors(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const { pathname } = new URL(req.url, 'http://x');
      const seg = pathname.split('/').filter(Boolean);

      if (seg[0] === 'partidas') {
        if (seg.length === 1 && req.method === 'POST') {
          const { hostId, hostNick, nombre } = await leerCuerpo(req);
          const id = Math.random().toString(36).slice(2, 8);
          partidas.set(id, {
            id,
            hostId,
            hostNick,
            nombre,
            numJugadores: 1,
            creacion: ahora(),
            guests: new Map(),
          });
          responderJson(res, 200, { id });
          return;
        }

        if (seg.length === 1 && req.method === 'GET') {
          purgarExpiradas();
          const lista = [...partidas.values()].map((p) => ({
            id: p.id,
            hostId: p.hostId,
            hostNick: p.hostNick,
            nombre: p.nombre,
            numJugadores: p.numJugadores,
            creacion: p.creacion,
            ultimoHb: p.ultimoHb,
          }));
          responderJson(res, 200, { partidas: lista });
          return;
        }

        const partida = seg.length >= 2 ? partidas.get(seg[1]) : null;
        if (!partida) {
          responderJson(res, 404, { error: 'Partida no encontrada' });
          return;
        }

        if (seg.length === 3 && seg[2] === 'hb' && req.method === 'POST') {
          const { numJugadores } = await leerCuerpo(req);
          if (typeof numJugadores === 'number') partida.numJugadores = numJugadores;
          partida.ultimoHb = ahora();
          responderJson(res, 200, {});
          return;
        }

        if (seg.length === 3 && seg[2] === 'guests') {
          if (req.method === 'POST') {
            const { guestId, nick } = await leerCuerpo(req);
            partida.guests.set(guestId, { guestId, nick });
            responderJson(res, 200, {});
            return;
          }
          if (req.method === 'GET') {
            responderJson(res, 200, { guests: [...partida.guests.values()] });
            return;
          }
        }

        if (seg.length === 4 && seg[2] === 'guests' && req.method === 'DELETE') {
          partida.guests.delete(seg[3]);
          responderJson(res, 200, {});
          return;
        }

        responderJson(res, 404, { error: 'Ruta no encontrada' });
        return;
      }

      if (seg[0] === 'signal' && seg.length === 3) {
        if (!partidas.has(seg[1])) {
          responderJson(res, 404, { error: 'Partida no encontrada' });
          return;
        }

        if (req.method === 'POST') {
          const { toId, payload } = await leerCuerpo(req);
          const claveDestino = `${seg[1]}:${toId}`;
          const bandeja = senales.get(claveDestino) ?? [];
          bandeja.push({
            fromId: seg[2],
            type: payload?.type,
            data: payload?.data,
          });
          senales.set(claveDestino, bandeja);
          responderJson(res, 200, {});
          return;
        }

        if (req.method === 'GET') {
          const clave = `${seg[1]}:${seg[2]}`;
          const bandeja = senales.get(clave) ?? [];
          senales.delete(clave);
          responderJson(res, 200, { senales: bandeja });
          return;
        }
      }

      responderJson(res, 404, { error: 'Ruta no encontrada' });
    } catch (e) {
      if (e && e.name === 'SyntaxError') {
        responderJson(res, 400, { error: 'JSON inválido' });
        return;
      }
      responderJson(res, 500, { error: 'Error interno' });
    }
  }

  return http.createServer(manejar);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = Number(process.env.PORT) || 8080;
  crearServidor().listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor de signaling escuchando en http://0.0.0.0:${PORT}`);
  });
}
