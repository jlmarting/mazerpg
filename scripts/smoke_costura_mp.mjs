/**
 * Smoke de costura continua en multijugador (HTTP, 2 clientes) — F3.3.
 *
 * El host cruza la costura este de la raíz caminando; el invitado debe:
 *  - recibir el mundo continuo (activo + vecino),
 *  - cambiar al nodo hijo sin fundido,
 *  - conservar el nodo anterior como vecino para el scroll,
 *  - poder moverse durante/tras la transición.
 *
 * Uso: node scripts/smoke_costura_mp.mjs
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

const ELEGIR_DIR = `(() => {
  const g = window.game, p = g.protagonista;
  const cel = g.mapaLaberinto[p.fila]?.[p.columna];
  if (!cel) return 'NINGUNA';
  if (!cel.muros.superior && g.mapaLaberinto[p.fila-1]?.[p.columna]?.esTransitable) return 'ArrowUp';
  if (!cel.muros.inferior && g.mapaLaberinto[p.fila+1]?.[p.columna]?.esTransitable) return 'ArrowDown';
  if (!cel.muros.izquierdo && g.mapaLaberinto[p.fila]?.[p.columna-1]?.esTransitable) return 'ArrowLeft';
  if (!cel.muros.derecho && g.mapaLaberinto[p.fila]?.[p.columna+1]?.esTransitable) return 'ArrowRight';
  return 'NINGUNA';
})()`;

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
    await evaluar(cdp, host, `document.getElementById('btnModoHttp')?.click()`);
    await evaluar(cdp, host, `document.getElementById('btnCrearPartida')?.click()`);
    await evaluar(cdp, host, `document.querySelector('.diff-btn[data-diff="facil"]')?.click()`);
    await SLEEP(1200);
    await evaluar(cdp, host, `document.getElementById('housingModal')?.style.display === 'flex' ? document.getElementById('btnHousingUsar')?.click() : null`);
    await esperar(cdp, host, 'window.game.motorIniciado === true', 20000, 'host motor');
    const sala = await evaluar(cdp, host, `window.game.networkHttp?.idPartidaActual ?? null`);
    if (!sala) throw new Error('host sin sala');

    const invitado = await abrirPagina();
    await evaluar(cdp, invitado, `document.getElementById('btnModoHttp')?.click()`);
    await evaluar(cdp, invitado, `window.game.onJoinGame(${JSON.stringify(sala)}, 'http')`);
    await esperar(cdp, invitado, 'window.game.motorIniciado === true', 25000, 'invitado motor');
    await esperar(cdp, host, 'window.game.remotosActivos.size >= 1', 15000, 'host ve invitado');
    await esperar(cdp, invitado, 'window.game.mapaLaberinto.length > 0', 10000, 'invitado con mapa inicial');

    const inicio = await evaluar(cdp, invitado, contarDecor);
    if (inicio.filas !== 80 || inicio.columnas !== 80) {
      throw new Error(`mapa inicial inesperado: ${inicio.filas}×${inicio.columnas}`);
    }
    console.log('  PASS invitado arranca en la mazmorra 80×80');

    // El host se coloca en la costura este de la raíz y cruza caminando.
    const setup = JSON.parse(await evaluar(cdp, host, `JSON.stringify((() => {
      const g = window.game;
      const c = [...g.gestorMundo.conectores.values()].find((x) => x.id === 'conector-zona-abierto-1');
      if (!c) return { error: 'sin conector de costura' };
      g.protagonista.fila = c.filaO;
      g.protagonista.columna = c.columnaO;
      g.protagonista.visualFila = c.filaO;
      g.protagonista.visualColumna = c.columnaO;
      return { filaO: c.filaO, columnaO: c.columnaO };
    })())`));
    if (setup.error) throw new Error(setup.error);
    await SLEEP(400);
    let hostCruzado = false;
    for (let intento = 0; intento < 8 && !hostCruzado; intento++) {
      await evaluar(cdp, host, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))`);
      await SLEEP(500);
      hostCruzado = await evaluar(cdp, host, `window.game.nodoActivo?.id === 'zona-abierto-1'`);
    }
    if (!hostCruzado) throw new Error('host no cruzó la costura este');
    await esperar(cdp, invitado, `window.game.gestorMundo.nodoActivoId === 'zona-abierto-1'`, 10000, 'invitado recibe el cruce');
    await SLEEP(500);
    console.log('  PASS invitado cambia al nodo hijo al cruzar el host');

    const guestState = JSON.parse(await evaluar(cdp, invitado, `JSON.stringify({
      nodo: window.game.gestorMundo.nodoActivoId,
      nodos: window.game.gestorMundo.mundo.size,
      filas: window.game.mapaLaberinto.length,
      columnas: window.game.mapaLaberinto[0]?.length ?? 0,
      compacto: window.game.mundoRemotoCompacto === true,
      raizEnMundo: window.game.gestorMundo.mundo.has('raiz'),
      cacheRaiz: !!window.game.renderer.cacheNodos && (window.game.renderer.cacheNodos.has('raiz') || window.game.renderer.cacheNodos.has('raiz:lod')),
      cacheHijo: !!window.game.renderer.cacheNodos && window.game.renderer.cacheNodos.has('zona-abierto-1'),
      fundido: Number.isFinite(window.game.fundidoInicio)
    })`));
    if (guestState.nodo !== 'zona-abierto-1') throw new Error(`invitado en nodo ${guestState.nodo}`);
    if (guestState.nodos < 2) throw new Error(`invitado con ${guestState.nodos} nodos (esperaba activo+vecino)`);
    if (guestState.filas !== 80 || guestState.columnas !== 80) throw new Error(`mapa hijo inesperado ${guestState.filas}×${guestState.columnas}`);
    if (!guestState.cacheHijo) throw new Error('el invitado no tiene caché del nodo hijo');
    if (!guestState.compacto) throw new Error('el invitado no recibió mundo compacto (F4b.3)');
    if (!guestState.raizEnMundo) throw new Error('el invitado no conserva la raíz en el mundo');
    if (guestState.fundido) throw new Error('el invitado usó fundido en el cruce continuo');
    console.log(`  PASS invitado con mundo compacto (${guestState.nodos} nodos, raíz conservada, hijo cacheado, sin fundido)`);

    // Mapamundi del invitado: solo sus nodos conocidos (activo + vecino), sin pausa.
    await evaluar(cdp, invitado, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }))`);
    await esperar(cdp, invitado, `window.game.mapaAbierto === true`, 3000, 'mapa invitado abierto');
    const mapaGuest = JSON.parse(await evaluar(cdp, invitado, `JSON.stringify({
      overlay: document.getElementById('worldMapOverlay')?.style.display,
      nodos: window.game.gestorMundo.mundo.size,
      descubiertos: [...window.game.nodosDescubiertos],
      activo: window.game.gestorMundo.nodoActivoId
    })`));
    if (mapaGuest.overlay !== 'flex') throw new Error('el overlay del mapa no se muestra en el invitado');
    if (mapaGuest.nodos < 2) throw new Error(`el invitado tiene ${mapaGuest.nodos} nodos en el mapa (esperaba activo+vecino)`);
    if (!mapaGuest.descubiertos.includes(mapaGuest.activo)) throw new Error('el nodo activo del invitado no figura descubierto');
    console.log(`  PASS invitado abre el mapamundi con sus nodos conocidos (${mapaGuest.nodos} nodos, activo ${mapaGuest.activo})`);
    await evaluar(cdp, invitado, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await esperar(cdp, invitado, `window.game.mapaAbierto === false`, 3000, 'mapa invitado cerrado');

    // F4a: interés adaptativo en MP (host + invitado = 2 jugadores).
    await SLEEP(1200);
    const interesHost = JSON.parse(await evaluar(cdp, host, `JSON.stringify(window.game.interesActual)`));
    const interesGuest = JSON.parse(await evaluar(cdp, invitado, `JSON.stringify(window.game.interesActual)`));
    const capsVis = { movil: 3, tablet: 4, pc: 5 };
    for (const [quien, interes] of [['host', interesHost], ['invitado', interesGuest]]) {
      if (!interes) throw new Error(`interés nulo en ${quien}`);
      if (!(interes.radioSim >= 1 && interes.radioSim <= interes.radioVis && interes.radioVis <= (capsVis[interes.dispositivo] ?? 5))) {
        throw new Error(`radios fuera de rango en ${quien}: ${JSON.stringify(interes)}`);
      }
      if (interes.jugadores !== 2) throw new Error(`jugadores=${interes.jugadores} en ${quien} (esperado 2)`);
    }
    console.log('  PASS interés adaptativo en MP (host+invitado, 2 jugadores, radios válidos)');

    // El invitado puede moverse tras/durante la transición.
    const dir = await evaluar(cdp, invitado, ELEGIR_DIR);
    if (dir === 'NINGUNA') {
      console.log('  PASS invitado sin dirección transitable en el spawn (no se prueba movimiento)');
    } else {
      const antesMov = JSON.parse(await evaluar(cdp, invitado, `JSON.stringify({f: window.game.protagonista.fila, c: window.game.protagonista.columna})`));
      await evaluar(cdp, invitado, `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(dir)} }))`);
      await SLEEP(700);
      const despuesMov = JSON.parse(await evaluar(cdp, invitado, `JSON.stringify({f: window.game.protagonista.fila, c: window.game.protagonista.columna})`));
      if (despuesMov.f === antesMov.f && despuesMov.c === antesMov.c) {
        throw new Error(`el invitado no se movió tras el cruce (${JSON.stringify(antesMov)})`);
      }
      console.log(`  PASS invitado se mueve tras el cruce (${antesMov.f},${antesMov.c}) → (${despuesMov.f},${despuesMov.c})`);
    }

    // Vuelta del host: el invitado vuelve a la raíz sin fundido.
    let hostVuelto = false;
    for (let intento = 0; intento < 8 && !hostVuelto; intento++) {
      await evaluar(cdp, host, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))`);
      await SLEEP(500);
      hostVuelto = await evaluar(cdp, host, `window.game.nodoActivo?.id === 'raiz'`);
    }
    if (!hostVuelto) throw new Error('host no volvió por la costura oeste');
    await esperar(cdp, invitado, `window.game.gestorMundo.nodoActivoId === 'raiz'`, 10000, 'invitado vuelve a la raíz');
    await SLEEP(500);
    const guestVuelta = JSON.parse(await evaluar(cdp, invitado, `JSON.stringify({
      nodo: window.game.gestorMundo.nodoActivoId,
      nodos: window.game.gestorMundo.mundo.size,
      filas: window.game.mapaLaberinto.length,
      fundido: Number.isFinite(window.game.fundidoInicio)
    })`));
    if (guestVuelta.nodo !== 'raiz') throw new Error(`invitado en ${guestVuelta.nodo} tras la vuelta`);
    if (guestVuelta.nodos < 2) throw new Error('el invitado perdió el vecino al volver');
    if (guestVuelta.fundido) throw new Error('el invitado usó fundido en la vuelta');
    console.log(`  PASS invitado vuelve a la raíz con mundo continuo (${guestVuelta.nodos} nodos, sin fundido)`);

    // Regresión LA GUARDIA: el invitado invocado no pierde vida al chocar
    // con el host, no queda tras un muro y el teleport no se desincroniza.
    await evaluar(cdp, host, `window.game.listaDeEnemigos = []; window.game.protagonista.vidaActual = window.game.protagonista.vidaMaxima; window.game.protagonista.estaVivo = true`);
    await evaluar(cdp, invitado, `window.game.listaDeEnemigos = []; window.game.protagonista.vidaActual = window.game.protagonista.vidaMaxima; window.game.protagonista.estaVivo = true`);
    await SLEEP(500);
    const hpAntes = JSON.parse(await evaluar(cdp, invitado, `JSON.stringify({ guest: window.game.protagonista.vidaActual, host: window.game.protagonista.vidaActual })`));
    const hostHpAntes = await evaluar(cdp, host, `window.game.protagonista.vidaActual`);
    await evaluar(cdp, host, `window.game.teletransportarAliados(window.game.protagonista, true)`);
    await SLEEP(800);
    const guardGuest = JSON.parse(await evaluar(cdp, invitado, `JSON.stringify((() => {
      const g = window.game, p = g.protagonista;
      const rem = [...g.remotosActivos.values()].find((v) => v.entidad);
      const cel = g.mapaLaberinto[p.fila]?.[p.columna];
      return { f: p.fila, c: p.columna, hp: p.vidaActual, maxHp: p.vidaMaxima, transitable: !!cel?.esTransitable, hostVisto: rem?.entidad ? { f: rem.entidad.fila, c: rem.entidad.columna } : null };
    })())`));
    const hostTrasGuard = JSON.parse(await evaluar(cdp, host, `JSON.stringify((() => { const p = window.game.protagonista; return { f: p.fila, c: p.columna, hp: p.vidaActual }; })())`));
    if (!guardGuest.transitable) throw new Error(`la guardia dejó al invitado en una celda no transitable (${guardGuest.f},${guardGuest.c})`);
    if (guardGuest.hp !== hpAntes.guest) throw new Error(`la guardia dañó al invitado: ${hpAntes.guest} → ${guardGuest.hp}`);
    if (hostTrasGuard.hp !== hostHpAntes) throw new Error(`la guardia dañó al host: ${hostHpAntes} → ${hostTrasGuard.hp}`);
    const cerca = Math.abs(guardGuest.f - hostTrasGuard.f) + Math.abs(guardGuest.c - hostTrasGuard.c);
    if (cerca > 3) throw new Error(`el invitado quedó a distancia ${cerca} del host tras la guardia`);
    console.log(`  PASS guardia coloca al invitado a distancia ${cerca} sin daño`);

    // Empujar al host (si está adyacente) no debe restar vida.
    const df = hostTrasGuard.f - guardGuest.f;
    const dc = hostTrasGuard.c - guardGuest.c;
    let dirHacia = null, dirLejos = null;
    if (Math.abs(df) + Math.abs(dc) === 1) {
      if (df === 1) { dirHacia = 'ArrowDown'; dirLejos = 'ArrowUp'; }
      else if (df === -1) { dirHacia = 'ArrowUp'; dirLejos = 'ArrowDown'; }
      else if (dc === 1) { dirHacia = 'ArrowRight'; dirLejos = 'ArrowLeft'; }
      else { dirHacia = 'ArrowLeft'; dirLejos = 'ArrowRight'; }
    }
    if (dirHacia) {
      for (let i = 0; i < 4; i++) {
        await evaluar(cdp, invitado, `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(dirHacia)} }))`);
        await SLEEP(140);
      }
      const hpTrasChoque = await evaluar(cdp, invitado, `window.game.protagonista.vidaActual`);
      if (hpTrasChoque !== hpAntes.guest) throw new Error(`chocar con el host restó vida: ${hpAntes.guest} → ${hpTrasChoque}`);
      console.log('  PASS empujar al host no resta vida');
      for (let i = 0; i < 3; i++) {
        await evaluar(cdp, invitado, `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(dirLejos)} }))`);
        await SLEEP(140);
      }
    }
    await SLEEP(500);
    const syncHost = JSON.parse(await evaluar(cdp, invitado, `JSON.stringify((() => {
      const g = window.game; const rem = [...g.remotosActivos.values()].find((v) => v.entidad);
      return { f: rem?.entidad?.fila, c: rem?.entidad?.columna, hp: g.protagonista.vidaActual };
    })())`));
    const hostReal = JSON.parse(await evaluar(cdp, host, `JSON.stringify({ f: window.game.protagonista.fila, c: window.game.protagonista.columna, hp: window.game.protagonista.vidaActual })`));
    if (syncHost.f !== hostReal.f || syncHost.c !== hostReal.c) throw new Error(`vista del host desincronizada: ${JSON.stringify({ syncHost, hostReal })}`);
    if (syncHost.hp !== hpAntes.guest) throw new Error(`el invitado perdió vida tras moverse: ${hpAntes.guest} → ${syncHost.hp}`);
    console.log('  PASS posición del host sincronizada en el invitado');

    // El invitado invoca la guardia: solo pide, no mueve aliados en local.
    const hpInvitadoAntes = await evaluar(cdp, invitado, `window.game.protagonista.vidaActual`);
    await evaluar(cdp, invitado, `window.game.teletransportarAliados(window.game.protagonista, true)`);
    await SLEEP(900);
    const hostCerca = JSON.parse(await evaluar(cdp, host, `JSON.stringify({ f: window.game.protagonista.fila, c: window.game.protagonista.columna, hp: window.game.protagonista.vidaActual })`));
    const guestLider = JSON.parse(await evaluar(cdp, invitado, `JSON.stringify((() => {
      const g = window.game, p = g.protagonista; const rem = [...g.remotosActivos.values()].find((v) => v.entidad);
      return { f: p.fila, c: p.columna, hp: p.vidaActual, hostVisto: rem?.entidad ? { f: rem.entidad.fila, c: rem.entidad.columna } : null };
    })())`));
    if (Math.abs(hostCerca.f - guestLider.f) + Math.abs(hostCerca.c - guestLider.c) > 3) throw new Error('el host no acudió a la guardia del invitado');
    if (guestLider.hp !== hpInvitadoAntes) throw new Error('la guardia del invitado le restó vida');
    if (!guestLider.hostVisto || guestLider.hostVisto.f !== hostCerca.f || guestLider.hostVisto.c !== hostCerca.c) {
      throw new Error(`vista del host desincronizada tras guardia del invitado: ${JSON.stringify({ guestLider, hostCerca })}`);
    }
    console.log('  PASS guardia del invitado resuelta por el host sin desincronizar');

    console.log('SMOKE_COSTURA_MP_OK');
  } finally {
    try { if (chrome) chrome.kill('SIGKILL'); } catch {}
    try { if (preview) process.kill(-preview.pid, 'SIGKILL'); } catch {}
    try { if (signalingPropio && signaling) process.kill(-signaling.pid, 'SIGKILL'); } catch {}
    try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => {
  console.error('SMOKE_COSTURA_MP_FAIL:', e.message);
  process.exit(1);
});
