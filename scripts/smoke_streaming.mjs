/**
 * Smoke de streaming de nodos (F4b, 1 cliente, solo).
 *
 * Comprueba la cadena de 5 zonas, el reparto hot/lod/cold por viewport, el cap
 * de 3 nodos calientes, que los fríos no conservan cache completa y que el LOD
 * aparece en algún tramo. Recorre raíz → zona1 → zona2 → zona3 → zona4 con el
 * atajo de debug `teleportCosturaDebug` + ArrowRight.
 *
 * Uso: node scripts/smoke_streaming.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUERTO_PREVIEW = 4317;
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
  console.log(`[streaming] dist servido en http://localhost:${PUERTO_PREVIEW}/`);

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

    // F4b: cadena de 5 zonas y streaming hot/lod/cold.
    await SLEEP(1200);
    const leerEstado = async (etiqueta) => JSON.parse(await evaluar(cdp, sessionId, `JSON.stringify({
      activo: window.game.gestorMundo.nodoActivoId,
      nodos: [...window.game.gestorMundo.mundo.keys()],
      streaming: window.game.streamingActual ? {
        hot: window.game.streamingActual.hot,
        lod: window.game.streamingActual.lod,
        cold: window.game.streamingActual.cold,
        niveles: [...window.game.streamingActual.niveles.entries()],
        caches: [...window.game.renderer.cacheNodos.keys()]
      } : null
    })`));
    const comprobarStreaming = (st, activo, etiqueta) => {
      if (!st) { pana(`${etiqueta}: streaming nulo`, ''); return; }
      const niveles = new Map(st.niveles);
      if (st.hot.includes(activo)) pase(`${etiqueta}: activo en hot (${activo})`);
      else pana(`${etiqueta}: el activo no está en hot`, JSON.stringify(st.hot));
      if (st.hot.length <= 3) pase(`${etiqueta}: hot <= 3 (${st.hot.length})`);
      else pana(`${etiqueta}: hot > 3`, JSON.stringify(st.hot));
      const suma = st.hot.length + st.lod.length + st.cold.length;
      if (suma === 5 && niveles.get(activo) === 'activo') pase(`${etiqueta}: 5 nodos clasificados y activo=activo`);
      else pana(`${etiqueta}: clasificación`, JSON.stringify({ suma, activo, niveles: st.niveles }));
      for (const id of st.cold) {
        if (st.caches.includes(id)) pana(`${etiqueta}: cold ${id} conserva cache completa`, JSON.stringify(st.caches));
      }
      for (const id of st.lod) {
        if (!st.caches.includes(`${id}:lod`)) pana(`${etiqueta}: lod ${id} sin cache :lod`, JSON.stringify(st.caches));
      }
    };

    const inicio = await leerEstado('arranque');
    const zonas = ['zona-abierto-1', 'zona-abierto-2', 'zona-abierto-3', 'zona-abierto-4'];
    if (zonas.every((z) => inicio.nodos.includes(z))) pase(`cadena de 5 zonas sembrada (${inicio.nodos.length} nodos en el gestor)`);
    else pana('cadena de 5 zonas sembrada', JSON.stringify(inicio.nodos));
    comprobarStreaming(inicio.streaming, inicio.activo, 'arranque');

    let lodVisto = false;
    for (let i = 0; i < 4; i++) {
      await evaluar(cdp, sessionId, `window.game.teleportCosturaDebug()`);
      await SLEEP(250);
      await evaluar(cdp, sessionId, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))`);
      await esperar(cdp, sessionId, `window.game.gestorMundo.nodoActivoId === 'zona-abierto-${i + 1}'`, 5000, `cruce a zona ${i + 1}`);
      await SLEEP(350);
      const st = await leerEstado(`zona ${i + 1}`);
      comprobarStreaming(st.streaming, st.activo, `zona ${i + 1}`);
      if (st.streaming && st.streaming.lod.length > 0) lodVisto = true;
    }
    if (lodVisto) pase('LOD presente en al menos un tramo de la cadena');
    else pana('LOD presente', 'ningún nodo lod en la cadena');

    const errores = consola.filter((l) => l.includes('Error') || l.includes('EXCEPTION'));
    if (errores.length === 0) pase('sin errores JS durante la cadena');
    else pana('sin errores JS', errores.slice(-3).join(' | '));
  } catch (e) {
    pana('secuencia de smoke de streaming', `— ${e.message}`);
  }

  console.log('\n[streaming] --- consola (últimos 25) ---');
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

  console.log(fallos === 0 ? '\nSMOKE_STREAMING_OK' : `\nSMOKE_STREAMING_FAIL_${fallos}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('[streaming] ERROR FATAL:', e);
  process.exit(1);
});