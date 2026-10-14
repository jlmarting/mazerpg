/**
 * Smoke headless de multijugador FIREBASE (2 clientes reales).
 *
 * Patron de scripts/smoke_trueque.mjs pero con el flujo del lobby Firebase:
 *   H1 (host): MULTIJUGADOR → CREAR (dificultad fácil) → sala en Firestore.
 *   H2 (invitado): MULTIJUGADOR → se une por id vía game.onJoinGame(id,'firebase').
 *
 * Requiere dist/index.html con las claves reales inyectadas CI o scripts/inyectar-config-local.mjs.
 * Uso: SMOKE_PORT=4331 node scripts/smoke_firebase.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
// @ts-nocheck
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUERTO_PREVIEW = Number(process.env.SMOKE_PORT) || 4330;
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

function esperarPuerto(puerto, etiqueta, intentos = 80) {
  return new Promise((ok, fallo) => {
    const t = setInterval(() => {
      try {
        fetch(`http://localhost:${puerto}/`).then((r) => {
          if (r.status < 500) { clearInterval(t); ok(); }
        }).catch(() => {});
      } catch {}
      if (intentos-- <= 0) { clearInterval(t); fallo(new Error(`${etiqueta} no responde en :${puerto}`)); }
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
    this.ws.on('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { ok, fallo } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) fallo(new Error(`${msg.error.message} (${msg.error.code})`));
        else ok(msg.result);
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
  const r = await cdp.comando('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
  }, sesion);
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
    await SLEEP(400);
  }
  throw new Error(`timeout esperando: ${etiqueta}`);
}

async function main() {
  const chromium = localizarChromium();
  const perfil = mkdtempSync(join(tmpdir(), 'mazerpg-smoke-fb-'));

  const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PUERTO_PREVIEW), '--strictPort'], {
    cwd: RAIZ, stdio: ['ignore', 'ignore', 'pipe'], detached: true,
  });
  await esperarPuerto(PUERTO_PREVIEW, 'preview');
  console.log(`[fb] dist con claves en :${PUERTO_PREVIEW}`);

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

  async function abrir(nombre, url = `http://localhost:${PUERTO_PREVIEW}/`) {
    const { targetId } = await cdp.comando('Target.createTarget', { url });
    const { sessionId } = await cdp.comando('Target.attachToTarget', { targetId, flatten: true });
    await cdp.comando('Runtime.enable', {}, sessionId);
    await cdp.comando('Page.enable', {}, sessionId);
    await cdp.comando('Log.enable', {}, sessionId);
    const errores = [];
    cdp.comando('Runtime.consoleAPICalled', {}).catch(() => {});
    // captura de errores de consola del target
    const captura = (msg) => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Log.entryAdded' && (msg.params.entry.level === 'error' || msg.params.entry.level === 'warning')) errores.push(msg.params.entry.text);
      if (msg.method === 'Runtime.exceptionThrown') errores.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || ''));
    };
    // Cdp de este script no tiene listeners globales: hago polling de console.error via evaluate en su lugar
    await esperar(cdp, sessionId, `!!window.game`, 20000, `${nombre}: window.game`);
    return sessionId;
  }

  let fallos = 0;
  const pase = (n) => console.log(`  PASS ${n}`);
  const pana = (n, extra = '') => { console.error(`  FALLO ${n} ${extra}`); fallos++; };

  try {
    // HOST: MULTIJUGADOR (Firebase) + CREAR
    const host = await abrir('host', process.env.SMOKE_HOST_URL || `http://localhost:${PUERTO_PREVIEW}/`);
    await evaluar(cdp, host, `{ document.getElementById('btnModoFirebase')?.click(); }`);
    await evaluar(cdp, host, `{ document.getElementById('btnCrearPartida')?.click(); }`);
    await evaluar(cdp, host, `{ document.querySelector('.diff-btn[data-diff="facil"]')?.click(); }`);
    await SLEEP(1200);
    await evaluar(cdp, host, `document.getElementById('housingModal')?.style.display === 'flex' ? document.getElementById('btnHousingUsar')?.click() : null`);
    await esperar(cdp, host, `window.game.motorIniciado === true`, 30000, 'host: motor iniciado (Firebase)');
    const sala = await evaluar(cdp, host, `window.game.network?.idPartidaActual ?? null`);
    if (sala) pase(`host: sala Firebase creada (${String(sala)})`);
    else pana('host: sala creada', 'network.idPartidaActual null');

    // INVITADO: MULTIJUGADOR (Firebase) + UNIRSE por id — desde donde diga SMOKE_GUEST_URL
    const invitado = await abrir('invitado', process.env.SMOKE_GUEST_URL || `http://localhost:${PUERTO_PREVIEW}/`);
    await evaluar(cdp, invitado, `{ document.getElementById('btnModoFirebase')?.click(); }`);
    await evaluar(cdp, invitado, `window.game.onJoinGame(${JSON.stringify(sala)}, 'firebase')`);
    try {
      await esperar(cdp, invitado, `window.game.motorIniciado === true`, 40000, 'invitado: motor iniciado (Firebase)');
    } catch (e) {
      console.log('  [diag-guest-estado]', await evaluar(cdp, invitado, `JSON.stringify({
        spinner: document.getElementById('connectingOverlay') ? window.document.getElementById('connectingOverlay').style.display : document.querySelector('.connecting-overlay')?.style?.display ?? 'n/a',
        motor: window.game.motorIniciado, sala: window.game.network?.idPartidaActual, mp: window.game.network?.multiplayerActivo,
        cola: window.game.colaDeMensajes.slice(0, 6).join(' | ')
      })`));
      throw e;
    }
    await esperar(cdp, host, `window.game.remotosActivos.size >= 1`, 20000, 'host: invitado visible');
    pase('FB: invitado conectado y visible para el host');

    // MOVIMIENTO básico del invitado (el host debe verlo)
    await evaluar(cdp, invitado, `{ window.game.protagonista.intentarMover(0, 1, window.game); }`);
    await SLEEP(800);
    const posRemota = await evaluar(cdp, host, `(() => { const r = [...window.game.remotosActivos.values()][0]?.entidad; return r ? r.fila + ':' + r.columna : 'sin'; })()`);
    if (posRemota && posRemota !== 'sin') pase(`FB: posición del invitado sincronizada (${posRemota})`);
    else pana('FB: posición del invitado', 'el host no ve movemento remoto');
  } catch (e) {
    pana('secuencia smoke_firebase', `— ${e.message}`);
  }

  console.log(fallos === 0 ? '\nMP_FB_OK' : `\nMP_FB_FAIL_${fallos}`);
  await cdp.ws.close();
  await new Promise((ok) => {
    if (chrome.exitCode !== null || chrome.killed) return ok();
    chrome.once('exit', () => ok());
    try { chrome.kill(); } catch {}
    setTimeout(ok, 3000);
  });
  try { process.kill(-preview.pid); } catch {}
  try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('[smoke_firebase] fallo general:', e.message);
  process.exit(1);
});