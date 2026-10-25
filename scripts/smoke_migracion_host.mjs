/**
 * Smoke de migración de host (HTTP, 3 clientes).
 *
 * 1. Host + 2 invitados en la misma sala (3 contextos de navegador aislados).
 * 2. El host envía el trigger de migración y se cierra la pestaña.
 * 3. Exactamente un invitado se promociona (hostEpoch +1); el otro se reconecta.
 * 4. El nuevo host sigue enviando mundo/NPCs y ambos ven la corona correcta.
 * 5. El ex-host vuelve (misma sesión/playerId, nuevo connId) y entra como invitado.
 *
 * Uso: node scripts/smoke_migracion_host.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUERTO_PREVIEW = 4326;
const PUERTO_SIGNALING = 8099;
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
  const perfil = mkdtempSync(join(tmpdir(), 'mazerpg-smoke-migracion-'));
  let signaling = null;
  let signalingPropio = false;
  let preview = null;
  let chrome = null;
  let cdp = null;
  const contextos = [];
  const logs = new Map();
  const paginas = new Map();

  try {
    signaling = spawn('node', ['server/signaling.mjs'], {
      cwd: RAIZ,
      stdio: 'ignore',
      detached: true,
      env: { ...process.env, PORT: String(PUERTO_SIGNALING) },
    });
    signalingPropio = true;
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
    const ctxG1 = await nuevoContexto();
    const ctxG2 = await nuevoContexto();
    const host = await abrirPagina(ctxHost);
    const guest1 = await abrirPagina(ctxG1);
    const guest2 = await abrirPagina(ctxG2);

    // 1. Host crea la partida HTTP.
    await prepararJugador(host, 'Host');
    await evaluar(cdp, host.sessionId, `document.getElementById('btnCrearPartida').click()`);
    await SLEEP(300);
    await evaluar(cdp, host.sessionId, `document.querySelector('.diff-btn[data-diff="facil"]')?.click()`);
    await esperar(cdp, host.sessionId, '!!window.game.networkHttp?.idPartidaActual && window.game.motorIniciado', 20000, 'host crea partida');
    const roomId = await evaluar(cdp, host.sessionId, `window.game.networkHttp.idPartidaActual`);
    const hostConnId = await evaluar(cdp, host.sessionId, `window.game.networkHttp.idLocal`);
    ok(typeof roomId === 'string' && roomId.length > 0, `partida HTTP creada (${roomId})`);
    ok(await evaluar(cdp, host.sessionId, 'window.game.esHost === true'), 'el host se declara host');
    ok((await evaluar(cdp, host.sessionId, `document.getElementById('hostBadge').textContent`)).includes('HOST'), 'badge de host visible');

    // 2. Invitados se unen.
    const unir = async (pagina, nombre) => {
      await prepararJugador(pagina, nombre);
      await evaluar(cdp, pagina.sessionId, `document.getElementById('btnUnirseLobby').click()`);
      await esperar(cdp, pagina.sessionId, `document.querySelector('.join-btn[data-id="${roomId}"]') !== null`, 20000, `lista de partidas (${nombre})`);
      await evaluar(cdp, pagina.sessionId, `document.querySelector('.join-btn[data-id="${roomId}"]').click()`);
      await esperar(cdp, pagina.sessionId, 'window.game.motorIniciado && window.game.mpActivo && window.game.remotosActivos.size >= 1', 25000, `conexión (${nombre})`);
      await esperar(cdp, pagina.sessionId, 'window.game.mundoDelHostRecibido === true', 25000, `mundo (${nombre})`);
    };
    await unir(guest1, 'Guest1');
    await unir(guest2, 'Guest2');
    await esperar(cdp, host.sessionId, 'window.game.remotosActivos.size >= 2', 25000, 'host ve a los 2 invitados');
    ok(true, 'host + 2 invitados conectados y con mundo compartido');

    const guest1Conn = await evaluar(cdp, guest1.sessionId, 'window.game.networkHttp.idLocal');
    const guest2Conn = await evaluar(cdp, guest2.sessionId, 'window.game.networkHttp.idLocal');
    ok(guest1Conn !== guest2Conn && guest1Conn !== hostConnId && guest2Conn !== hostConnId, 'tres connId distintos');

    // 3. El host se va: trigger + cierre de pestaña.
    await evaluar(cdp, host.sessionId, `window.game.enviarMultiplayer({ tipo: 'host_migration_trigger', reason: 'smoke' })`);
    await SLEEP(300);
    await cdp.comando('Target.closeTarget', { targetId: host.targetId });

    let ganador = null;
    let perdedor = null;
    const inicio = Date.now();
    while (Date.now() - inicio < 40000) {
      const [e1, e2] = await Promise.all([
        evaluar(cdp, guest1.sessionId, 'window.game.esHost === true'),
        evaluar(cdp, guest2.sessionId, 'window.game.esHost === true'),
      ]);
      if (e1 && e2) throw new Error('FALLO: dos hosts simultáneos tras la migración');
      if (e1 || e2) {
        ganador = e1 ? { pagina: guest1, nombre: 'Guest1' } : { pagina: guest2, nombre: 'Guest2' };
        perdedor = e1 ? { pagina: guest2, nombre: 'Guest2' } : { pagina: guest1, nombre: 'Guest1' };
        break;
      }
      await SLEEP(400);
    }
    ok(!!ganador, `exactamente un nuevo host (${ganador?.nombre}) tras cerrar el host`);

    await esperar(cdp, ganador.pagina.sessionId, 'window.game.hostEpoch >= 2', 10000, 'epoch de host incrementado');
    ok(true, 'el epoch de host avanzó (CAS)');

    await esperar(cdp, perdedor.pagina.sessionId, 'window.game.esHost === false', 10000, 'el perdedor no se autopromociona');
    await esperar(cdp, perdedor.pagina.sessionId, 'window.game.remotosActivos.size >= 1', 25000, 'perdedor reconectado al ganador');
    await esperar(cdp, perdedor.pagina.sessionId, `window.game.hostNick === ${JSON.stringify(ganador.nombre)}`, 15000, 'perdedor ve al nuevo host');
    await esperar(cdp, ganador.pagina.sessionId, 'window.game.remotosActivos.size >= 1', 25000, 'nuevo host ve al superviviente');
    ok(true, 'los supervivientes comparten host y canal');

    const badgeGanador = await evaluar(cdp, ganador.pagina.sessionId, 'document.getElementById("hostBadge").textContent');
    const badgePerdedor = await evaluar(cdp, perdedor.pagina.sessionId, 'document.getElementById("hostBadge").textContent');
    ok(badgeGanador.includes('HOST') && badgeGanador.includes('tú'), `corona del nuevo host (${badgeGanador})`);
    ok(badgePerdedor.includes(ganador.nombre), `corona del invitado apunta al host (${badgePerdedor})`);

    // 4. El nuevo host sigue simulando y el invitado recibe NPCs en movimiento.
    const posiciones = `JSON.stringify(window.game.listaDeEnemigos.slice(0, 12).map((e) => [e.id, e.fila, e.columna]))`;
    const antes = await evaluar(cdp, perdedor.pagina.sessionId, posiciones);
    let movido = false;
    for (let i = 0; i < 20; i++) {
      await SLEEP(500);
      const ahora = await evaluar(cdp, perdedor.pagina.sessionId, posiciones);
      if (ahora !== antes) { movido = true; break; }
    }
    ok(movido, 'los NPCs se actualizan en el invitado tras la migración');

    // 5. El ex-host vuelve (misma sesión/playerId, nueva pestaña) como invitado.
    const hostVuelve = await abrirPagina(ctxHost);
    await evaluar(cdp, hostVuelve.sessionId, 'window.game.reanudarPartida()');
    await esperar(cdp, hostVuelve.sessionId, 'window.game.motorIniciado === true', 25000, 'ex-host vuelve a jugar');
    await esperar(cdp, hostVuelve.sessionId, 'window.game.esHost === false', 10000, 'ex-host no recupera el host');
    await esperar(cdp, hostVuelve.sessionId, 'window.game.remotosActivos.size >= 1', 25000, 'ex-host conectado como invitado');
    await esperar(cdp, hostVuelve.sessionId, 'window.game.mundoDelHostRecibido === true', 25000, 'ex-host recibe el mundo del nuevo host');
    ok(true, 'el ex-host vuelve como invitado y ve el mundo compartido');

    const badgeVuelve = await evaluar(cdp, hostVuelve.sessionId, 'document.getElementById("hostBadge").textContent');
    ok(badgeVuelve.includes(ganador.nombre), `corona del ex-host apunta al host vigente (${badgeVuelve})`);

    console.log('\nSMOKE MIGRACIÓN HOST: OK');
  } catch (e) {
    console.error('\nSMOKE MIGRACIÓN HOST: FALLO');
    console.error(e?.stack || e);
    for (const [sesion, lineas] of logs) {
      console.error(`--- logs ${sesion} ---`);
      for (const l of lineas.slice(-120)) console.error(l);
    }
    for (const [sesion, pagina] of paginas) {
      try {
        const dbg = await evaluar(cdp, sesion, `JSON.stringify({
          modo: window.game?.modoMultijugador,
          room: window.game?.networkHttp?.idPartidaActual,
          mpHttp: window.game?.networkHttp?.multiplayerActivo,
          mp: window.game?.mpActivo,
          remotos: window.game ? Array.from(window.game.remotosActivos.keys()) : [],
          peers: window.game?.networkHttp ? Array.from(window.game.networkHttp.jugadoresRemotos.entries()).map(([id, j]) => ({
            id, pc: j.pc?.connectionState, dc: j.dc?.readyState, edad: Date.now() - (j.creadoEn || 0)
          })) : [],
          callbacks: window.game?.networkHttp?.signaling?.onSignalCallbacks?.length ?? null,
          motor: window.game?.motorIniciado,
          mundo: window.game?.mundoDelHostRecibido,
          esHost: window.game?.esHost,
          hostConocido: window.game?.hostConocidoId,
          hostEpoch: window.game?.hostEpoch,
          hostNick: window.game?.hostNick,
          migrando: window.game?.migracionEnCurso,
          reconectando: window.game?.reconectando,
          coord: !!window.game?.coordinador,
          lobby: document.getElementById('lobby')?.style.display,
          logs: (document.getElementById('logTextArea')?.value || '').slice(-1000)
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
    try { if (signalingPropio && signaling) process.kill(-signaling.pid, 'SIGKILL'); } catch {}
    try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  }
}

main();
