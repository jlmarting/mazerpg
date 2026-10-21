/**
 * Smoke de F3 (Balrog + titanio) sobre dist/.
 *
 * 1 cliente: el Balrog aparece, muere, suelta la llave de titanio persistente;
 * se recoge y abre un cofre de titanio (+100 oro).
 * 2 clientes HTTP: el host mata al Balrog; el invitado ve la llave en el suelo,
 * su recogida y la apertura del cofre.
 *
 * Uso: node scripts/smoke_balrog.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUERTO_PREVIEW = 4322;
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

/** Coloca boss y cofre de titanio en vecinos libres; deja al jugador listo. */
const prepararBalrog = `(() => {
  const g = window.game;
  const boss = g.listaDeEnemigos.find((e) => e.tipo === 'Balrog');
  if (!boss) return { error: 'no hay Balrog en la lista' };
  const f = g.protagonista.fila, c = g.protagonista.columna;
  const libres = [];
  for (const [df, dc] of [[0,1],[1,0],[0,-1],[-1,0]]) {
    const cel = g.mapaLaberinto[f + df]?.[c + dc];
    if (cel && !cel.esPortal && cel.cofre === null && cel.llave === null) libres.push([df, dc, f + df, c + dc]);
  }
  if (libres.length < 1) return { error: 'sin vecino libre' };
  const [dfB, dcB, nfB, ncB] = libres[0];
  const actual = g.mapaLaberinto[f][c];
  const celB = g.mapaLaberinto[nfB][ncB];
  const abrirMuro = (df, dc, destino) => {
    if (df === -1) { actual.muros.superior = false; destino.muros.inferior = false; }
    if (df === 1) { actual.muros.inferior = false; destino.muros.superior = false; }
    if (dc === -1) { actual.muros.izquierdo = false; destino.muros.derecho = false; }
    if (dc === 1) { actual.muros.derecho = false; destino.muros.izquierdo = false; }
  };
  abrirMuro(dfB, dcB, celB);
  celB.esTransitable = true;
  boss.fila = nfB; boss.columna = ncB; boss.vidaActual = 1; boss.estaVivo = true;
  // El cofre de titanio queda en la celda de salida del jugador; al volver desde
  // la celda del boss se abre por bump.
  actual.cofre = 'titanio'; actual.cofreAbierto = false; actual.esTransitable = false;
  g.protagonista.fuerza = 200;
  g.protagonista.vidaMaxima = 99999; g.protagonista.vidaActual = 99999;
  return { dfB, dcB, nfB, ncB, nfC: f, ncC: c, bossId: boss.id };
})()`;

const matarBalrog = `(() => {
  const g = window.game;
  const boss = g.listaDeEnemigos.find((e) => e.id === window.__bossId);
  if (!boss) return { error: 'boss no encontrado' };
  boss.vidaActual = 1;
  boss.estaVivo = true;
  g.protagonista.enCombateCon = boss;
  boss.enCombateCon = g.protagonista;
  g.listaDeEnemigos.forEach((e) => { if (e !== boss) e.enCombateCon = null; });
  g.resolverRondaDeCombate(g.protagonista, boss);
  return { vivo: boss.estaVivo, vida: boss.vidaActual };
})()`;

function buscarLlave(expr = 'window.game') {
  return `(() => {
    const g = ${expr};
    for (let f = 0; f < g.mapaLaberinto.length; f++) {
      for (let c = 0; c < g.mapaLaberinto[f].length; c++) {
        if (g.mapaLaberinto[f][c].llave === 'titanio') return { f, c };
      }
    }
    return null;
  })()`;
}

function moverParaInteractuar(nf, nc, accion = 'mover') {
  return `(() => {
    const g = window.game;
    const f = g.protagonista.fila, c = g.protagonista.columna;
    const df = ${nf} - f, dc = ${nc} - c;
    const actual = g.mapaLaberinto[f][c];
    const destino = g.mapaLaberinto[${nf}][${nc}];
    if (df === -1) { actual.muros.superior = false; destino.muros.inferior = false; }
    if (df === 1) { actual.muros.inferior = false; destino.muros.superior = false; }
    if (dc === -1) { actual.muros.izquierdo = false; destino.muros.derecho = false; }
    if (dc === 1) { actual.muros.derecho = false; destino.muros.izquierdo = false; }
    g.protagonista.enCombateCon = null;
    g.listaDeEnemigos.forEach((e) => { e.enCombateCon = null; });
    g.listaDeEnemigos = g.listaDeEnemigos.filter((e) => !(e.fila === ${nf} && e.columna === ${nc}));
    g.resolverAccion(g.idLocalActivo, { tipo: '${accion}', df, dc });
    return { f: g.protagonista.fila, c: g.protagonista.columna };
  })()`;
}

async function main() {
  const chromium = localizarChromium();
  const perfil = mkdtempSync(join(tmpdir(), 'mazerpg-smoke-balrog-'));
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

    const setup = await evaluar(cdp, solo, prepararBalrog);
    if (setup.error) throw new Error(setup.error);
    await evaluar(cdp, solo, `window.__bossId = ${setup.bossId}`);
    const muerte = await evaluar(cdp, solo, matarBalrog);
    if (muerte.vivo) throw new Error('el Balrog no murió: ' + JSON.stringify(muerte));

    const posLlave = await evaluar(cdp, solo, buscarLlave());
    if (!posLlave) throw new Error('no apareció la llave de titanio en el suelo');

    await evaluar(cdp, solo, moverParaInteractuar(posLlave.f, posLlave.c));
    const trasLlave = await evaluar(cdp, solo, `({
      llave: window.game.protagonista.inventario.llave_titanio ?? 0,
      celda: window.game.mapaLaberinto[${posLlave.f}][${posLlave.c}].llave,
    })`);
    if (trasLlave.llave !== 1 || trasLlave.celda !== null) throw new Error('no recogió la llave: ' + JSON.stringify(trasLlave));

    const oroAntes = await evaluar(cdp, solo, `window.game.protagonista.inventario.oro ?? 0`);
    await evaluar(cdp, solo, moverParaInteractuar(setup.nfC, setup.ncC));
    const trasCofre = await evaluar(cdp, solo, `({
      abierto: window.game.mapaLaberinto[${setup.nfC}][${setup.ncC}].cofreAbierto,
      oro: window.game.protagonista.inventario.oro ?? 0,
    })`);
    if (!trasCofre.abierto || trasCofre.oro !== oroAntes + 100) throw new Error('cofre de titanio incorrecto: ' + JSON.stringify(trasCofre));
    console.log('SMOKE_BALROG_OK');

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

    const setupHost = await evaluar(cdp, host, prepararBalrog);
    if (setupHost.error) throw new Error('host: ' + setupHost.error);
    await evaluar(cdp, host, `window.__bossId = ${setupHost.bossId}`);

    const invitado = await abrirPagina();
    await evaluar(cdp, invitado, `document.getElementById('btnModoHttp')?.click()`);
    await evaluar(cdp, invitado, `window.game.onJoinGame(${JSON.stringify(sala)}, 'http')`);
    await esperar(cdp, invitado, 'window.game.motorIniciado === true', 25000, 'invitado motor');
    await esperar(cdp, host, 'window.game.remotosActivos.size >= 1', 15000, 'host ve invitado');

    const muerteHost = await evaluar(cdp, host, matarBalrog);
    if (muerteHost.vivo) throw new Error('host: el Balrog no murió');
    await esperar(cdp, invitado, `!!${buscarLlave()}`, 8000, 'invitado ve llave de titanio');
    const posLlaveGuest = await evaluar(cdp, invitado, buscarLlave());
    if (!posLlaveGuest) throw new Error('invitado sin llave');

    await evaluar(cdp, host, moverParaInteractuar(posLlaveGuest.f, posLlaveGuest.c));
    await esperar(cdp, invitado, `window.game.mapaLaberinto[${posLlaveGuest.f}][${posLlaveGuest.c}].llave === null`, 8000, 'invitado ve llave recogida');

    await evaluar(cdp, host, moverParaInteractuar(setupHost.nfC, setupHost.ncC));
    await esperar(cdp, invitado, `window.game.mapaLaberinto[${setupHost.nfC}][${setupHost.ncC}].cofreAbierto === true`, 8000, 'invitado ve cofre abierto');

    console.log('SMOKE_BALROG_MP_OK');
    try { chrome.kill('SIGKILL'); } catch {}
  } finally {
    try { if (preview) process.kill(-preview.pid, 'SIGKILL'); } catch {}
    try { if (signalingPropio && signaling) process.kill(-signaling.pid, 'SIGKILL'); } catch {}
    try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => {
  console.error('SMOKE_BALROG_FALLO:', e.message);
  process.exit(1);
});
