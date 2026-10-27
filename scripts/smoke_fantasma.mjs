/**
 * Smoke F5 (HTTP, 2 clientes): fantasma, host-espectador, resurrección, roster.
 *
 * 1. Host + invitado. El host muere → fantasma, sigue host y no migra.
 * 2. El invitado ve el fantasma y su cuerpo.
 * 3. El invitado, adyacente al cuerpo y con pócima, resucita al host (50 % + inmunidad).
 * 4. Ambos mueren → dos fantasmas; la partida NO termina.
 * 5. El host fantasma abandona → el invitado se promociona a host.
 *
 * Uso: node scripts/smoke_fantasma.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUERTO_PREVIEW = 4328;
const PUERTO_SIGNALING = 8101;
const SIGNALING_URL = `http://localhost:${PUERTO_SIGNALING}`;
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

function esperarPuerto(puerto, etiqueta, intentos = 100) {
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
    this.listeners = [];
    ws.on('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { ok, fallo } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) fallo(new Error(msg.error.message)); else ok(msg.result);
        return;
      }
      for (const l of this.listeners) l(msg);
    });
  }
  on(escucha) { this.listeners.push(escucha); }
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

function ok(condicion, mensaje) {
  if (!condicion) throw new Error(`FALLO: ${mensaje}`);
  console.log(`ok - ${mensaje}`);
}

async function main() {
  const chromium = localizarChromium();
  const perfil = mkdtempSync(join(tmpdir(), 'mazerpg-smoke-fantasma-'));
  let signaling = null;
  let preview = null;
  let chrome = null;
  let cdp = null;
  const contextos = [];
  const logs = new Map();
  const paginas = new Map();

  try {
    signaling = spawn('node', ['server/signaling.mjs'], {
      cwd: RAIZ, stdio: 'ignore', detached: true,
      env: { ...process.env, PORT: String(PUERTO_SIGNALING) },
    });
    preview = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PUERTO_PREVIEW), '--strictPort'], {
      cwd: RAIZ, stdio: ['ignore', 'ignore', 'pipe'], detached: true,
    });
    await esperarPuerto(PUERTO_SIGNALING, 'signaling');
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
    cdp = new Cdp(await conectarWs(wsUrl));

    cdp.on((msg) => {
      const clave = msg.sessionId || '?';
      if (!logs.has(clave)) logs.set(clave, []);
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        logs.get(clave).push(`[EXCEPTION] ${d.text} ${d.exception?.description || ''}`);
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const texto = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
        if (texto.includes('pisó el portal')) return;
        logs.get(clave).push(`[${msg.params.type}] ${texto}`);
      }
    });

    async function nuevoContexto() {
      const { browserContextId } = await cdp.comando('Target.createBrowserContext', { disposeOnDetach: true });
      contextos.push(browserContextId);
      return { browserContextId, sesiones: [] };
    }

    async function abrirPagina(contexto) {
      const { targetId } = await cdp.comando('Target.createTarget', { url: URL_JUEGO, browserContextId: contexto.browserContextId });
      const { sessionId } = await cdp.comando('Target.attachToTarget', { targetId, flatten: true });
      await cdp.comando('Runtime.enable', {}, sessionId);
      await cdp.comando('Page.enable', {}, sessionId);
      await esperar(cdp, sessionId, '!!window.game', 20000, 'window.game');
      await evaluar(cdp, sessionId, `window.SIGNALING_SERVER_URL = ${JSON.stringify(SIGNALING_URL)}; true`);
      contexto.sesiones.push(sessionId);
      const pagina = { targetId, sessionId };
      paginas.set(sessionId, pagina);
      return pagina;
    }

    async function prepararJugador(pagina, nombre) {
      await evaluar(cdp, pagina.sessionId, `window.game.protagonista.nombre = ${JSON.stringify(nombre)}; true`);
      await evaluar(cdp, pagina.sessionId, `document.querySelector('.modo-card[data-mode="http"]')?.click()`);
      await SLEEP(300);
      await evaluar(cdp, pagina.sessionId, `document.getElementById('btnContinuarPersonaje')?.click()`);
      await SLEEP(300);
    }

    const ctxHost = await nuevoContexto();
    const ctxGuest = await nuevoContexto();
    const host = await abrirPagina(ctxHost);
    const guest = await abrirPagina(ctxGuest);

    await prepararJugador(host, 'Host');
    await evaluar(cdp, host.sessionId, `document.getElementById('btnCrearPartida').click()`);
    await SLEEP(300);
    await evaluar(cdp, host.sessionId, `document.querySelector('.diff-btn[data-diff="facil"]')?.click()`);
    await esperar(cdp, host.sessionId, '!!window.game.networkHttp?.idPartidaActual && window.game.motorIniciado', 20000, 'host crea partida');
    const roomId = await evaluar(cdp, host.sessionId, 'window.game.networkHttp.idPartidaActual');
    const epoch0 = await evaluar(cdp, host.sessionId, 'window.game.hostEpoch');
    ok(typeof roomId === 'string' && roomId.length > 0, `partida HTTP creada (${roomId})`);

    await prepararJugador(guest, 'Guest');
    await evaluar(cdp, guest.sessionId, `document.getElementById('btnUnirseLobby').click()`);
    await esperar(cdp, guest.sessionId, `document.querySelector('.join-btn[data-id="${roomId}"]') !== null`, 20000, 'lista de partidas');
    await evaluar(cdp, guest.sessionId, `document.querySelector('.join-btn[data-id="${roomId}"]').click()`);
    await esperar(cdp, guest.sessionId, 'window.game.motorIniciado && window.game.mpActivo && window.game.remotosActivos.size >= 1', 25000, 'conexión invitado');
    await esperar(cdp, host.sessionId, 'window.game.remotosActivos.size >= 1', 25000, 'host ve al invitado');
    ok(true, 'host + invitado conectados');

    // 1. Mata al host.
    await evaluar(cdp, host.sessionId, `window.game.protagonista.inmunidadHasta = 0; window.game.protagonista.recibirDano(99999); true`);
    await esperar(cdp, host.sessionId, `window.game.protagonista.estadoVida === 'fantasma'`, 8000, 'host fantasma');
    const epoch1 = await evaluar(cdp, host.sessionId, 'window.game.hostEpoch');
    ok(await evaluar(cdp, host.sessionId, 'window.game.esHost === true'), 'el host muerto sigue siendo host');
    ok(epoch1 === epoch0, 'la muerte no dispara migración (epoch igual)');
    const body = await evaluar(cdp, host.sessionId, 'JSON.stringify([window.game.protagonista.cuerpoF, window.game.protagonista.cuerpoC])');
    const [bodyF, bodyC] = JSON.parse(body);
    ok(Number.isInteger(bodyF) && Number.isInteger(bodyC), `cuerpo anclado en (${bodyF},${bodyC})`);

    // 2. El invitado ve el fantasma y su cuerpo.
    await esperar(cdp, guest.sessionId, `Array.from(window.game.remotosActivos.values()).some(j => j.entidad && j.entidad.estadoVida === 'fantasma' && j.entidad.cuerpoF != null)`, 12000, 'invitado ve fantasma y cuerpo');
    ok(true, 'el invitado ve al host fantasma y su cuerpo');

    // 3. Invitado adyacente al cuerpo con pócima → resurrección.
    const [gf, gc] = [bodyF, bodyC + 1];
    await evaluar(cdp, guest.sessionId, `window.game.protagonista.fila = ${gf}; window.game.protagonista.columna = ${gc}; window.game.protagonista.visualFila = ${gf}; window.game.protagonista.visualColumna = ${gc}; window.game.protagonista.inventario.pocima_resurreccion = 1; true`);
    await evaluar(cdp, host.sessionId, `(() => { const e = Array.from(window.game.remotosActivos.values()).map(j => j.entidad).find(e => e && e.playerId && e.playerId !== window.game.playerId); if (e) { e.fila = ${gf}; e.columna = ${gc}; } return true; })()`);
    await SLEEP(300);
    await evaluar(cdp, guest.sessionId, `window.game.usarItem('pocima_resurreccion'); true`);
    await esperar(cdp, host.sessionId, `window.game.protagonista.estadoVida === 'vivo' && window.game.protagonista.vidaActual > 0`, 10000, 'host resucitado');
    const hp = await evaluar(cdp, host.sessionId, 'window.game.protagonista.vidaActual');
    const hpMax = await evaluar(cdp, host.sessionId, 'window.game.protagonista.vidaMaxima');
    ok(hp === Math.max(1, Math.floor(hpMax * 0.5)), `resucita al 50 % (${hp}/${hpMax})`);
    await esperar(cdp, guest.sessionId, `(window.game.protagonista.inventario.pocima_resurreccion ?? 0) === 0`, 5000, 'pócima consumida');
    ok(true, 'el invitado consume la pócima');

    // 4. Ambos fantasmas → la partida no termina.
    await evaluar(cdp, host.sessionId, `(() => { const e = Array.from(window.game.remotosActivos.values()).map(j => j.entidad).find(e => e && e.playerId && e.playerId !== window.game.playerId); if (e) { e.inmunidadHasta = 0; e.recibirDano(99999); } return true; })()`);
    await evaluar(cdp, host.sessionId, `window.game.protagonista.inmunidadHasta = 0; window.game.protagonista.recibirDano(99999); true`);
    await evaluar(cdp, guest.sessionId, `window.game.protagonista.inmunidadHasta = 0; window.game.protagonista.recibirDano(99999); true`);
    await esperar(cdp, host.sessionId, `window.game.protagonista.estadoVida === 'fantasma'`, 8000, 'host fantasma de nuevo');
    await esperar(cdp, host.sessionId, `Array.from(window.game.remotosActivos.values()).some(j => j.entidad && j.entidad.estadoVida === 'fantasma')`, 8000, 'invitado fantasma en el host');
    await SLEEP(2500);
    ok(await evaluar(cdp, host.sessionId, 'window.game.juegoTerminado === false'), 'dos fantasmas no cierran la partida');
    await esperar(cdp, guest.sessionId, `document.getElementById('fantasmaUI')?.style.display === 'flex'`, 8000, 'overlay fantasma visible');
    ok(true, 'overlay de fantasma visible en el invitado');

    // 5. Host fantasma abandona → migración al invitado.
    await evaluar(cdp, host.sessionId, 'window.confirm = () => true; window.game.abandonarFantasma(); true');
    await esperar(cdp, guest.sessionId, 'window.game.esHost === true', 40000, 'invitado promocionado a host');
    ok(true, 'el host fantasma abandona y migra el host');

    console.log('\nSMOKE FANTASMA: OK');
  } catch (e) {
    console.error('\nSMOKE FANTASMA: FALLO');
    console.error(e?.stack || e);
    for (const [sesion, lineas] of logs) {
      console.error(`--- logs ${sesion} ---`);
      for (const l of lineas.slice(-120)) console.error(l);
    }
    for (const [sesion, pagina] of paginas) {
      try {
        const dbg = await evaluar(cdp, sesion, `JSON.stringify({
          mp: window.game?.mpActivo,
          esHost: window.game?.esHost,
          hostEpoch: window.game?.hostEpoch,
          estado: window.game?.protagonista?.estadoVida,
          hp: window.game?.protagonista?.vidaActual,
          cuerpo: [window.game?.protagonista?.cuerpoF, window.game?.protagonista?.cuerpoC],
          remotos: window.game ? Array.from(window.game.remotosActivos.entries()).map(([id, j]) => ({ id, estado: j.entidad?.estadoVida, f: j.entidad?.fila, c: j.entidad?.columna, cuerpo: [j.entidad?.cuerpoF, j.entidad?.cuerpoC], pid: j.entidad?.playerId })) : [],
          fin: window.game?.juegoTerminado,
          espera: window.game?.esperaInfo,
          overlay: document.getElementById('fantasmaUI')?.style.display,
          logs: (document.getElementById('logTextArea')?.value || '').slice(-1200)
        })`);
        console.error(`--- estado ${sesion} (${pagina.targetId}) ---`);
        console.error(dbg);
      } catch (e2) {
        console.error(`--- estado ${sesion}: no disponible (${e2?.message || e2}) ---`);
      }
    }
    process.exitCode = 1;
  } finally {
    try { if (cdp) for (const ctx of contextos) await cdp.comando('Target.disposeBrowserContext', { browserContextId: ctx }).catch(() => {}); } catch {}
    try { if (chrome) chrome.kill('SIGKILL'); } catch {}
    try { if (preview) process.kill(-preview.pid, 'SIGKILL'); } catch {}
    try { if (signaling) process.kill(-signaling.pid, 'SIGKILL'); } catch {}
    try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  }
}

main();
