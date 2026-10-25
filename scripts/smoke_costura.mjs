/**
 * Smoke de costura continua (1 cliente, solo) — F3.
 *
 * Verifica el cruce caminando por el borde este de la raíz hacia
 * `zona-abierto-1`, sin fundido, con posición de mundo continua, y la vuelta.
 * También comprueba que el nodo vecino tiene caché de render (cosido visual) y
 * que el movimiento normal sigue funcionando después del cruce.
 *
 * Uso: node scripts/smoke_costura.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUERTO_PREVIEW = 4315;
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
  console.log(`[costura] dist servido en http://localhost:${PUERTO_PREVIEW}/`);

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

    // Colocar al protagonista en la celda de la costura este de la raíz.
    const setup = await evaluar(cdp, sessionId, `(() => {
      const g = window.game;
      const conector = [...g.gestorMundo.conectores.values()].find((c) => c.id === 'conector-zona-abierto-1');
      if (!conector) return JSON.stringify({ error: 'sin conector de costura' });
      const t = g.gestorMundo.transformAbsoluto(g.gestorMundo.nodoActivoId);
      const world = g.worldDesdeCeldaActiva(conector.filaO, conector.columnaO);
      g.protagonista.fila = conector.filaO;
      g.protagonista.columna = conector.columnaO;
      g.protagonista.visualFila = conector.filaO;
      g.protagonista.visualColumna = conector.columnaO;
      return JSON.stringify({ nodo: g.gestorMundo.nodoActivoId, conector, t, world });
    })()`);
    const info = JSON.parse(setup);

    if (info.error) {
      pana('conector de costura sembrado', info.error);
    } else {
      const { conector, world } = info;
      console.log(`[costura] nodo=${info.nodo} conector=(${conector.filaO},${conector.columnaO}) world=(${world.fila},${world.columna})`);
      await SLEEP(300);
      // El nodo vecino debe estar dibujado al otro lado de la costura: el 25%
      // derecho del viewport cae dentro del hijo y no debe ser negro/transparente.
      const pixelDerecha = await evaluar(cdp, sessionId, `(() => {
        const c = document.getElementById('mazeCanvas');
        const ctx = c.getContext('2d');
        const x = Math.floor(c.width * 0.75);
        const y = Math.floor(c.height * 0.5);
        const d = ctx.getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2], d[3]];
      })()`);
      if (pixelDerecha[0] + pixelDerecha[1] + pixelDerecha[2] > 0) {
        pase('el nodo vecino se dibuja al otro lado de la costura (píxel no negro)');
      } else {
        pana('el nodo vecino se dibuja al otro lado de la costura', JSON.stringify(pixelDerecha));
      }
      const fundidoAntes = await evaluar(cdp, sessionId, `Number.isFinite(window.game.fundidoInicio)`);
      let cruzado = false;
      for (let intento = 0; intento < 8 && !cruzado; intento++) {
        await evaluar(cdp, sessionId, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))`);
        await SLEEP(500);
        cruzado = await evaluar(cdp, sessionId, `window.game.gestorMundo.nodoActivoId === 'zona-abierto-1'`);
      }
      if (!cruzado) throw new Error('timeout esperando: cruce al hijo');

      const despues = JSON.parse(await evaluar(cdp, sessionId, `JSON.stringify({
        nodo: window.game.gestorMundo.nodoActivoId,
        f: window.game.protagonista.fila,
        c: window.game.protagonista.columna,
        world: window.game.worldDesdeCeldaActiva(window.game.protagonista.fila, window.game.protagonista.columna),
        fundido: Number.isFinite(window.game.fundidoInicio),
        cacheHijo: !!window.game.renderer.cacheNodos && window.game.renderer.cacheNodos.has('zona-abierto-1')
      })`));

      if (despues.nodo === 'zona-abierto-1') pase(`cruce este: raíz → hijo en (${despues.f},${despues.c})`);
      else pana('cruce este al hijo', JSON.stringify(despues));
      if (despues.c === 0) pase('la llegada al hijo está en su borde oeste');
      else pana('llegada en el borde oeste del hijo', `c=${despues.c}`);
      if (despues.world.fila === world.fila && despues.world.columna === world.columna + 1) {
        pase(`posición de mundo continua: (${world.fila},${world.columna}) → (${despues.world.fila},${despues.world.columna})`);
      } else {
        pana('posición de mundo continua', JSON.stringify({ antes: world, despues: despues.world }));
      }
      if (despues.fundido === fundidoAntes) pase('sin fundido en el cruce continuo');
      else pana('sin fundido en el cruce continuo', `antes=${fundidoAntes} despues=${despues.fundido}`);
      if (despues.cacheHijo) pase('el nodo hijo tiene caché de render (visible como vecino)');
      else pana('el nodo hijo tiene caché de render', 'cacheNodos no incluye zona-abierto-1');

      // Vuelta por la costura oeste del hijo.
      let vuelto = false;
      for (let intento = 0; intento < 8 && !vuelto; intento++) {
        await evaluar(cdp, sessionId, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))`);
        await SLEEP(500);
        vuelto = await evaluar(cdp, sessionId, `window.game.gestorMundo.nodoActivoId === 'raiz'`);
      }
      if (!vuelto) throw new Error('timeout esperando: vuelta a la raíz');
      const vuelta = JSON.parse(await evaluar(cdp, sessionId, `JSON.stringify({
        nodo: window.game.gestorMundo.nodoActivoId,
        f: window.game.protagonista.fila,
        c: window.game.protagonista.columna,
        world: window.game.worldDesdeCeldaActiva(window.game.protagonista.fila, window.game.protagonista.columna)
      })`));
      if (vuelta.nodo === 'raiz') pase(`vuelta oeste: hijo → raíz en (${vuelta.f},${vuelta.c})`);
      else pana('vuelta a la raíz', JSON.stringify(vuelta));
      if (vuelta.c === conector.columnaO) pase('la vuelta aterriza en la celda de la costura de la raíz');
      else pana('vuelta en la celda de la costura', `c=${vuelta.c} esperado=${conector.columnaO}`);
      if (vuelta.world.fila === world.fila && vuelta.world.columna === world.columna) {
        pase('posición de mundo de vuelta == posición de partida');
      } else {
        pana('posición de mundo de vuelta', JSON.stringify({ esperado: world, obtenido: vuelta.world }));
      }

      // Movimiento normal dentro del nodo tras el cruce.
      const dir = await evaluar(cdp, sessionId, ELEGIR_DIR);
      if (dir !== 'NINGUNA' && dir !== 'SIN_CELDA') {
        const antesMov = JSON.parse(await evaluar(cdp, sessionId, `JSON.stringify({f: window.game.protagonista.fila, c: window.game.protagonista.columna})`));
        await evaluar(cdp, sessionId, `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(dir)} }))`);
        await SLEEP(600);
        const despuesMov = JSON.parse(await evaluar(cdp, sessionId, `JSON.stringify({f: window.game.protagonista.fila, c: window.game.protagonista.columna})`));
        if (despuesMov.f !== antesMov.f || despuesMov.c !== antesMov.c) {
          pase(`movimiento normal tras volver (${antesMov.f},${antesMov.c}) → (${despuesMov.f},${despuesMov.c})`);
        } else {
          pana('movimiento normal tras volver', `sin cambio desde ${JSON.stringify(antesMov)}`);
        }
      }

      const sinEntidad = consola.filter((l) => l.includes('No se encontró entidad para ID'));
      if (sinEntidad.length > 0) pana('resolverAccion encontró la entidad', `— ${sinEntidad.length}x "No se encontró entidad"`);
      else pase('resolverAccion resolvió las acciones sin "entidad no encontrada"');
    }
  } catch (e) {
    pana('secuencia de smoke de costura', `— ${e.message}`);
  }

  console.log('\n[costura] --- consola (últimos 25) ---');
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

  console.log(fallos === 0 ? '\nCOSTURA_OK' : `\nCOSTURA_FAIL_${fallos}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('[costura] ERROR FATAL:', e);
  process.exit(1);
});