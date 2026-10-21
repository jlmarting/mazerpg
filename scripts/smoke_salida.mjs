/**
 * Smoke de F4 (salida + fin MP) sobre dist/.
 *
 * 1 cliente: salida aleatoria, inmunidad en la celda y resultados al pisarla.
 * 2 clientes HTTP: el primero en salir no termina; el último cierra la partida
 * y ambos reciben resultados.
 *
 * Uso: node scripts/smoke_salida.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUERTO_PREVIEW = 4323;
const CHROMIUM_CANDIDATOS = [
  join(process.env.HOME || '', '.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'),
  join(process.env.HOME || '', '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'),
];
const URL_JUEGO = `http://localhost:${PUERTO_PREVIEW}/`;
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

function localizarChromium() {
  for (const ruta of CHROMIUM_CANDIDATOS) {
    if (spawnSync(ruta, ['--version'], { stdio: 'ignore' }).status === 0) return ruta;
  }
  throw new Error('chrome-headless-shell no encontrado');
}

function esperarPuerto(puerto, etiqueta, intentos = 80) {
  return new Promise((ok, fallo) => {
    const t = setInterval(() => {
      fetch(`http://localhost:${puerto}/`).then((r) => {
        if (r.status < 500) { clearInterval(t); ok(); }
      }).catch(() => {});
      if (intentos-- <= 0) { clearInterval(t); fallo(new Error(`${etiqueta} no responde`)); }
    }, 250);
  });
}

function conectarWs(url) {
  return new Promise((ok, fallo) => {
    const websockets = join(RAIZ, 'node_modules/.pnpm');
    const paquete = readdirSync(websockets).find((d) => d.startsWith('faye-websocket@'));
    if (!paquete) return fallo(new Error('faye-websocket no encontrado'));
    const ruta = 'file://' + join(websockets, paquete, 'node_modules/faye-websocket/lib/faye/websocket.js');
    import(ruta).then((mod) => {
      const Cliente = (mod.default || mod).Client || (mod.default || mod).WebSocket;
      const ws = new Cliente(url, [], { extensions: [] });
      ws.on('open', () => ok(ws));
      ws.on('error', fallo);
    }).catch(fallo);
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.on('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { ok, fallo } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) fallo(new Error(msg.error.message)); else ok(msg.result);
      }
    });
  }
  comando(metodo, params = {}, sesion = null) {
    const id = ++this.id;
    return new Promise((ok, fallo) => {
      this.pending.set(id, { ok, fallo });
      this.ws.send(JSON.stringify({ id, method: metodo, params, sessionId: sesion || undefined }));
    });
  }
}

async function evaluar(cdp, sesion, expr) {
  const r = await cdp.comando('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sesion);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result?.value;
}

async function esperar(cdp, sesion, cond, ms, etiqueta) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await evaluar(cdp, sesion, cond)) return;
    await SLEEP(250);
  }
  throw new Error(`timeout: ${etiqueta}`);
}

const buscarSalida = `(() => {
  const g = window.game;
  for (let f = 0; f < g.mapaLaberinto.length; f++) {
    for (let c = 0; c < g.mapaLaberinto[f].length; c++) {
      if (g.mapaLaberinto[f][c].esSalida) return { f, c };
    }
  }
  return null;
})()`;

const irASalida = (f, c) => `(() => {
  const g = window.game;
  const p = g.protagonista;
  p.fila = ${f}; p.columna = ${c};
  p.visualFila = ${f}; p.visualColumna = ${c};
  g.comprobarSalida(p);
  return { terminado: g.juegoTerminado, resultados: g.resultados?.length ?? 0 };
})()`;

async function main() {
  const chromium = localizarChromium();
  const perfil = mkdtempSync(join(tmpdir(), 'mazerpg-smoke-salida-'));
  let signaling = null;
  let signalingPropio = false;
  let preview = null;
  try {
    let signalingVivo = false;
    try {
      const r = await fetch('http://localhost:8080/');
      signalingVivo = r.status < 500;
    } catch {}
    if (!signalingVivo) {
      signaling = spawn('node', ['server/signaling.mjs'], { cwd: RAIZ, stdio: 'ignore', detached: true });
      signalingPropio = true;
    }
    preview = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PUERTO_PREVIEW), '--strictPort'], {
      cwd: RAIZ, stdio: ['ignore', 'ignore', 'pipe'], detached: true,
    });
    await esperarPuerto(8080, 'signaling');
    await esperarPuerto(PUERTO_PREVIEW, 'preview');

    const chrome = spawn(chromium, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      `--user-data-dir=${perfil}`, '--remote-debugging-port=0', 'about:blank',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    const wsUrl = await new Promise((ok, fallo) => {
      let buf = '';
      const t = setTimeout(() => fallo(new Error('DevTools no anunció endpoint')), 15000);
      chrome.stderr.on('data', (d) => {
        buf += d.toString();
        const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) { clearTimeout(t); ok(m[1]); }
      });
    });
    const cdp = new Cdp(await conectarWs(wsUrl));

    async function abrirPagina() {
      const { targetId } = await cdp.comando('Target.createTarget', { url: URL_JUEGO });
      const { sessionId } = await cdp.comando('Target.attachToTarget', { targetId, flatten: true });
      await cdp.comando('Runtime.enable', {}, sessionId);
      await esperar(cdp, sessionId, '!!window.game', 15000, 'window.game');
      return sessionId;
    }

    // --- 1 cliente ---
    const solo = await abrirPagina();
    await evaluar(cdp, solo, `document.getElementById('btnSolo').click()`);
    await esperar(cdp, solo, `document.getElementById('difficultyModal')?.style.display === 'flex'`, 5000, 'modal');
    await evaluar(cdp, solo, `document.querySelector('.diff-btn[data-diff="facil"]').click()`);
    await esperar(cdp, solo, 'window.game.motorIniciado === true', 10000, 'motor solo');

    const salida = await evaluar(cdp, solo, buscarSalida);
    if (!salida) throw new Error('el mapa no tiene salida');

    const inmunidad = await evaluar(cdp, solo, `(() => {
      const g = window.game;
      const p = g.protagonista;
      p.fila = ${salida.f}; p.columna = ${salida.c};
      const mob = g.listaDeEnemigos.find((e) => e.estaVivo);
      if (!mob) return { error: 'sin mob' };
      mob.vidaActual = 99999; mob.vidaMaxima = 99999;
      const antes = p.vidaActual;
      p.enCombateCon = mob; mob.enCombateCon = p;
      g.resolverRondaDeCombate(p, mob);
      p.enCombateCon = null; mob.enCombateCon = null;
      return { antes, despues: p.vidaActual };
    })()`);
    if (inmunidad.error) throw new Error(inmunidad.error);
    if (inmunidad.despues !== inmunidad.antes) throw new Error('no fue inmune en la salida');

    const finSolo = await evaluar(cdp, solo, irASalida(salida.f, salida.c));
    if (!finSolo.terminado || finSolo.resultados !== 1) throw new Error('solo no terminó con resultado');
    const resSolo = await evaluar(cdp, solo, `window.game.resultados[0]`);
    if (!resSolo || typeof resSolo.puntuacion !== 'number' || typeof resSolo.oro !== 'number') {
      throw new Error('resultado local inválido');
    }
    console.log('SMOKE_SALIDA_OK');

    // --- 2 clientes ---
    const host = await abrirPagina();
    await evaluar(cdp, host, `document.getElementById('btnModoHttp')?.click()`);
    await evaluar(cdp, host, `document.getElementById('btnCrearPartida')?.click()`);
    await evaluar(cdp, host, `document.querySelector('.diff-btn[data-diff="facil"]')?.click()`);
    await SLEEP(1200);
    await evaluar(cdp, host, `document.getElementById('housingModal')?.style.display === 'flex' ? document.getElementById('btnHousingUsar')?.click() : null`);
    await esperar(cdp, host, 'window.game.motorIniciado === true', 20000, 'host motor');
    const sala = await evaluar(cdp, host, `window.game.networkHttp?.idPartidaActual ?? null`);
    if (!sala) throw new Error('host sin sala');

    const invitado = await abrirPagina();
    await evaluar(cdp, invitado, `document.getElementById('btnModoHttp')?.click()`);
    await evaluar(cdp, invitado, `window.game.onJoinGame(${JSON.stringify(sala)}, 'http')`);
    await esperar(cdp, invitado, 'window.game.motorIniciado === true', 25000, 'invitado motor');
    await esperar(cdp, host, 'window.game.remotosActivos.size >= 1', 15000, 'host ve invitado');

    const salidaHost = await evaluar(cdp, host, buscarSalida);
    if (!salidaHost) throw new Error('host sin salida');
    await evaluar(cdp, host, irASalida(salidaHost.f, salidaHost.c));
    await SLEEP(2500);
    const trasPrimero = await evaluar(cdp, host, `({ terminado: window.game.juegoTerminado, roster: window.game.roster?.size ?? 0 })`);
    if (trasPrimero.terminado) throw new Error('la partida terminó con el primer jugador');
    if (await evaluar(cdp, invitado, 'window.game.juegoTerminado === true')) throw new Error('invitado terminó antes de salir');

    const salidaGuest = await evaluar(cdp, invitado, buscarSalida);
    if (!salidaGuest) throw new Error('invitado sin salida');
    await evaluar(cdp, invitado, irASalida(salidaGuest.f, salidaGuest.c));
    await esperar(cdp, host, 'window.game.juegoTerminado === true', 8000, 'host cierra la partida');
    await esperar(cdp, invitado, 'window.game.juegoTerminado === true', 8000, 'invitado recibe fin');
    const resHost = await evaluar(cdp, host, `window.game.resultados?.length ?? 0`);
    const resGuest = await evaluar(cdp, invitado, `window.game.resultados?.length ?? 0`);
    if (resHost !== 2 || resGuest !== 2) throw new Error(`resultados incompletos host=${resHost} guest=${resGuest}`);

    console.log('SMOKE_SALIDA_MP_OK');
    try { chrome.kill('SIGKILL'); } catch {}
  } finally {
    try { if (preview) process.kill(-preview.pid, 'SIGKILL'); } catch {}
    try { if (signalingPropio && signaling) process.kill(-signaling.pid, 'SIGKILL'); } catch {}
    try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => {
  console.error('SMOKE_SALIDA_FALLO:', e.message);
  process.exit(1);
});
