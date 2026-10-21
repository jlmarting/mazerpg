/**
 * Smoke de cofres y llaves (F2) sobre dist/.
 *
 * Escenario 1 (solo): cofre de hierro bump-to-open, mensaje sin llave, apertura
 * con llave (+10 oro) y recogida de una llave de acero.
 * Escenario 2 (2 clientes HTTP): el host coloca cofre/llave antes del join; el
 * invitado los ve tras el mapa, y observa el estado abierto y la llave recogida.
 *
 * Uso: node scripts/smoke_cofres.mjs [--keep]
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

const setupCerca = `(() => {
  const g = window.game;
  const f = g.protagonista.fila, c = g.protagonista.columna;
  const dirs = [[0,1],[1,0],[0,-1],[-1,0]];
  const elegido = dirs.find(([df, dc]) => {
    const cel = g.mapaLaberinto[f + df]?.[c + dc];
    return cel && !cel.esPortal && cel.cofre === null && cel.llave === null;
  });
  if (!elegido) throw new Error('sin vecino libre');
  const [df, dc] = elegido;
  const nf = f + df, nc = c + dc;
  const cel = g.mapaLaberinto[nf][nc];
  cel.cofre = 'hierro';
  cel.cofreAbierto = false;
  cel.esTransitable = false;
  return { df, dc, nf, nc };
})()`;

const recogerLlaveCerca = `(() => {
  const g = window.game;
  const f = g.protagonista.fila, c = g.protagonista.columna;
  const dirs = [[0,1],[1,0],[0,-1],[-1,0]];
  const elegido = dirs.find(([df, dc]) => {
    const cel = g.mapaLaberinto[f + df]?.[c + dc];
    return cel && !cel.esPortal && cel.cofre === null;
  });
  if (!elegido) throw new Error('sin vecino para llave');
  const [df, dc] = elegido;
  const nf = f + df, nc = c + dc;
  const actual = g.mapaLaberinto[f][c];
  const cel = g.mapaLaberinto[nf][nc];
  cel.esTransitable = true;
  cel.llave = 'acero';
  if (df === -1) { actual.muros.superior = false; cel.muros.inferior = false; }
  if (df === 1) { actual.muros.inferior = false; cel.muros.superior = false; }
  if (dc === -1) { actual.muros.izquierdo = false; cel.muros.derecho = false; }
  if (dc === 1) { actual.muros.derecho = false; cel.muros.izquierdo = false; }
  g.protagonista.enCombateCon = null;
  g.listaDeEnemigos.forEach((e) => { e.enCombateCon = null; });
  g.listaDeEnemigos = g.listaDeEnemigos.filter((e) => !(e.fila === nf && e.columna === nc));
  g.resolverAccion(g.idLocalActivo, { tipo: 'mover', df, dc });
  return {
    llave: g.protagonista.inventario.llave_acero ?? 0,
    celda: g.mapaLaberinto[nf][nc].llave,
  };
})()`;

function prepararHostCofreYLLave(cdp, host) {
  return evaluar(cdp, host, `(() => {
    const g = window.game;
    const f = g.protagonista.fila, c = g.protagonista.columna;
    const libres = [];
    for (const [df, dc] of [[0,1],[1,0],[0,-1],[-1,0]]) {
      const cel = g.mapaLaberinto[f + df]?.[c + dc];
      if (cel && !cel.esPortal && cel.cofre === null && cel.llave === null) libres.push([df, dc, f + df, c + dc]);
    }
    if (libres.length < 2) throw new Error('sin dos vecinos libres');
    const [dfC, dcC, nfC, ncC] = libres[0];
    const [dfL, dcL, nfL, ncL] = libres[1];
    const celC = g.mapaLaberinto[nfC][ncC];
    celC.cofre = 'hierro'; celC.cofreAbierto = false; celC.esTransitable = false;
    const celL = g.mapaLaberinto[nfL][ncL];
    celL.esTransitable = true; celL.llave = 'acero';
    const actual = g.mapaLaberinto[f][c];
    if (dfL === -1) { actual.muros.superior = false; celL.muros.inferior = false; }
    if (dfL === 1) { actual.muros.inferior = false; celL.muros.superior = false; }
    if (dcL === -1) { actual.muros.izquierdo = false; celL.muros.derecho = false; }
    if (dcL === 1) { actual.muros.derecho = false; celL.muros.izquierdo = false; }
    return { cofre: { df: dfC, dc: dcC, nf: nfC, nc: ncC }, llave: { df: dfL, dc: dcL, nf: nfL, nc: ncL } };
  })()`);
}

async function main() {
  const chromium = localizarChromium();
  const perfil = mkdtempSync(join(tmpdir(), 'mazerpg-smoke-cofres-'));
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
    const ws = await conectarWs(wsUrl);
    const cdp = new Cdp(ws);

    async function abrirPagina() {
      const { targetId } = await cdp.comando('Target.createTarget', { url: URL_JUEGO });
      const { sessionId } = await cdp.comando('Target.attachToTarget', { targetId, flatten: true });
      await cdp.comando('Runtime.enable', {}, sessionId);
      await esperar(cdp, sessionId, '!!window.game', 15000, 'window.game');
      return sessionId;
    }

    // --- Escenario 1: solo ---
    const solo = await abrirPagina();
    await evaluar(cdp, solo, `document.getElementById('btnSolo').click()`);
    await esperar(cdp, solo, `document.getElementById('difficultyModal')?.style.display === 'flex'`, 5000, 'modal dificultad');
    await evaluar(cdp, solo, `document.querySelector('.diff-btn[data-diff="facil"]').click()`);
    await esperar(cdp, solo, 'window.game.motorIniciado === true', 10000, 'motor solo');

    const cerca = await evaluar(cdp, solo, setupCerca);
    await evaluar(cdp, solo, `(() => {
      const g = window.game;
      g.protagonista.enCombateCon = null;
      g.listaDeEnemigos.forEach((e) => { e.enCombateCon = null; });
      g.listaDeEnemigos = g.listaDeEnemigos.filter((e) => !(e.fila === ${cerca.nf} && e.columna === ${cerca.nc}));
    })()`);
    await evaluar(cdp, solo, `window.game.resolverAccion(window.game.idLocalActivo, { tipo: 'mover', df: ${cerca.df}, dc: ${cerca.dc} })`);
    const sinLlave = await evaluar(cdp, solo, `({
      abierto: window.game.mapaLaberinto[${cerca.nf}][${cerca.nc}].cofreAbierto,
      log: window.game.colaDeMensajes.some((m) => m.includes('necesitas la llave')),
    })`);
    if (sinLlave.abierto || !sinLlave.log) throw new Error('sin llave: no bloqueó o no avisó');

    await evaluar(cdp, solo, `window.game.protagonista.recibirBotin([{ id: 'llave_hierro', cantidad: 1 }])`);
    await evaluar(cdp, solo, `window.game.protagonista.enCombateCon = null; window.game.listaDeEnemigos.forEach((e) => { e.enCombateCon = null; })`);
    const oroAntes = await evaluar(cdp, solo, `window.game.protagonista.inventario.oro ?? 0`);
    await evaluar(cdp, solo, `window.game.resolverAccion(window.game.idLocalActivo, { tipo: 'mover', df: ${cerca.df}, dc: ${cerca.dc} })`);
    const trasAbrir = await evaluar(cdp, solo, `({
      abierto: window.game.mapaLaberinto[${cerca.nf}][${cerca.nc}].cofreAbierto,
      oro: window.game.protagonista.inventario.oro ?? 0,
      bloquea: window.game.mapaLaberinto[${cerca.nf}][${cerca.nc}].esTransitable === false,
    })`);
    if (!trasAbrir.abierto || trasAbrir.oro !== oroAntes + 10 || !trasAbrir.bloquea) {
      throw new Error('apertura con llave incorrecta: ' + JSON.stringify(trasAbrir));
    }

    const trasLlave = await evaluar(cdp, solo, recogerLlaveCerca);
    if (trasLlave.llave !== 1 || trasLlave.celda !== null) {
      throw new Error('recogida de llave incorrecta: ' + JSON.stringify(trasLlave));
    }
    console.log('SMOKE_COFRES_OK');

    // --- Escenario 2: 2 clientes HTTP ---
    const host = await abrirPagina();
    await evaluar(cdp, host, `document.getElementById('btnModoHttp')?.click()`);
    await evaluar(cdp, host, `document.getElementById('btnCrearPartida')?.click()`);
    await evaluar(cdp, host, `document.querySelector('.diff-btn[data-diff="facil"]')?.click()`);
    await SLEEP(1200);
    await evaluar(cdp, host, `document.getElementById('housingModal')?.style.display === 'flex' ? document.getElementById('btnHousingUsar')?.click() : null`);
    await esperar(cdp, host, 'window.game.motorIniciado === true', 20000, 'host motor');
    const sala = await evaluar(cdp, host, `window.game.networkHttp?.idPartidaActual ?? null`);
    if (!sala) throw new Error('host sin sala');

    const posiciones = await prepararHostCofreYLLave(cdp, host);

    const invitado = await abrirPagina();
    await evaluar(cdp, invitado, `document.getElementById('btnModoHttp')?.click()`);
    await evaluar(cdp, invitado, `window.game.onJoinGame(${JSON.stringify(sala)}, 'http')`);
    await esperar(cdp, invitado, 'window.game.motorIniciado === true', 25000, 'invitado motor');
    await esperar(cdp, host, 'window.game.remotosActivos.size >= 1', 15000, 'host ve invitado');
    await esperar(
      cdp,
      invitado,
      `window.game.mapaLaberinto[${posiciones.cofre.nf}]?.[${posiciones.cofre.nc}]?.cofre === 'hierro' && window.game.mapaLaberinto[${posiciones.llave.nf}]?.[${posiciones.llave.nc}]?.llave === 'acero'`,
      15000,
      'invitado recibe mapa con cofre',
    );

    const visto = await evaluar(cdp, invitado, `({
      cofre: window.game.mapaLaberinto[${posiciones.cofre.nf}][${posiciones.cofre.nc}].cofre,
      abierto: window.game.mapaLaberinto[${posiciones.cofre.nf}][${posiciones.cofre.nc}].cofreAbierto,
      llave: window.game.mapaLaberinto[${posiciones.llave.nf}][${posiciones.llave.nc}].llave,
    })`);
    if (visto.cofre !== 'hierro' || visto.abierto !== false || visto.llave !== 'acero') {
      throw new Error('el invitado no recibió cofre/llave: ' + JSON.stringify(visto));
    }

    await evaluar(cdp, host, `window.game.protagonista.recibirBotin([{ id: 'llave_hierro', cantidad: 1 }])`);
    await evaluar(cdp, host, `window.game.protagonista.enCombateCon = null; window.game.listaDeEnemigos.forEach((e) => { e.enCombateCon = null; })`);
    await evaluar(cdp, host, `window.game.resolverAccion(window.game.idLocalActivo, { tipo: 'mover', df: ${posiciones.cofre.df}, dc: ${posiciones.cofre.dc} })`);
    await esperar(cdp, invitado, `window.game.mapaLaberinto[${posiciones.cofre.nf}][${posiciones.cofre.nc}].cofreAbierto === true`, 8000, 'invitado ve cofre abierto');

    await evaluar(cdp, host, `(() => {
      const g = window.game;
      g.protagonista.enCombateCon = null;
      g.listaDeEnemigos.forEach((e) => { e.enCombateCon = null; });
      g.listaDeEnemigos = g.listaDeEnemigos.filter((e) => !(e.fila === ${posiciones.llave.nf} && e.columna === ${posiciones.llave.nc}));
    })()`);
    await evaluar(cdp, host, `window.game.resolverAccion(window.game.idLocalActivo, { tipo: 'mover', df: ${posiciones.llave.df}, dc: ${posiciones.llave.dc} })`);
    await esperar(cdp, invitado, `window.game.mapaLaberinto[${posiciones.llave.nf}][${posiciones.llave.nc}].llave === null`, 8000, 'invitado ve llave recogida');

    console.log('SMOKE_COFRES_MP_OK');
    try { chrome.kill('SIGKILL'); } catch {}
  } finally {
    try { if (preview) process.kill(-preview.pid, 'SIGKILL'); } catch {}
    try { if (signalingPropio && signaling) process.kill(-signaling.pid, 'SIGKILL'); } catch {}
    try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => {
  console.error('SMOKE_COFRES_FALLO:', e.message);
  process.exit(1);
});
