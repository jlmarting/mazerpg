/**
 * Smoke de UI móvil (Chrome headless + CDP) sobre dist/.
 *
 * Comprueba los invariantes de visibilidad en el lobby en viewport de
 * smartphone (por defecto 360x640):
 *   1. El dock de acciones NO aparece en el lobby (ni al cargar ni tras un
 *      resize, que en móvil se dispara al moverse la barra de direcciones).
 *   2. Al volver al lobby desde una partida, el dock se oculta.
 *   3. Ningún botón visible del lobby queda tapado por el dock.
 *   4. Todos los botones visibles del lobby caben en el viewport.
 *
 * Uso: node scripts/smoke_ui_movil.mjs [--keep]
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUERTO = 4314;
const VP_W = Number(process.env.VP_W || 360);
const VP_H = Number(process.env.VP_H || 640);
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

function esperarPreview(puerto, intentos = 80) {
  return new Promise((ok, fallo) => {
    const t = setInterval(() => {
      fetch(`http://localhost:${puerto}/`).then((r) => { if (r.ok) { clearInterval(t); ok(); } }).catch(() => {});
      if (intentos-- <= 0) { clearInterval(t); fallo(new Error('preview no responde')); }
    }, 250);
  });
}

async function conectarWs(url) {
  const { readdirSync } = await import('node:fs');
  const dir = join(RAIZ, 'node_modules/.pnpm');
  const paquete = readdirSync(dir).find((d) => d.startsWith('faye-websocket@'));
  const mod = await import('file://' + join(dir, paquete, 'node_modules/faye-websocket/lib/faye/websocket.js'));
  const Cliente = (mod.default || mod).Client || (mod.default || mod).WebSocket;
  const ws = new Cliente(url, [], { extensions: [] });
  return new Promise((ok, fallo) => { ws.on('open', () => ok(ws)); ws.on('error', (e) => fallo(e)); });
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    this.ws.on('message', (e) => {
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

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluar(cdp, sesion, expr) {
  const r = await cdp.comando('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sesion);
  if (r.exceptionDetails) throw new Error(`eval fallo: ${r.exceptionDetails.text}`);
  return r.result?.value;
}

/** Estado de la UI del lobby, con la geometría que importa. */
const INFORME_LOBBY = `(() => {
  const dock = document.getElementById('actionDock');
  const lobby = document.getElementById('lobby');
  const d = dock.getBoundingClientRect();
  const cs = getComputedStyle(dock);
  const visible = (el) => {
    const c = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return c.display !== 'none' && c.visibility !== 'hidden' && r.height > 0;
  };
  const botones = [...lobby.querySelectorAll('button')].filter(visible).map(el => {
    const r = el.getBoundingClientRect();
    return {
      id: el.id,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      tapado: r.bottom > d.top && r.top < d.bottom && r.right > d.left && r.left < d.right,
      fuera: r.bottom > window.innerHeight || r.top < 0,
    };
  });
  return {
    bodyClass: document.body.className,
    dockDisplay: cs.display,
    dockRect: { top: Math.round(d.top), bottom: Math.round(d.bottom), height: Math.round(d.height) },
    actionsEn: document.querySelector('.actions-content')?.parentElement?.id ?? null,
    lobbyRect: { top: Math.round(lobby.getBoundingClientRect().top), bottom: Math.round(lobby.getBoundingClientRect().bottom) },
    innerH: window.innerHeight,
    botones,
  };
})()`;

async function main() {
  const chromium = localizarChromium();
  const perfil = mkdtempSync(join(tmpdir(), 'mazerpg-ui-movil-'));
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PUERTO), '--strictPort'], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  await esperarPreview(PUERTO);
  console.log(`[smoke] dist servido en http://localhost:${PUERTO}/ (viewport ${VP_W}x${VP_H})`);

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
  const { targetId } = await cdp.comando('Target.createTarget', { url: `http://localhost:${PUERTO}/` });
  const { sessionId } = await cdp.comando('Target.attachToTarget', { targetId, flatten: true });
  await cdp.comando('Runtime.enable', {}, sessionId);
  await cdp.comando('Page.enable', {}, sessionId);
  await cdp.comando('Emulation.setDeviceMetricsOverride', {
    width: VP_W, height: VP_H, deviceScaleFactor: 1, mobile: false,
  }, sessionId);

  let fallos = 0;
  const pase = (n) => console.log(`  PASS ${n}`);
  const pana = (n, extra = '') => { console.error(`  FALLO ${n} ${extra}`); fallos++; };

  try {
    for (let i = 0; i < 80; i++) {
      if (await evaluar(cdp, sessionId, `!!window.game`)) break;
      await SLEEP(250);
    }
    await SLEEP(800);

    // 1. Al cargar, en el lobby, no hay dock de acciones.
    const carga = await evaluar(cdp, sessionId, INFORME_LOBBY);
    if (carga.dockDisplay === 'none') pase('al cargar el dock está oculto');
    else pana('al cargar el dock está oculto', `→ display=${carga.dockDisplay}`);
    if (carga.botones.some((b) => b.tapado)) pana('al cargar nada del lobby está tapado', `→ ${carga.botones.filter((b) => b.tapado).map((b) => b.id)}`);
    else pase('al cargar nada del lobby está tapado');
    if (carga.botones.some((b) => b.fuera)) pana('al cargar todo el lobby cabe en pantalla', `→ ${carga.botones.filter((b) => b.fuera).map((b) => b.id)}`);
    else pase('al cargar todo el lobby cabe en pantalla');

    // 2. Tras un resize (barra de direcciones en móvil) el dock sigue oculto.
    await cdp.comando('Emulation.setDeviceMetricsOverride', {
      width: VP_W, height: VP_H - 64, deviceScaleFactor: 1, mobile: false,
    }, sessionId);
    await SLEEP(1000);
    const trasResize = await evaluar(cdp, sessionId, INFORME_LOBBY);
    if (trasResize.dockDisplay === 'none') pase('tras resize el dock sigue oculto');
    else pana('tras resize el dock sigue oculto', `→ display=${trasResize.dockDisplay} body="${trasResize.bodyClass}"`);
    if (trasResize.botones.some((b) => b.tapado)) pana('tras resize nada del lobby está tapado', `→ ${trasResize.botones.filter((b) => b.tapado).map((b) => b.id)}`);
    else pase('tras resize nada del lobby está tapado');
    if (trasResize.botones.some((b) => b.fuera)) pana('tras resize todo el lobby cabe en pantalla', `→ ${trasResize.botones.filter((b) => b.fuera).map((b) => b.id)}`);
    else pase('tras resize todo el lobby cabe en pantalla');

    // 3. Arrancar partida: el dock sí aparece.
    await evaluar(cdp, sessionId, `document.getElementById('btnSolo').click()`);
    await SLEEP(600);
    await evaluar(cdp, sessionId, `document.querySelector('.diff-btn[data-diff="facil"]').click()`);
    await SLEEP(2500);
    const enJuego = await evaluar(cdp, sessionId, `getComputedStyle(document.getElementById('actionDock')).display`);
    if (enJuego !== 'none') pase('en partida el dock está visible');
    else pana('en partida el dock está visible', `→ display=${enJuego}`);

    // 3b. En partida, un resize no debe apagar el dock ni la banda inferior.
    await cdp.comando('Emulation.setDeviceMetricsOverride', {
      width: VP_W, height: VP_H - 40, deviceScaleFactor: 1, mobile: false,
    }, sessionId);
    await SLEEP(1000);
    const enJuegoResize = await evaluar(cdp, sessionId, `({
      display: getComputedStyle(document.getElementById('actionDock')).display,
      banda: window.game.config.ALTO_UI_BOTTOM,
    })`);
    if (enJuegoResize.display !== 'none') pase('en partida el resize no apaga el dock');
    else pana('en partida el resize no apaga el dock', `→ display=${enJuegoResize.display}`);
    if (enJuegoResize.banda > 0) pase('en partida la banda inferior se mide');
    else pana('en partida la banda inferior se mide', `→ ALTO_UI_BOTTOM=${enJuegoResize.banda}`);

    // 4. Volver al lobby: el dock se oculta.
    await evaluar(cdp, sessionId, `window.game.lobbyManager.showModo()`);
    await SLEEP(800);
    const deVuelta = await evaluar(cdp, sessionId, INFORME_LOBBY);
    if (deVuelta.dockDisplay === 'none') pase('al volver al lobby el dock se oculta');
    else pana('al volver al lobby el dock se oculta', `→ display=${deVuelta.dockDisplay}`);
    if (deVuelta.botones.some((b) => b.tapado)) pana('al volver al lobby nada está tapado', `→ ${deVuelta.botones.filter((b) => b.tapado).map((b) => b.id)}`);
    else pase('al volver al lobby nada está tapado');
  } catch (e) {
    console.error('  ERROR', e.message);
    fallos++;
  }

  try { process.kill(-preview.pid); } catch {}
  try { chrome.kill(); } catch {}
  console.log(fallos === 0 ? '\n[smoke] OK' : `\n[smoke] ${fallos} FALLO(S)`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
