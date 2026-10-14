/**
 * Smoke headless de comercio F1 (2 clientes) sobre dist/ — runner del muro de calidad.
 *
 * Patron de scripts/smoke_headless.mjs con DOS targets del mismo chromium:
 *   H1 (host): arranca SERVIDOR LOCAL (signaling :8080) y crea sala.
 *   H2 (invitado): se une por id via game.onJoinGame(id,'http').
 * Trueque: invite → accept → offer×2 → confirm×2 → trade_apply aplicado en ambos;
 * luego un cancel en una segunda ronda que no toca inventarios.
 *
 * Uso: node scripts/smoke_trueque.mjs [--keep]
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
// Con SMOKE_URL se prueba contra un servidor ya arriba (p.ej. vite dev :5173)
const URL_OBJETIVO = process.env.SMOKE_URL || `http://localhost:4320/`;
const SIN_PREVIEW = Boolean(process.env.SMOKE_URL);
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
      const envelope = JSON.stringify({ id, method: metodo, params, sessionId: sesion || undefined });
      this.pending.set(id, { ok, fallo });
      this.ws.send(envelope);
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
    await SLEEP(300);
  }
  throw new Error(`timeout esperando: ${etiqueta}`);
}

async function main() {
  const chromium = localizarChromium();
  const perfil = mkdtempSync(join(tmpdir(), 'mazerpg-smoke-trade-'));
  const userDataTmp = perfil;

  // 1. Señalización + preview (el signaling ya puede estar arriba de otra sesión)
  let signaling = null;
  let signalingPropio = false;
  let signalingVivo = false;
  try {
    const r = await fetch('http://localhost:8080/');
    signalingVivo = r.status < 500;
  } catch {}
  if (!signalingVivo) {
    signaling = spawn('node', ['server/signaling.mjs'], { cwd: RAIZ, stdio: 'ignore', detached: true });
    signalingPropio = true;
  }
  if (!SIN_PREVIEW) {
    var preview = spawn('pnpm', ['exec', 'vite', 'preview', '--port', '4320', '--strictPort'], {
      cwd: RAIZ, stdio: ['ignore', 'ignore', 'pipe'], detached: true,
    });
    await esperarPuerto(4320, 'preview');
  }
  await esperarPuerto(8080, 'signaling');
  console.log(`[smoke] signaling :8080 (${signalingPropio ? 'propio' : 'ya estaba'}) + ${URL_OBJETIVO}`);

  // 2. Chromium headless con CDP
  const chrome = spawn(chromium, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--user-data-dir=${userDataTmp}`, '--remote-debugging-port=0', 'about:blank',
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
  console.log('[smoke_trueque] CDP conectado');
  const cdp = new Cdp(cdpWs);

  async function abrirPagina(nombre) {
    const { targetId } = await cdp.comando('Target.createTarget', { url: URL_OBJETIVO });
    console.log(`[smoke_trueque] target ${nombre} creado`);
    const { sessionId } = await cdp.comando('Target.attachToTarget', { targetId, flatten: true });
    console.log(`[smoke_trueque] target ${nombre} adjuntado`);
    await cdp.comando('Runtime.enable', {}, sessionId);
    await cdp.comando('Page.enable', {}, sessionId);
    await cdp.comando('Log.enable', {}, sessionId);
    await awaitPagina(cdp, sessionId, nombre);
    return sessionId;
  }

  async function awaitPagina(cdp, sesion, nombre) {
    await esperar(cdp, sesion, `!!window.game`, 15000, `${nombre}: window.game`);
  }

  let fallos = 0;
  const pase = (nombre) => console.log(`  PASS ${nombre}`);
  const pana = (nombre, extra = '') => { console.error(`  FALLO ${nombre} ${extra}`); fallos++; };

  try {
    // 3. HOST: modo SERVIDOR LOCAL + crear partida (dificultad fácil)
    const host = await abrirPagina('host');
    await evaluar(cdp, host, `document.getElementById('btnModoHttp')?.click()`);
    await evaluar(cdp, host, `document.getElementById('btnCrearPartida')?.click()`);
    await evaluar(cdp, host, `document.querySelector('.diff-btn[data-diff="facil"]')?.click()`);
    // si hay casa previa en el perfil temporal, se utiliza
    await SLEEP(1200);
    await evaluar(cdp, host, `document.getElementById('housingModal')?.style.display === 'flex' ? document.getElementById('btnHousingUsar')?.click() : null`);
    await esperar(cdp, host, `window.game.motorIniciado === true`, 20000, 'host: motor iniciado');
    const sala = await evaluar(cdp, host, `window.game.networkHttp?.idPartidaActual ?? null`);
    if (sala) pase(`host: sala creada (${String(sala).slice(0, 12)}…)`);
    else pana('host: sala creada', 'networkHttp.idPartidaActual null');

    // 4. INVITADO: entra por id directo
    const invitado = await abrirPagina('invitado');
    await evaluar(cdp, invitado, `document.getElementById('btnModoHttp')?.click()`);
    await evaluar(cdp, invitado, `window.game.onJoinGame(${JSON.stringify(sala)}, 'http')`);
    await esperar(cdp, invitado, `window.game.motorIniciado === true`, 25000, 'invitado: motor iniciado');
    await esperar(cdp, host, `window.game.remotosActivos.size >= 1`, 15000, 'host: invitado visible');
    pase('conectados: host ve al invitado (remoto activo)');

    // 5. TRUEQUE FELIZ: host da 1 poción, pide 3 flechas; invitado da 3 flechas, pide 1 poción
    const guestId = await evaluar(cdp, host, `Array.from(window.game.remotosActivos.keys())[0]`);
    await evaluar(cdp, host, `window.game.procesarMensajeTrade({ tipo: 'trade_invite', destino: Array.from(window.game.remotosActivos.keys())[0] }, window.game.idLocalActivo)`);
    await evaluar(cdp, invitado, `{ window.game.enviarMultiplayer({ tipo: 'trade_accept', de: window.game.idLocalActivo }); }`);
    await evaluar(cdp, host, `{
      window.game.procesarMensajeTrade({
        tipo: 'trade_offer',
        da: [{ id: 'pocion_vida', cantidad: 1 }],
        pide: [{ id: 'flecha', cantidad: 3 }],
        export: window.game.protagonista.exportarInventario(),
      }, window.game.idLocalActivo);
    }`);
    await evaluar(cdp, invitado, `{
      window.game.enviarMultiplayer({
        tipo: 'trade_offer',
        da: [{ id: 'flecha', cantidad: 3 }],
        pide: [{ id: 'pocion_vida', cantidad: 1 }],
        export: window.game.protagonista.exportarInventario(),
      });
    }`);
    await evaluar(cdp, invitado, `{
      window.game.enviarMultiplayer({
        tipo: 'trade_confirm',
        da: [{ id: 'flecha', cantidad: 3 }],
        pide: [{ id: 'pocion_vida', cantidad: 1 }],
        export: window.game.protagonista.exportarInventario(),
      });
    }`);
    await evaluar(cdp, host, `{
      window.game.procesarMensajeTrade({
        tipo: 'trade_confirm',
        da: [{ id: 'pocion_vida', cantidad: 1 }],
        pide: [{ id: 'flecha', cantidad: 3 }],
        export: window.game.protagonista.exportarInventario(),
      }, window.game.idLocalActivo);
    }`);

    // 6. Asertar inventarios finales (host instantáneo; invitado por mensaje)
    const invHost = await evaluar(cdp, host, `(window.game.protagonista.inventario.pocion_vida|0) + '/' + (window.game.protagonista.inventario.flecha|0)`);
    if (invHost === '2/23') pase(`host: mochila tras trueque pocion/flecha = ${invHost} (pocion 3-1 / flecha 20+3)`);
    else pana('host: mochila tras trueque', `esperado 2/23, obtuve ${invHost}`);
    await esperar(cdp, invitado, `window.game.protagonista.inventario.flecha === 17 && window.game.protagonista.inventario.pocion_vida === 4`, 12000, 'invitado: mochila aplicada (20-3 / 3+1)');
    pase('invitado: mochila aplicada por trade_apply (flecha 17, pocion 4)');
    const bultoHost = await evaluar(cdp, host, `window.game.protagonista.bulto.length`);
    const invRemotoEnHost = await evaluar(cdp, host, `Array.from(window.game.remotosActivos.values())[0]?.entidad?.inventario?.mochila?.flecha ?? -1`);
    if (invRemotoEnHost === 17) pase('host: inventario del invitado actualizado en su vista remota (17 flechas)');
    else pana('host: inventario del invitado en vista remota', `esperado flecha=17, obtuve ${invRemotoEnHost}`);

    // 7. SEGUNDA RONDA cancelada: invite → confirm invitado → cancel host; sin cambios
    await evaluar(cdp, host, `{
      const gid = Array.from(window.game.remotosActivos.keys())[0];
      window.game.procesarMensajeTrade({ tipo: 'trade_invite', destino: gid }, window.game.idLocalActivo);
      'ok'
    }`);
    await evaluar(cdp, invitado, `{
      window.game.enviarMultiplayer({
        tipo: 'trade_confirm',
        da: [{ id: 'flecha', cantidad: 1 }],
        pide: [{ id: 'pocion_vida', cantidad: 1 }],
        export: window.game.protagonista.exportarInventario(),
      });
    }`);
    await evaluar(cdp, host, `{ window.game.procesarMensajeTrade({ tipo: 'trade_cancel' }, window.game.idLocalActivo); }`);
    await SLEEP(900);
    const invDespuesCancel = await evaluar(cdp, invitado, `(window.game.protagonista.inventario.pocion_vida|0) + '/' + (window.game.protagonista.inventario.flecha|0)`);
    if (invDespuesCancel === '4/17') pase('cancel en segunda ronda: inventarios sin cambios');
    else pana('cancel en segunda ronda', `esperado 4/17, obtuve ${invDespuesCancel}`);
    const activoTrasCancel = await evaluar(cdp, host, `window.game.gestorTrueques.activo()`);
    if (!activoTrasCancel) pase('gestor: tras cancelar no queda trade activo');
    else pana('gestor: tras cancelar', 'sigue activo');

    // 9. RONDA F2 (UI real: OPCIONES → COMERCIAR → modal con clics)
    await evaluar(cdp, host, `{ document.getElementById('btnComerciar')?.click(); }`);
    await esperar(cdp, host, `document.querySelectorAll('#truequeSocios .trueque-socio button').length >= 1`, 5000, 'host: lista de socios');
    await evaluar(cdp, host, `{ document.querySelector('#truequeSocios .trueque-socio button')?.click(); }`);
    await esperar(cdp, invitado, `document.getElementById('truequeModal')?.style.display === 'flex'`, 8000, 'invitado: ventana de invitación visible');
    await evaluar(cdp, invitado, `{ document.getElementById('btnTruequeAceptar')?.click(); }`);
    await esperar(cdp, host, `document.getElementById('truequeModal')?.style.display === 'flex'`, 8000, 'host: ventana de trueque abierta');
    pase('F2: invitación y apertura de ventanas por clics reales');
    // El HOST oferta y confirma PRIMERO (caso manual del mando: confirmación secuencial)
    await evaluar(cdp, host, `{ document.querySelector('#truequeMio .trueque-ofrecer[data-id="pocion_vida"]')?.click(); }`);
    await esperar(cdp, invitado, `(document.querySelector('#truequeOtro .trueque-fila .nombre')?.textContent ?? '').includes('×1')`, 6000, 'invitado: oferta del host visible');
    await evaluar(cdp, host, `{ document.getElementById('btnTruequeConfirmar')?.click(); }`);
    await esperar(cdp, host, `document.getElementById('truequeEstado')?.textContent === 'Confirmado por ti — esperando al otro…'`, 6000, 'host: confirmó primero el host');
    // El invitado oferta DESPUÉS: cambia su cesta → anula el confirm del host → propuesta otra vez
    await evaluar(cdp, invitado, `{
      const btn = document.querySelector('#truequeMio .trueque-ofrecer[data-id="flecha"]');
      for (let i = 0; i < 3; i++) btn?.click();
    }`);
    await esperar(cdp, invitado, `(document.querySelector('#truequeCesta .trueque-fila .nombre')?.textContent ?? '').includes('Flecha ×3')`, 4000, 'invitado: cesta con flecha ×3');
    await esperar(cdp, host, `(document.querySelector('#truequeOtro .trueque-fila .nombre')?.textContent ?? '').includes('Flecha ×3')`, 6000, 'host: cesta del otro visible por trade_offer');
    await esperar(cdp, host, `document.getElementById('truequeEstado')?.textContent === 'Ofertas en la mesa: confirmad ambos cuando estéis de acuerdo.'`, 6000, 'host: confirm anulado tras oferta nueva del invitado');
    await evaluar(cdp, invitado, `{ document.getElementById('btnTruequeConfirmar')?.click(); }`);
    await esperar(cdp, host, `document.getElementById('truequeEstado')?.textContent === 'El otro confirmó — completa tu confirmación.'`, 6000, 'host: estado otro-confirmado');
    await evaluar(cdp, host, `{ document.getElementById('btnTruequeConfirmar')?.click(); }`);
    await esperar(cdp, host, `document.getElementById('truequeModal')?.style.display !== 'flex'`, 8000, 'host: ventana cerrada tras aplicar');
    await esperar(cdp, invitado, `document.getElementById('truequeModal')?.style.display !== 'flex'`, 8000, 'invitado: ventana cerrada tras aplicar');
    const invHostUI = await evaluar(cdp, host, `(window.game.protagonista.inventario.pocion_vida|0) + '/' + (window.game.protagonista.inventario.flecha|0)`);
    if (invHostUI === '1/26') pase(`F2: host mochila tras trueque UI = ${invHostUI} (pocion 2-1 / flecha 23+3)`);
    else pana('F2: host mochila tras trueque UI', `esperado 1/26, obtuve ${invHostUI}`);
    const invGuestUI = await evaluar(cdp, invitado, `(window.game.protagonista.inventario.pocion_vida|0) + '/' + (window.game.protagonista.inventario.flecha|0)`);
    if (invGuestUI === '5/14') pase(`F2: invitado mochila tras trueque UI = ${invGuestUI} (pocion 4+1 / flecha 17-3)`);
    else pana('F2: invitado mochila tras trueque UI', `esperado 5/14, obtuve ${invGuestUI}`);
  } catch (e) {
    pana('secuencia de smoke_trueque', `— ${e.message}`);
  }

  // 8. Diagnóstico y salida
  console.log(fallos === 0 ? '\nTRUEQUE_OK' : `\nTRUEQUE_FAIL_${fallos}`);
  await cdpWs.close();
  const chromeCerrado = await new Promise((ok) => {
    if (chrome.exitCode !== null || chrome.killed) return ok();
    chrome.once('exit', () => ok());
    try { chrome.kill(); } catch {}
    setTimeout(ok, 3000);
  });
  try { if (signalingPropio && signaling) process.kill(-signaling.pid); } catch {}
  try { if (preview) process.kill(-preview.pid); } catch {}
  await chromeCerrado;
  try { rmSync(userDataTmp, { recursive: true, force: true }); } catch (e) {
    console.warn('[smoke] perfil temporal sin limpiar:', e.message?.slice(0, 120));
  }
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('[smoke_trueque] fallo general:', e.message);
  process.exit(1);
});