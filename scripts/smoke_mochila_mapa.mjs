/**
 * Smoke de la mochila y el objeto Mapa (1 cliente, solo).
 *
 * Comprueba que el mapa está en el inventario, que la mochila se pinta como
 * grid, que VER MAPA cierra la mochila y abre el mapamundi, y que el objeto
 * no se consume al usarlo. Después reutiliza el recorrido del mapamundi.
 *
 * Uso: node scripts/smoke_mochila_mapa.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUERTO_PREVIEW = 4319;
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
      this.pending.set(id, { ok, fallo });
      this.ws.send(JSON.stringify({ id, method: metodo, params, sessionId: sesion || undefined }));
    });
  }
  on(escucha) { this.listeners.push(escucha); }
}

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluar(cdp, sesion, expr) {
  const r = await cdp.comando('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sesion);
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

/** Elige una dirección válida (sin muro y celda destino transitable) desde la posición del protagonista. */
const ELEGIR_DIR = `(() => {
  const g = window.game, p = g.protagonista;
  const cel = g.mapaLaberinto[p.fila]?.[p.columna];
  if (!cel) return 'SIN_CELDA';
  const dirs = [];
  if (!cel.muros.superior && g.mapaLaberinto[p.fila-1]?.[p.columna]?.esTransitable) dirs.push('ArrowUp');
  if (!cel.muros.inferior && g.mapaLaberinto[p.fila+1]?.[p.columna]?.esTransitable) dirs.push('ArrowDown');
  if (!cel.muros.izquierdo && g.mapaLaberinto[p.fila]?.[p.columna-1]?.esTransitable) dirs.push('ArrowLeft');
  if (!cel.muros.derecho && g.mapaLaberinto[p.fila]?.[p.columna+1]?.esTransitable) dirs.push('ArrowRight');
  return dirs.length ? dirs[0] : 'NINGUNA';
})()`;

async function main() {
  const chromium = localizarChromium();
  const perfil = mkdtempSync(join(tmpdir(), 'mazerpg-mov-'));

  const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PUERTO_PREVIEW), '--strictPort'], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  await esperarPreview(PUERTO_PREVIEW);
  console.log(`[mapamundi] dist servido en http://localhost:${PUERTO_PREVIEW}/`);

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

  const cdpWs = await conectarWs(wsUrl);
  const cdp = new Cdp(cdpWs);
  const { targetId } = await cdp.comando('Target.createTarget', { url: `http://localhost:${PUERTO_PREVIEW}/` });
  const { sessionId } = await cdp.comando('Target.attachToTarget', { targetId, flatten: true });
  await cdp.comando('Runtime.enable', {}, sessionId);

  const consola = [];
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled') {
      const texto = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      consola.push(`[${msg.params.type}] ${texto}`);
    }
  });

  let fallos = 0;
  const pase = (n) => console.log(`  PASS ${n}`);
  const pana = (n, e = '') => { console.error(`  FALLO ${n} ${e}`); fallos++; };

  try {
    await esperar(cdp, sessionId, `!!window.game`, 15000, 'window.game expuesto');
    await evaluar(cdp, sessionId, `document.getElementById('btnSolo').click()`);
    await esperar(cdp, sessionId, `document.getElementById('difficultyModal')?.style.display === 'flex'`, 5000, 'modal dificultad');
    await evaluar(cdp, sessionId, `document.querySelector('.diff-btn[data-diff="facil"]').click()`);
    await esperar(cdp, sessionId, `window.game.motorIniciado === true`, 10000, 'motor iniciado');
    await esperar(cdp, sessionId, `!!window.game.gestorMundo.nodoActivoId`, 10000, 'nodo activo');
    await SLEEP(500);

    // La mochila incluye el mapa y se pinta en grid.
    await evaluar(cdp, sessionId, `document.getElementById('btnEquipoAction').click()`);
    await esperar(cdp, sessionId, `document.getElementById('equipoModal')?.style.display === 'flex'`, 3000, 'mochila abierta');
    const mochila = JSON.parse(await evaluar(cdp, sessionId, `JSON.stringify({
      mapa: window.game.protagonista.inventario.mapa,
      display: getComputedStyle(document.getElementById('equipoMochila')).display,
      columnas: getComputedStyle(document.getElementById('equipoMochila')).gridTemplateColumns.split(' ').length,
      boton: [...document.querySelectorAll('#equipoMochila button')].map((b) => b.textContent),
      ancho: document.querySelector('.equipo-modal-box')?.getBoundingClientRect().width
    })`));
    if (mochila.mapa === 1) pase('el mapa está en el inventario');
    else pana('el mapa está en el inventario', JSON.stringify(mochila));
    if (mochila.display === 'grid' && mochila.columnas >= 2) pase('la mochila usa grid con varias columnas');
    else pana('la mochila usa grid con varias columnas', JSON.stringify(mochila));
    if (mochila.boton.includes('VER MAPA')) pase('el objeto Mapa ofrece VER MAPA');
    else pana('el objeto Mapa ofrece VER MAPA', JSON.stringify(mochila.boton));
    if (mochila.ancho > 500) pase(`el modal de equipo gana ancho (${Math.round(mochila.ancho)}px)`);
    else pana('el modal de equipo gana ancho', JSON.stringify(mochila));

    // VER MAPA cierra la mochila y abre el mapamundi.
    await evaluar(cdp, sessionId, `[...document.querySelectorAll('#equipoMochila button')].find((b) => b.textContent === 'VER MAPA').click()`);
    await esperar(cdp, sessionId, `window.game.mapaAbierto === true`, 3000, 'mapa abierto desde la mochila');
    const trasMapa = JSON.parse(await evaluar(cdp, sessionId, `JSON.stringify({
      equipo: document.getElementById('equipoModal')?.style.display,
      overlay: document.getElementById('worldMapOverlay')?.style.display,
      mapa: window.game.protagonista.inventario.mapa
    })`));
    if (trasMapa.overlay === 'flex' && trasMapa.equipo === 'none') pase('VER MAPA abre el mapamundi y cierra la mochila');
    else pana('VER MAPA abre el mapamundi y cierra la mochila', JSON.stringify(trasMapa));
    if (trasMapa.mapa === 1) pase('el mapa no se consume al abrirlo');
    else pana('el mapa no se consume al abrirlo', JSON.stringify(trasMapa));

    // Cerrar y reabrir la mochila: el mapa sigue ahí.
    await evaluar(cdp, sessionId, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await esperar(cdp, sessionId, `window.game.mapaAbierto === false`, 3000, 'mapa cerrado desde mochila');
    await evaluar(cdp, sessionId, `document.getElementById('btnEquipoAction').click()`);
    await esperar(cdp, sessionId, `document.getElementById('equipoModal')?.style.display === 'flex'`, 3000, 'mochila reabierta');
    const reabierta = JSON.parse(await evaluar(cdp, sessionId, `JSON.stringify({
      mapa: window.game.protagonista.inventario.mapa,
      boton: [...document.querySelectorAll('#equipoMochila button')].some((b) => b.textContent === 'VER MAPA')
    })`));
    if (reabierta.mapa === 1 && reabierta.boton) pase('el mapa permanece tras abrir/cerrar');
    else pana('el mapa permanece tras abrir/cerrar', JSON.stringify(reabierta));
    await evaluar(cdp, sessionId, `document.getElementById('btnCerrarEquipo').click()`);
    await esperar(cdp, sessionId, `document.getElementById('equipoModal')?.style.display === 'none'`, 3000, 'mochila cerrada');

    // Abrir el mapamundi con M.
    await SLEEP(800);
    await evaluar(cdp, sessionId, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }))`);
    await esperar(cdp, sessionId, `window.game.mapaAbierto === true`, 3000, 'mapa abierto');
    const mapa1 = JSON.parse(await evaluar(cdp, sessionId, `JSON.stringify({
      abierto: window.game.mapaAbierto,
      overlay: document.getElementById('worldMapOverlay')?.style.display,
      nodos: window.game.gestorMundo.mundo.size,
      descubiertos: [...window.game.nodosDescubiertos],
      activo: window.game.gestorMundo.nodoActivoId,
      pixel: (() => { const c = document.getElementById('worldMapCanvas'); const d = c.getContext('2d').getImageData(2, 2, 1, 1).data; return [d[0], d[1], d[2], d[3]]; })()
    })`));
    if (mapa1.overlay === 'flex' && mapa1.abierto) pase('el mapamundi se abre con M');
    else pana('el mapamundi se abre con M', JSON.stringify(mapa1));
    if (mapa1.pixel[3] > 0) pase('el canvas del mapa se pinta');
    else pana('el canvas del mapa se pinta', JSON.stringify(mapa1.pixel));
    if (mapa1.descubiertos.includes(mapa1.activo)) pase(`el nodo activo está descubierto (${mapa1.activo})`);
    else pana('el nodo activo está descubierto', JSON.stringify(mapa1));

    // El mapa abierto bloquea el movimiento (la simulación sigue).
    const antesMapa = JSON.parse(await evaluar(cdp, sessionId, `JSON.stringify({ f: window.game.protagonista.fila, c: window.game.protagonista.columna })`));
    await evaluar(cdp, sessionId, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))`);
    await SLEEP(400);
    const despuesMapa = JSON.parse(await evaluar(cdp, sessionId, `JSON.stringify({ f: window.game.protagonista.fila, c: window.game.protagonista.columna })`));
    if (despuesMapa.f === antesMapa.f && despuesMapa.c === antesMapa.c) pase('el mapamundi bloquea el movimiento mientras está abierto');
    else pana('el mapamundi bloquea el movimiento', JSON.stringify({ antesMapa, despuesMapa }));

    // Cerrar con M.
    await evaluar(cdp, sessionId, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }))`);
    await esperar(cdp, sessionId, `window.game.mapaAbierto === false`, 3000, 'mapa cerrado');
    pase('el mapamundi se cierra con M');

    // Cruzar a zona1 y reabrir: el nuevo nodo aparece descubierto.
    await evaluar(cdp, sessionId, `window.game.teleportCosturaDebug()`);
    await SLEEP(250);
    await evaluar(cdp, sessionId, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))`);
    await esperar(cdp, sessionId, `window.game.gestorMundo.nodoActivoId === 'zona-abierto-1'`, 5000, 'cruce a zona1');
    await SLEEP(350);
    await evaluar(cdp, sessionId, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }))`);
    await esperar(cdp, sessionId, `window.game.mapaAbierto === true`, 3000, 'mapa reabierto');
    const mapa2 = JSON.parse(await evaluar(cdp, sessionId, `JSON.stringify({
      descubiertos: [...window.game.nodosDescubiertos],
      activo: window.game.gestorMundo.nodoActivoId,
      nodos: window.game.gestorMundo.mundo.size
    })`));
    if (mapa2.descubiertos.includes('zona-abierto-1')) pase('tras cruzar, zona1 aparece descubierta en el mapa');
    else pana('zona1 descubierta tras cruzar', JSON.stringify(mapa2));
    if (mapa2.nodos >= 5) pase(`el host conoce la cadena (${mapa2.nodos} nodos)`);
    else pana('el host conoce la cadena', JSON.stringify(mapa2));
    await evaluar(cdp, sessionId, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await esperar(cdp, sessionId, `window.game.mapaAbierto === false`, 3000, 'mapa cerrado con Esc');
    pase('el mapamundi se cierra con Esc');

    // Móvil 360×640: una columna y sin desbordamiento horizontal.
    await cdp.comando('Emulation.setDeviceMetricsOverride', {
      width: 360, height: 640, deviceScaleFactor: 1, mobile: true,
    }, sessionId);
    await evaluar(cdp, sessionId, `document.getElementById('btnEquipoAction').click()`);
    await esperar(cdp, sessionId, `document.getElementById('equipoModal')?.style.display === 'flex'`, 3000, 'mochila móvil abierta');
    const movil = JSON.parse(await evaluar(cdp, sessionId, `JSON.stringify({
      columnas: getComputedStyle(document.getElementById('equipoMochila')).gridTemplateColumns.split(' ').length,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      cierreVisible: (() => { const r = document.getElementById('btnCerrarEquipo').getBoundingClientRect(); return r.bottom <= window.innerHeight && r.top >= 0; })()
    })`));
    if (movil.columnas === 1) pase('en 360 px la mochila usa una columna');
    else pana('en 360 px la mochila usa una columna', JSON.stringify(movil));
    if (movil.overflow <= 0) pase('el modal móvil no desborda horizontalmente');
    else pana('el modal móvil no desborda horizontalmente', JSON.stringify(movil));
    if (movil.cierreVisible) pase('el botón CERRAR queda visible en móvil');
    else pana('el botón CERRAR queda visible en móvil', JSON.stringify(movil));
    await evaluar(cdp, sessionId, `document.getElementById('btnCerrarEquipo').click()`);
    await cdp.comando('Emulation.clearDeviceMetricsOverride', {}, sessionId);

    const errores = consola.filter((l) => l.includes('Error') || l.includes('EXCEPTION'));
    if (errores.length === 0) pase('sin errores JS con el mapamundi');
    else pana('sin errores JS con el mapamundi', errores.slice(-3).join(' | '));
  } catch (e) {
    pana('secuencia de smoke del mapamundi', `— ${e.message}`);
  }

  console.log('\n[mochila-mapa] --- consola (últimos 25) ---');
  for (const c of consola.slice(-25)) console.log('  >', c.slice(0, 200));

  await cdpWs.close();
  await new Promise((ok) => {
    if (chrome.exitCode !== null || chrome.killed) return ok();
    chrome.once('exit', () => ok());
    try { chrome.kill(); } catch {}
    setTimeout(ok, 3000);
  });
  try { process.kill(-preview.pid); } catch {}
  try { rmSync(perfil, { recursive: true, force: true }); } catch {}

  console.log(fallos === 0 ? '\nSMOKE_MOCHILA_MAPA_OK' : `\nSMOKE_MOCHILA_MAPA_FAIL_${fallos}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('[mochila-mapa] ERROR FATAL:', e);
  process.exit(1);
});