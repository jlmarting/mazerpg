/**
 * Smoke de housing en multijugador (HTTP, 2 clientes).
 *
 * Regresión del bug «el invitado no ve el tiling de la casa»:
 *  1. El host cruza a su casa => el invitado recibe el nuevo mapa 9×16 con
 *     sueloDecor/muebles (no se queda con el mapa 80×80 de la mazmorra).
 *  2. El invitado cambia el tema de render a 'casa' (el host lo dicta en el
 *     mensaje 'mapa') => dibuja sprites casa_suelo_* y casa_mueble_*.
 *  3. El host vuelve a la mazmorra => el invitado recupera 80×80 y 'dungeon'.
 *
 * Uso: node scripts/smoke_housing_mp.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUERTO_PREVIEW = 4321;
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

const contarDecor = `(() => {
  const m = window.game.mapaLaberinto;
  let suelo = 0, muebles = 0;
  for (let f = 0; f < m.length; f++) for (let c = 0; c < m[f].length; c++) {
    if (m[f][c].sueloDecor) suelo++;
    if (m[f][c].mueble) muebles++;
  }
  return { filas: m.length, columnas: m[0]?.length ?? 0, suelo, muebles };
})()`;

/** Dibuja un frame forzando caché y devuelve los sprites de suelo/mueble usados. */
const capturarSprites = `(() => new Promise((ok) => {
  const g = window.game;
  const sm = g.renderer.spriteManager;
  const original = sm.dibujarSprite.bind(sm);
  const vistos = new Set();
  sm.dibujarSprite = (ctx, nombre, ...resto) => { vistos.add(nombre); return original(ctx, nombre, ...resto); };
  g.renderer.invalidarCacheLaberinto();
  setTimeout(() => {
    sm.dibujarSprite = original;
    const arr = [...vistos];
    ok({
      ambiente: g.renderer.ambiente,
      casaSuelo: arr.filter((n) => String(n).startsWith('casa_suelo_')).length,
      casaMueble: arr.filter((n) => String(n).startsWith('casa_mueble_')).length,
      dungeonSuelo: arr.filter((n) => String(n).startsWith('static_suelo_')).length,
    });
  }, 350);
}))()`;

async function main() {
  const chromium = localizarChromium();
  const perfil = mkdtempSync(join(tmpdir(), 'mazerpg-smoke-housing-'));
  let signaling = null;
  let signalingPropio = false;
  let preview = null;
  let chrome = null;

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

    chrome = spawn(chromium, [
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
    await esperar(cdp, invitado, 'window.game.mapaLaberinto.length > 0', 10000, 'invitado con mapa inicial');

    const inicio = await evaluar(cdp, invitado, contarDecor);
    if (inicio.filas !== 80 || inicio.columnas !== 80) {
      throw new Error(`mapa inicial inesperado: ${inicio.filas}×${inicio.columnas}`);
    }
    console.log('  PASS invitado arranca en la mazmorra 80×80');

    // El host entra en su casa por el conector real.
    await evaluar(cdp, host, `window.game.teleportHousing()`);
    await esperar(cdp, host, `window.game.nodoActivo?.tipo === 'personal'`, 8000, 'host en casa');
    await esperar(
      cdp,
      invitado,
      'window.game.mapaLaberinto.length === 9 && window.game.mapaLaberinto[0]?.length === 16',
      8000,
      'invitado recibe la casa 9×16',
    );
    console.log('  PASS invitado recibe el mapa de la casa 9×16 al cruzar el host');

    const hostCasa = await evaluar(cdp, host, contarDecor);
    const guestCasa = await evaluar(cdp, invitado, contarDecor);
    if (hostCasa.suelo === 0 || guestCasa.suelo !== hostCasa.suelo || guestCasa.muebles !== hostCasa.muebles) {
      throw new Error(`decor distinto host/invitado: host=${JSON.stringify(hostCasa)} guest=${JSON.stringify(guestCasa)}`);
    }
    await esperar(cdp, invitado, `window.game.renderer.ambiente === 'casa'`, 8000, 'tema casa en el invitado');
    console.log(`  PASS invitado conserva el decor (${guestCasa.suelo} suelos, ${guestCasa.muebles} muebles) y tema casa`);

    const spritesGuest = await evaluar(cdp, invitado, capturarSprites);
    if (spritesGuest.ambiente !== 'casa' || spritesGuest.casaSuelo === 0) {
      throw new Error(`el invitado no dibuja el tiling de la casa: ${JSON.stringify(spritesGuest)}`);
    }
    console.log(`  PASS invitado dibuja casa_suelo_* (${spritesGuest.casaSuelo} variantes) y ${spritesGuest.casaMueble} muebles`);

    // Vuelta a la mazmorra: el invitado no puede quedarse «pegado» en casa.
    await evaluar(cdp, host, `window.game.teleportHousing()`);
    await esperar(cdp, host, `window.game.nodoActivo?.tipo !== 'personal'`, 8000, 'host de vuelta');
    await esperar(
      cdp,
      invitado,
      'window.game.mapaLaberinto.length === 80 && window.game.renderer.ambiente === "dungeon"',
      8000,
      'invitado de vuelta a la mazmorra',
    );
    const spritesVuelta = await evaluar(cdp, invitado, capturarSprites);
    if (spritesVuelta.ambiente !== 'dungeon' || spritesVuelta.dungeonSuelo === 0) {
      throw new Error(`el invitado no recuperó el tiling de mazmorra: ${JSON.stringify(spritesVuelta)}`);
    }
    console.log('  PASS invitado recupera 80×80 y tema dungeon al volver');

    console.log('SMOKE_HOUSING_MP_OK');
  } finally {
    try { if (chrome) chrome.kill('SIGKILL'); } catch {}
    try { if (preview) process.kill(-preview.pid, 'SIGKILL'); } catch {}
    try { if (signalingPropio && signaling) process.kill(-signaling.pid, 'SIGKILL'); } catch {}
    try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => {
  console.error('SMOKE_HOUSING_MP_FALLO:', e.message);
  process.exit(1);
});
