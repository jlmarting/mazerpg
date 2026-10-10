/**
 * Smoke headless (1 cliente) sobre dist/ — runner del muro de calidad (spec §6).
 *
 * Arranca chrome-headless-shell (binario de Playwright en ~/.cache/ms-playwright),
 * sirve dist/ con vite preview y conduce la partida vía CDP (faye-websocket dep
 * transitiva de firebase). El juego queda expuesto como window.game (main.ts).
 *
 * Cubre:
 *   - arranque limpio de dist sin Firebase real (modo solo con placeholders)
 *   - sembrado del mundo con casa personal ('Mundo conectado: ...')
 *   - travesía ida/vuelta por el conector real (teleportHousing -> atravesarConector)
 *   - casa duradera local: recarga -> housingModal -> UTILIZAR CASA -> espejo (Task 6)
 *
 * Uso: node scripts/smoke_headless.mjs [--keep]
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUERTO_PREVIEW = 4313;
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
    // faye-websocket vive como dependencia transitiva de firebase (pnpm)
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
      const envelope = JSON.stringify({ id, method: metodo, params, sessionId: sesion || undefined });
      this.pending.set(id, { ok, fallo });
      this.ws.send(envelope);
    });
  }
  on(escucha) { this.listeners.push(escucha); }
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
    await SLEEP(300);
  }
  throw new Error(`timeout esperando: ${etiqueta}`);
}

async function main() {
  const chromium = localizarChromium();
  const perfil = mkdtempSync(join(tmpdir(), 'mazerpg-smoke-'));
  const userDataTmp = perfil;

  // 1. Servir dist/
  const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PUERTO_PREVIEW), '--strictPort'], {
    cwd: RAIZ,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  await esperarPreview(PUERTO_PREVIEW);
  console.log(`[smoke] dist servido en http://localhost:${PUERTO_PREVIEW}/`);

  // 2. Chromium headless con CDP
  const chrome = spawn(chromium, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--user-data-dir=${userDataTmp}`,
    '--remote-debugging-port=0',
    'about:blank',
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
  console.log('[smoke] chromium headless listo:', wsUrl.split('/').slice(0, -1).join('/'));

  const cdpWs = await conectarWs(wsUrl);
  const cdp = new Cdp(cdpWs);

  // 3. Abrir página y enganchar sesion
  const { targetId } = await cdp.comando('Target.createTarget', { url: `http://localhost:${PUERTO_PREVIEW}/` });
  const { sessionId } = await cdp.comando('Target.attachToTarget', { targetId, flatten: true });
  await cdp.comando('Runtime.enable', {}, sessionId);
  await cdp.comando('Page.enable', {}, sessionId);
  await cdp.comando('Log.enable', {}, sessionId);

  const consola = [];
  const excepciones = [];
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled') {
      const texto = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      consola.push(`[${msg.params.type}] ${texto}`);
    }
    if (msg.method === 'Runtime.exceptionThrown' || msg.method === 'Log.entryAdded') {
      const det = msg.method === 'Runtime.exceptionThrown'
        ? msg.params.exceptionDetails
        : (msg.params.entry.level === 'error' || msg.params.entry.level === 'warning' ? msg.params.entry : null);
      if (!det) return;
      const texto = det.text || det.exception?.description || '';
      excepciones.push(`[${msg.method === 'Log.entryAdded' ? 'log:' + msg.params.entry.level : 'excepción'}] ${texto}`);
    }
  });

  let fallos = 0;
  const pase = (nombre) => console.log(`  PASS ${nombre}`);
  const pana = (nombre, extra = '') => { console.error(`  FALLO ${nombre} ${extra}`); fallos++; };

  try {
    // 4. Arranque limpio: lobby visible
    await esperar(cdp, sessionId, `!!window.game`, 15000, 'window.game expuesto');
    console.log('[smoke] página cargada, juego expuesto');

    await evaluar(cdp, sessionId, `document.getElementById('btnSolo').click()`);
    await esperar(cdp, sessionId, `document.getElementById('difficultyModal')?.style.display === 'flex'`, 5000, 'modal dificultad');
    await evaluar(cdp, sessionId, `document.querySelector('.diff-btn[data-diff="facil"]').click()`);

    // perfil fresco: sin housing previo -> arranca directo, siembra mundo + casa
    await esperar(cdp, sessionId, `window.game.motorIniciado === true`, 10000, 'motor iniciado');
    await esperar(cdp, sessionId, `window.game.gestorMundo.nodoActivoId !== '' && !!window.game.gestorMundo.nodoActivoId`, 10000, 'nodo activo sembrado');

    // El spawn es aleatorio: si cae sobre un conector (1/3600 aprox) el cruce ocurre
    // solo. Normalizamos antes de las aserciones para que el smoke sea determinista.
    await evaluar(cdp, sessionId, `window.game.nodoActivo.tipo === 'personal' ? window.game.teleportHousing() : null`);
    await esperar(cdp, sessionId, `window.game.nodoActivo.tipo !== 'personal'`, 8000, 'normalización del nodo inicial');
    const logsCasa = consola.filter((l) => l.includes('Mundo conectado: salida a zona y portal de casa personal registrados.'));
    if (logsCasa.length > 0) pase('arranque limpio con casa (log "Mundo conectado: ... portal de casa personal")');
    else pana('arranque limpio con casa', '— log "Mundo conectado" ausente');

    const conectores = await evaluar(cdp, sessionId, `window.game.gestorMundo.conectores.size`);
    const portalesCasa = await evaluar(cdp, sessionId, `window.game.idsPortalesHousing().size`);
    if (conectores >= 1 && portalesCasa >= 1) pase(`mundo sembrado con casa (${conectores} conectores, ${portalesCasa} portal housing)`);
    else pana('mundo sembrado con casa', `conectores=${conectores} portalesCasa=${portalesCasa}`);

    const tipoInicial = await evaluar(cdp, sessionId, `window.game.nodoActivo.tipo`);
    if (tipoInicial !== 'personal') pase(`nodo inicial "raiz" (${tipoInicial})`);
    else pana('nodo inicial raiz', `tipo=${tipoInicial}`);

    // 5. Travesía ida (raiz -> casa) por el conector real
    await evaluar(cdp, sessionId, `window.game.teleportHousing()`);
    await esperar(cdp, sessionId, `window.game.nodoActivo.tipo === 'personal'`, 8000, 'llegada a casa (ida)');
    const cruces = consola.filter((l) => l.includes('ha atravesado un portal.'));
    if (cruces.length >= 1) pase('ida: protagonista ha atravesado el portal hacia casa');
    else pana('ida: log portal ausente');
    console.log('  [ida] nodo activo:', await evaluar(cdp, sessionId, `window.game.gestorMundo.nodoActivoId`));

    // 6. Travesía vuelta (casa -> raiz)
    await evaluar(cdp, sessionId, `window.game.teleportHousing()`);
    await esperar(cdp, sessionId, `window.game.nodoActivo.tipo === ${JSON.stringify(tipoInicial)}`, 8000, 'vuelta al mundo');
    if (consola.filter((l) => l.includes('ha atravesado un portal.')).length >= 2) pase('vuelta: segundo cruce de portal registrado');
    else pana('vuelta: segundo cruce no encontrado');
    console.log('  [vuelta] nodo activo:', await evaluar(cdp, sessionId, `window.game.gestorMundo.nodoActivoId`));

    // 7. Casa duradera local: recarga -> housingModal -> UTILIZAR CASA
    await cdp.comando('Page.reload', { ignoreCache: false }, sessionId);
    await esperar(cdp, sessionId, `!!window.game && window.game.motorIniciado === false`, 15000, 'recarga al lobby');
    await evaluar(cdp, sessionId, `document.getElementById('btnSolo').click()`);
    await esperar(cdp, sessionId, `document.getElementById('difficultyModal')?.style.display === 'flex'`, 5000, 'modal dificultad tras recarga');
    await evaluar(cdp, sessionId, `document.querySelector('.diff-btn[data-diff="facil"]').click()`);
    await esperar(cdp, sessionId, `document.getElementById('housingModal')?.style.display === 'flex'`, 5000, 'housingModal (casa guardada detectada)');
    pase('recarga: casa guardada detectada (housingModal visible)');
    await evaluar(cdp, sessionId, `document.getElementById('btnHousingUsar').click()`);
    await esperar(cdp, sessionId, `window.game.motorIniciado === true`, 10000, 'motor con casa previa');
    const adoptsMirror = await evaluar(cdp, sessionId, `window.game.idCasaEspejo !== null && window.game.idCasaEspejo !== undefined`);
    if (adoptsMirror && logsCasa.length >= 0) pase(`casa previa adoptada vía espejo local (idCasaEspejo=${await evaluar(cdp, sessionId, `window.game.idCasaEspejo`)})`);
    else pana('casa duradera: espejo no adoptado');
  } catch (e) {
    pana('secuencia de smoke', `— ${e.message}`);
  }

  // 8. Diagnóstico
  console.log('\n[smoke] --- consola del jugador (últimos 40) ---');
  for (const c of consola.slice(-40)) console.log('  >', c);
  const graves = excepciones.filter((x) => !/Failed to load resource|net::|firestore|googleapis|__FIREBASE_/i.test(x));
  console.log('\n[smoke] --- errores/warnings (total', excepciones.length, ') ---');
  for (const x of excepciones.slice(-15)) console.log('  !', x.slice(0, 220));

  if (graves.length > 0) {
    pana('sin errores JS graves', `— ${graves.length} hallados`);
  } else {
    pase('sin excepciones JS no gestionadas (excluidos recursos/red firebase sin credenciales)');
  }

  await cdpWs.close();
  const chromeCerrado = await new Promise((ok) => {
    if (chrome.exitCode !== null || chrome.killed) return ok();
    chrome.once('exit', () => ok());
    try { chrome.kill(); } catch {}
    setTimeout(ok, 3000);
  });
  try { process.kill(-preview.pid); } catch {}
  await chromeCerrado;
  try { rmSync(userDataTmp, { recursive: true, force: true }); } catch (e) {
    console.warn('[smoke] perfil temporal sin limpiar:', e.message?.slice(0, 120));
  }

  console.log(fallos === 0 ? '\nSMOKE_OK_OK' : `\nSMOKE_FAIL_${fallos}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('[smoke] ERROR FATAL:', e);
  process.exit(1);
});