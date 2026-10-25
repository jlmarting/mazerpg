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
const PUERTO_PREVIEW = 4325;
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
    const guest1 = await abrirPagina();
    const guest2 = await abrirPagina();
    const logs = { host: [], guest1: [], guest2: [] };
    cdp.on((msg) => {
      const quien = msg.sessionId === host ? 'host' : msg.sessionId === guest1 ? 'guest1' : msg.sessionId === guest2 ? 'guest2' : null;
      if (!quien) return;
      if (msg.method === 'Runtime.consoleAPICalled') {
        const texto = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
        logs[quien].push(`[${msg.params.type}] ${texto}`);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        logs[quien].push(`[EXCEPTION] ${d.text} ${d.exception?.description || ''}`);
      }
    });

    const guest1Id = await evaluar(cdp, guest1, `window.game.network.idLocal`);
    const guest2Id = await evaluar(cdp, guest2, `window.game.network.idLocal`);

    const nuevaOferta = async () => {
      await evaluar(cdp, host, `document.getElementById('btnCoopHost')?.click()`);
      await SLEEP(500);
      await evaluar(cdp, host, `document.querySelector('.diff-btn[data-diff="facil"]')?.click()`);
      await esperar(cdp, host, `(document.getElementById('manualOfferOut')?.value || '').length > 100`, 20000, 'oferta manual del host');
      return await evaluar(cdp, host, `document.getElementById('manualOfferOut').value`);
    };

    const unirInvitado = async (sesion, oferta) => {
      await evaluar(cdp, sesion, `document.getElementById('btnModoCoop')?.click()`);
      await evaluar(cdp, sesion, `document.getElementById('btnCoopGuest')?.click()`);
      await SLEEP(300);
      await evaluar(cdp, sesion, `(() => { const t = document.getElementById('manualOfferIn'); t.value = ${JSON.stringify(oferta)}; return t.value.length; })()`);
      await evaluar(cdp, sesion, `document.getElementById('btnProcesarOferta')?.click()`);
      await esperar(cdp, sesion, `(document.getElementById('manualAnswerOut')?.value || '').length > 100`, 20000, 'respuesta manual del invitado');
      return await evaluar(cdp, sesion, `document.getElementById('manualAnswerOut').value`);
    };

    const conectar = async (respuesta) => {
      await evaluar(cdp, host, `(() => { const t = document.getElementById('manualAnswerIn'); t.value = ${JSON.stringify(respuesta)}; return t.value.length; })()`);
      await evaluar(cdp, host, `document.getElementById('btnProcesarResp')?.click()`);
    };

    // Primer invitado.
    const oferta1 = await nuevaOferta();
    const tokenOferta1 = await evaluar(cdp, host, `document.getElementById('manualOfferToken')?.textContent || ''`);
    if (!/^[a-z0-9]{6,}$/.test(tokenOferta1)) throw new Error(`token de oferta no visible en el host: ${tokenOferta1}`);

    // Rol: el host no ve la sección de invitado (y el invitado no verá la de host).
    const rolHost = JSON.parse(await evaluar(cdp, host, `JSON.stringify({
      host: document.getElementById('manualHostSection')?.style.display,
      guest: document.getElementById('manualGuestSection')?.style.display
    })`));
    if (rolHost.host === 'none' || rolHost.guest !== 'none') throw new Error(`secciones del host saturadas: ${JSON.stringify(rolHost)}`);

    // QR secuencial: 3 partes y el botón SIGUIENTE cambia la imagen/parte.
    await evaluar(cdp, host, `document.getElementById('btnShowOfferQR')?.click()`);
    await SLEEP(500);
    const qr1 = JSON.parse(await evaluar(cdp, host, `JSON.stringify({
      visible: document.getElementById('qrModal')?.style.display,
      parte: document.getElementById('modalQRPart')?.textContent || '',
      src: document.getElementById('modalQRImage')?.src || ''
    })`));
    if (qr1.visible !== 'flex' || !/PARTE 1\/3/.test(qr1.parte)) throw new Error(`QR parte 1 inválido: ${JSON.stringify(qr1)}`);
    await evaluar(cdp, host, `document.getElementById('btnQRNext')?.click()`);
    await SLEEP(250);
    const qr2 = JSON.parse(await evaluar(cdp, host, `JSON.stringify({
      parte: document.getElementById('modalQRPart')?.textContent || '',
      src: document.getElementById('modalQRImage')?.src || ''
    })`));
    if (!/PARTE 2\/3/.test(qr2.parte) || qr2.src === qr1.src) throw new Error(`QR parte 2 inválido: ${JSON.stringify(qr2)}`);
    await evaluar(cdp, host, `document.getElementById('btnQRNext')?.click()`);
    await SLEEP(250);
    const qr3 = JSON.parse(await evaluar(cdp, host, `JSON.stringify({
      parte: document.getElementById('modalQRPart')?.textContent || '',
      src: document.getElementById('modalQRImage')?.src || ''
    })`));
    if (!/PARTE 3\/3/.test(qr3.parte) || qr3.src === qr2.src) throw new Error(`QR parte 3 inválido: ${JSON.stringify(qr3)}`);
    await evaluar(cdp, host, `document.getElementById('btnCloseQRModal')?.click()`);
    console.log('  PASS QR manual en 3 partes (SIGUIENTE cambia parte y QR)');

    const respuesta1 = await unirInvitado(guest1, oferta1);
    const rolGuest = JSON.parse(await evaluar(cdp, guest1, `JSON.stringify({
      host: document.getElementById('manualHostSection')?.style.display,
      guest: document.getElementById('manualGuestSection')?.style.display
    })`));
    if (rolGuest.guest === 'none' || rolGuest.host !== 'none') throw new Error(`secciones del invitado saturadas: ${JSON.stringify(rolGuest)}`);
    const tokenGuest1 = await evaluar(cdp, guest1, `document.getElementById('manualAnswerToken')?.textContent || ''`);
    if (tokenGuest1 !== tokenOferta1) throw new Error(`token guest1 ${tokenGuest1} != host ${tokenOferta1}`);
    await conectar(respuesta1);
    await esperar(cdp, guest1, `window.game.motorIniciado === true`, 30000, 'guest1 motor');
    await esperar(cdp, guest1, `window.game.mundoSincronizado === true`, 30000, 'guest1 syncing');
    await esperar(cdp, host, `window.game.remotosActivos.size >= 1`, 15000, 'host ve guest1');

    const hostTras1 = JSON.parse(await evaluar(cdp, host, `JSON.stringify({
      remotos: [...window.game.remotosActivos.entries()].map(([id, info]) => ({ id, dc: info.dc?.readyState ?? null, entidad: !!info.entidad }))
    })`));
    if (hostTras1.remotos.length !== 1) throw new Error(`host con ${hostTras1.remotos.length} entradas tras guest1: ${JSON.stringify(hostTras1.remotos)}`);
    if (hostTras1.remotos.some((r) => String(r.id).startsWith('GUEST_'))) throw new Error(`host conserva la clave provisional: ${JSON.stringify(hostTras1.remotos)}`);
    if (hostTras1.remotos[0].id !== guest1Id) throw new Error(`host no migró al id real: ${JSON.stringify(hostTras1.remotos)} esperado ${guest1Id}`);
    if (hostTras1.remotos[0].dc !== 'open') throw new Error(`dc de guest1 no abierto: ${JSON.stringify(hostTras1.remotos)}`);
    console.log('  PASS guest1 entra; host migra GUEST_* al id real y conserva un único remoto');

    // Segundo invitado.
    const ofertaAnterior = await evaluar(cdp, host, `document.getElementById('manualOfferOut').value`);
    await evaluar(cdp, host, `document.getElementById('btnNuevaOferta')?.click()`);
    await esperar(cdp, host, `(document.getElementById('manualOfferOut')?.value || '').length > 100 && document.getElementById('manualOfferOut').value !== ${JSON.stringify(ofertaAnterior)}`, 20000, 'segunda oferta manual');
    const oferta2 = await evaluar(cdp, host, `document.getElementById('manualOfferOut').value`);
    const respuesta2 = await unirInvitado(guest2, oferta2);
    await conectar(respuesta2);
    await esperar(cdp, guest2, `window.game.motorIniciado === true`, 30000, 'guest2 motor');
    await esperar(cdp, guest2, `window.game.mundoSincronizado === true`, 30000, 'guest2 syncing');
    await esperar(cdp, host, `window.game.remotosActivos.size >= 2`, 15000, 'host ve guest2');

    const hostTras2 = JSON.parse(await evaluar(cdp, host, `JSON.stringify({
      remotos: [...window.game.remotosActivos.entries()].map(([id, info]) => ({ id, dc: info.dc?.readyState ?? null, entidad: !!info.entidad }))
    })`));
    if (hostTras2.remotos.length !== 2) throw new Error(`host con ${hostTras2.remotos.length} entradas tras guest2: ${JSON.stringify(hostTras2.remotos)}`);
    const idsHost = hostTras2.remotos.map((r) => r.id).sort();
    const idsEsperados = [guest1Id, guest2Id].sort();
    if (JSON.stringify(idsHost) !== JSON.stringify(idsEsperados)) throw new Error(`ids del host ${JSON.stringify(idsHost)} != ${JSON.stringify(idsEsperados)}`);
    if (hostTras2.remotos.some((r) => r.dc !== 'open')) throw new Error(`algún dc cerrado: ${JSON.stringify(hostTras2.remotos)}`);
    console.log('  PASS guest2 entra; host mantiene dos remotos reales con dc abierto');

    const guest1State = JSON.parse(await evaluar(cdp, guest1, `JSON.stringify({ motor: window.game.motorIniciado, sync: window.game.mundoSincronizado, mapa: window.game.mapaLaberinto.length, lobby: document.getElementById('lobby')?.style.display })`));
    const guest2State = JSON.parse(await evaluar(cdp, guest2, `JSON.stringify({ motor: window.game.motorIniciado, sync: window.game.mundoSincronizado, mapa: window.game.mapaLaberinto.length, lobby: document.getElementById('lobby')?.style.display })`));
    for (const [nombre, st] of [['guest1', guest1State], ['guest2', guest2State]]) {
      if (!st.motor || !st.sync || st.mapa !== 80) throw new Error(`${nombre} no está dentro: ${JSON.stringify(st)}`);
      if (st.lobby !== 'none') throw new Error(`${nombre} sigue en el lobby: ${JSON.stringify(st)}`);
    }
    console.log('  PASS ambos invitados dentro (motor+sync+mapa 80×80, lobby oculto)');

    // Cerrar el panel manual del host y volver al juego.
    await evaluar(cdp, host, `document.getElementById('btnJugarManual')?.click()`);
    await SLEEP(300);
    const hostUi = JSON.parse(await evaluar(cdp, host, `JSON.stringify({ lobby: document.getElementById('lobby')?.style.display, canvas: document.getElementById('mazeCanvas')?.style.display })`));
    if (hostUi.lobby !== 'none' || hostUi.canvas !== 'block') throw new Error(`host no volvió al juego: ${JSON.stringify(hostUi)}`);
    console.log('  PASS el host cierra el panel manual y vuelve a la partida');

    // Reabrir el panel desde OPCIONES → INVITAR (WebRTC) en plena partida.
    await evaluar(cdp, host, `document.getElementById('btnInvitarCoop')?.click()`);
    await SLEEP(300);
    const hostUi2 = JSON.parse(await evaluar(cdp, host, `JSON.stringify({
      lobby: document.getElementById('lobby')?.style.display,
      manual: document.getElementById('lobbyManual')?.style.display,
      token: document.getElementById('manualOfferToken')?.textContent
    })`));
    if (hostUi2.lobby !== 'flex' || hostUi2.manual !== 'flex') {
      throw new Error(`INVITAR no reabre el panel manual: ${JSON.stringify(hostUi2)}`);
    }
    console.log('  PASS INVITAR (WebRTC) reabre el panel manual con la partida en marcha');

    console.log('SMOKE_COOP_WEBRTC_OK');

  } finally {
    try { if (chrome) chrome.kill('SIGKILL'); } catch {}
    try { if (preview) process.kill(-preview.pid, 'SIGKILL'); } catch {}
    try { if (signalingPropio && signaling) process.kill(-signaling.pid, 'SIGKILL'); } catch {}
    try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => {
  console.error('SMOKE_COOP_WEBRTC_FAIL:', e.message);
  process.exit(1);
});
