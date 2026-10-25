/**
 * Smoke de interés adaptativo (F4a, 1 cliente, solo).
 *
 * Arranca la partida, espera la primera actualización del interés (1/s) y
 * comprueba que `interesActual` existe, que `config.radioSim/radioVis` están
 * sincronizados, que se respeta el invariante 1 <= sim <= vis <= cap del
 * dispositivo y que se cuentan los jugadores/FPS. No mide el crecimiento por
 * FPS alto (lo cubren los specs puros de `interes.helpers`).
 *
 * Uso: node scripts/smoke_interes.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUERTO_PREVIEW = 4316;
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
  console.log(`[interés] dist servido en http://localhost:${PUERTO_PREVIEW}/`);

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

    // F4a: el interés se actualiza cada segundo; esperar a que exista.
    await SLEEP(2200);
    const estado = JSON.parse(await evaluar(cdp, sessionId, `JSON.stringify({
      interes: window.game.interesActual,
      sim: window.game.config.radioSim,
      vis: window.game.config.radioVis,
      dispositivo: window.game.interesActual?.dispositivo ?? null,
      jugadores: window.game.interesActual?.jugadores ?? null,
      fps: window.game.interesActual?.fps ?? null
    })`));
    const caps = { movil: { sim: 2, vis: 3 }, tablet: { sim: 2, vis: 4 }, pc: { sim: 3, vis: 5 } };
    if (!estado.interes) {
      pana('interesActual expuesto', 'null tras 2 s');
    } else if (!caps[estado.dispositivo]) {
      pana('dispositivo válido', String(estado.dispositivo));
    } else {
      const cap = caps[estado.dispositivo];
      if (estado.sim === estado.interes.radioSim && estado.vis === estado.interes.radioVis) {
        pase(`config sincronizada con interesActual (${estado.dispositivo} sim=${estado.sim} vis=${estado.vis})`);
      } else {
        pana('config sincronizada con interesActual', JSON.stringify(estado));
      }
      if (estado.sim >= 1 && estado.sim <= estado.vis && estado.vis <= cap.vis) {
        pase(`invariante 1 <= sim <= vis <= ${cap.vis}`);
      } else {
        pana('invariante de radios', JSON.stringify(estado));
      }
      if (estado.sim <= cap.sim) pase(`sim dentro del cap del dispositivo (${estado.sim} <= ${cap.sim})`);
      else pana('sim dentro del cap', JSON.stringify(estado));
      if (estado.jugadores === 1) pase('jugadores contados = 1 en solo');
      else pana('jugadores contados en solo', JSON.stringify(estado));
      if (typeof estado.fps === 'number' && estado.fps > 0) pase(`FPS EMA expuesto (${estado.fps.toFixed(1)})`);
      else pana('FPS EMA expuesto', JSON.stringify(estado));
    }
    const errores = consola.filter((l) => l.includes('Error') || l.includes('EXCEPTION'));
    if (errores.length === 0) pase('sin errores JS en el arranque');
    else pana('sin errores JS', errores.slice(-3).join(' | '));
  } catch (e) {
    pana('secuencia de smoke de interés', `— ${e.message}`);
  }

  console.log('\n[interés] --- consola (últimos 25) ---');
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

  console.log(fallos === 0 ? '\nSMOKE_INTERES_OK' : `\nSMOKE_INTERES_FAIL_${fallos}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('[interés] ERROR FATAL:', e);
  process.exit(1);
});