/**
 * Smoke de movimiento (1 cliente, solo) — regresión del bug "no puedo mover el personaje".
 *
 * Causa raíz (regresión b6eb3e0): Jugador.intentarMover empujaba la acción con
 * id 'local' cuando no hay transporte MP activo, pero resolverAccion resuelve la
 * entidad por game.idLocalActivo (network.idLocal = "Lxxxx") → entidad no
 * encontrada → movimiento descartado.
 *
 * Reproduce el camino real del usuario: lobby → UN JUGADOR → dificultad →
 * keydown flecha → posición del protagonista debe cambiar.
 *
 * Uso: node scripts/smoke_movimiento.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUERTO_PREVIEW = 4314;
const CHROMIUM_CANDIDATOS = [
  join(process.env.HOME || '', '.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'),
  join(process.env.HOME || '', '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'),
];

function localizarChromium() {
  for (const ruta of CHROMIUM_CANDIDATOS) {
    if (spawnSync(ruta, ['--version'], { stdio: 'ignore' }).status === 0) return ruta;
  }
  throw new Error('chrome-headless-shell no encontrado en ~/.cache/ms-playwright');
}

function esperarPreview(puerto, intentos = 60) {
  return new Promise((ok, fallo) => {
    const t = setInterval(() => {
      try {
        fetch(`http://localhost:${puerto}/`).then((r) => {
          if (r.ok) { clearInterval(t); ok(); }
        }).catch(() => {});
      } catch {}
      if (intentos-- <= 0) { clearInterval(t); fallo(new Error('preview no responde')); }
    }, 250);
  });
}

function conectarWs(url) {
  return new Promise((ok, fallo) => {
    const websockets = join(RAIZ, 'node_modules/.pnpm');
    import('node:fs').then(({ readdirSync }) => {
      const paquete = readdirSync(websockets).find((d) => d.startsWith('faye-websocket@'));
      if (!paquete) return fallo(new Error('faye-websocket no encontrado'));
      const ruta = 'file://' + join(websockets, paquete, 'node_modules/faye-websocket/lib/faye/websocket.js');
      return import(ruta);
    }).then((mod) => {
      const Cliente = (mod.default || mod).Client || (mod.default || mod).WebSocket;
      const ws = new Cliente(url, [], { extensions: [] });
      ws.on('open', () => ok(ws));
      ws.on('error', (e) => fallo(e));
    }).catch(fallo);
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    this.ws.on('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { ok, fallo } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) fallo(new Error(`${msg.error.message} (${msg.error.code})`));
        else ok(msg.result);
        return;
      }
      for (const l of this.listeners) l(msg);
    });
  }
  comando(metodo, params = {}, sesion = null) {
    const id = ++this.id;
    return new Promise((ok, fallo) => {
      this.pending.set(id, { ok, fallo });
      this.ws.send(JSON.stringify({ id, method: metodo, params, sessionId: sesion || undefined }));
    });
  }
  on(escucha) { this.listeners.push(escucha); }
}

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluar(cdp, sesion, expr) {
  const r = await cdp.comando('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sesion);
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error(`eval fallo: ${d.text} ${d.exception?.description || ''}`);
  }
  return r.result?.value;
}

async function esperar(cdp, sesion, condicion, ms, etiqueta) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await evaluar(cdp, sesion, condicion)) return true;
    await SLEEP(300);
  }
  throw new Error(`timeout esperando: ${etiqueta}`);
}

/** Elige una dirección válida (sin muro y celda destino transitable) desde la posición del protagonista. */
const ELEGIR_DIR = `(() => {
  const g = window.game, p = g.protagonista;
  const cel = g.mapaLaberinto[p.fila]?.[p.columna];
  if (!cel) return 'SIN_CELDA';
  const dirs = [];
  if (!cel.muros.superior && g.mapaLaberinto[p.fila-1]?.[p.columna]?.esTransitable) dirs.push('ArrowUp');
  if (!cel.muros.inferior && g.mapaLaberinto[p.fila+1]?.[p.columna]?.esTransitable) dirs.push('ArrowDown');
  if (!cel.muros.izquierdo && g.mapaLaberinto[p.fila]?.[p.columna-1]?.esTransitable) dirs.push('ArrowLeft');
  if (!cel.muros.derecho && g.mapaLaberinto[p.fila]?.[p.columna+1]?.esTransitable) dirs.push('ArrowRight');
  return dirs.length ? dirs[0] : 'NINGUNA';
})()`;

async function main() {
  const chromium = localizarChromium();
  const perfil = mkdtempSync(join(tmpdir(), 'mazerpg-mov-'));

  const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PUERTO_PREVIEW), '--strictPort'], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  await esperarPreview(PUERTO_PREVIEW);
  console.log(`[mov] dist servido en http://localhost:${PUERTO_PREVIEW}/`);

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

  const cdpWs = await conectarWs(wsUrl);
  const cdp = new Cdp(cdpWs);
  const { targetId } = await cdp.comando('Target.createTarget', { url: `http://localhost:${PUERTO_PREVIEW}/` });
  const { sessionId } = await cdp.comando('Target.attachToTarget', { targetId, flatten: true });
  await cdp.comando('Runtime.enable', {}, sessionId);

  const consola = [];
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled') {
      const texto = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      consola.push(`[${msg.params.type}] ${texto}`);
    }
  });

  let fallos = 0;
  const pase = (n) => console.log(`  PASS ${n}`);
  const pana = (n, e = '') => { console.error(`  FALLO ${n} ${e}`); fallos++; };

  try {
    await esperar(cdp, sessionId, `!!window.game`, 15000, 'window.game expuesto');
    await evaluar(cdp, sessionId, `document.getElementById('btnSolo').click()`);
    await esperar(cdp, sessionId, `document.getElementById('difficultyModal')?.style.display === 'flex'`, 5000, 'modal dificultad');
    await evaluar(cdp, sessionId, `document.querySelector('.diff-btn[data-diff="facil"]').click()`);
    await esperar(cdp, sessionId, `window.game.motorIniciado === true`, 10000, 'motor iniciado');
    await esperar(cdp, sessionId, `!!window.game.gestorMundo.nodoActivoId`, 10000, 'nodo activo');
    await SLEEP(500);

    const antes = await evaluar(cdp, sessionId, `JSON.stringify({f: window.game.protagonista.fila, c: window.game.protagonista.columna, id: window.game.network.idLocal})`);
    const { f: f0, c: c0, id: idRed } = JSON.parse(antes);
    console.log(`[mov] protagonista en (${f0},${c0}), idLocalActivo=${idRed}`);

    const dir = await evaluar(cdp, sessionId, ELEGIR_DIR);
    if (dir === 'NINGUNA' || dir === 'SIN_CELDA') {
      pana('escenario con dirección transitable', `dir=${dir}`);
    } else {
      await evaluar(cdp, sessionId, `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(dir)} }))`);
      let movido = false;
      for (let i = 0; i < 10 && !movido; i++) {
        await SLEEP(300);
        movido = await evaluar(cdp, sessionId, `window.game.protagonista.fila !== ${f0} || window.game.protagonista.columna !== ${c0}`);
      }
      const despues = await evaluar(cdp, sessionId, `JSON.stringify({f: window.game.protagonista.fila, c: window.game.protagonista.columna})`);
      if (movido) pase(`keydown ${dir} mueve al protagonista: (${f0},${c0}) → ${despues}`);
      else pana(`keydown ${dir} NO mueve al protagonista`, `sigue en ${despues}`);
    }

    const sinEntidad = consola.filter((l) => l.includes('No se encontró entidad para ID'));
    if (sinEntidad.length > 0) {
      pana('resolverAccion encontró la entidad', `— ${sinEntidad.length}x "No se encontró entidad" (idLocal mal encolado)`);
    } else {
      pase('resolverAccion resolvió la acción sin "entidad no encontrada"');
    }

    const movidoLog = consola.filter((l) => l.includes('movido a ('));
    if (movidoLog.length > 0) pase(`log de movimiento emitido (${movidoLog.length}x)`);
  } catch (e) {
    pana('secuencia de smoke de movimiento', `— ${e.message}`);
  }

  console.log('\n[mov] --- consola (últimos 25) ---');
  for (const c of consola.slice(-25)) console.log('  >', c.slice(0, 200));

  await cdpWs.close();
  await new Promise((ok) => {
    if (chrome.exitCode !== null || chrome.killed) return ok();
    chrome.once('exit', () => ok());
    try { chrome.kill(); } catch {}
    setTimeout(ok, 3000);
  });
  try { process.kill(-preview.pid); } catch {}
  try { rmSync(perfil, { recursive: true, force: true }); } catch {}

  console.log(fallos === 0 ? '\nMOVIMIENTO_OK' : `\nMOVIMIENTO_FAIL_${fallos}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('[mov] ERROR FATAL:', e);
  process.exit(1);
});