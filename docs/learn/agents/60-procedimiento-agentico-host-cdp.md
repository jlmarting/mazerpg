# LEARN: Cómo pilotar un juego desde fuera — hospedar, localizar y seguir a un humano por CDP

## Concepto

Un agente externo puede **habitar un juego real** sin una API privilegiada ni un "modo diós": usa el mismo cliente que un humano. En MazeRPG el **MCP** (`tools/agente/mcp-server.mjs`) hace de **ojos** (snapshot de solo lectura) y de **teclado** (eventos de teclado sintetizados), mientras que **Chrome DevTools Protocol (CDP)** hace de **mano larga** para lo que el MCP no expone: hospedar una partida Firebase, leer el estado interno del host y conducirlo con un bucle autónomo.

La receta completa de esta sesión fue:

1. **Hospedar** una partida Firebase con un script que usa el driver del agente.
2. **Localizar** al humano leyendo `game.remotosActivos` por CDP.
3. **Navegar** con BFS sobre el mapa en bitmask.
4. **Seguir/combatir** con una máquina de estados: seguir a ~2 casillas, atacar si el humano se para y hay enemigos, y no robarle el objetivo si él ataca.

## Por qué es importante

- **El agente es un cliente de primera clase**: si un humano puede hacerlo con teclado, el agente también. No hay protocolo paralelo, ni trampas, ni estado inyectado.
- **Separa ojos de manos**: el MCP sirve para leer y pulsar; CDP sirve para pilotar un host concreto. Mezclar ambos es la fuente de la mayoría de los bugs de este procedimiento.
- **El host es la autoridad**: en MazeRPG el multijugador es **P2P WebRTC** y Firebase Firestore es **solo señalización**. El host simula, arbitra y mantiene el *heartbeat*; si su proceso muere, la partida cae.
- **Es extrapolable**: el patrón "proceso host independiente + CDP + pathfinding + heurísticas" vale para cualquier juego de navegador que exponga su estado en `window.game`.

## Explicación sencilla

Piensa en una partida de cartas:

- **Firestore** es la puerta del local: sirve para que los jugadores se encuentren (señalización). No es la mesa donde se juega.
- **WebRTC** es la mesa: los jugadores hablan directamente entre ellos.
- El **host** es el árbitro que lleva el marcador. Si el árbitro se va, no hay partida.
- El **MCP** son los ojos y el mando del agente: le deja ver el marcador y pulsar botones.
- **CDP** es el cable de diagnóstico que se conecta al Chrome del árbitro: permite leer su libreta interna y mover su mano.

Con eso, el agente puede entrar como un jugador más y, además, **pilotar al árbitro** para buscar al humano, seguirle y combatir a su lado.

## Ejemplo práctico

### 0. El reparto de piezas

| Pieza | Dónde vive | Para qué sirve |
|---|---|---|
| MCP `mazerpg` | `tools/agente/mcp-server.mjs` | `sesion_lanzar` (solo), `mover`, `pulsar`, `estado`, `eventos`, `usar_casa`… |
| Driver CDP | `tools/agente/driver.mjs` | `lanzar`, `evaluar`, `esperar`, `snapshot`, `mover`, `pulsar` |
| Instrumentación | `?agent=1` | Expone `window.__mazerpgAgente.snapshot()` y `.mapa()` |
| Juego | `window.game` | Estado real: protagonista, remotos, enemigos, mapa, cola de acciones |

> El MCP **solo arranca "UN JUGADOR"**. Para hospedar una partida Firebase hay que salirse del MCP y usar el driver en un proceso aparte.

### 1. Hospedar Firebase fuera del MCP

```js
// /tmp/opencode/mazerpg_host_firebase.mjs
import { writeFileSync } from 'node:fs';
import { lanzar, evaluar, esperar, snapshot } from '/ruta/mazerpg/tools/agente/driver.mjs';

const h = await lanzar({}); // vite preview sobre dist/ + chrome-headless-shell
await esperar(h, '!!window.__mazerpgAgente', 15000, 'instrumentación del agente');

// El lobby humano haría: MULTIJUGADOR (Firebase) → dificultad → NUEVA PARTIDA.
// Aquí llamamos al mismo método que dispara ese flujo.
await evaluar(h, "window.game.onHostGame('firebase','facil')");
await esperar(h, '!!window.game.network.idPartidaActual', 25000, 'partida creada');

const id = await evaluar(h, 'window.game.network.idPartidaActual');
writeFileSync('/tmp/opencode/mazerpg_host.json', JSON.stringify({ id, estado: await snapshot(h) }, null, 2));
console.log('PARTIDA_ID=' + id);

// El host es la autoridad y mantiene el heartbeat: NO cerrar el proceso.
setInterval(() => {}, 1 << 30);
```

Verificación real (sin adivinar):

```bash
# 1) La partida existe y sigue viva en Firestore
curl -s "https://firestore.googleapis.com/v1/projects/<proyecto>/databases/(default)/documents/partidas/lobo-nuevo?key=<apiKey>"
# → estado: activa, lastSeen actualizado

# 2) El mundo arrancó
curl -s "https://firestore.googleapis.com/v1/projects/<proyecto>/databases/(default)/documents/partidas/lobo-nuevo/mundos?key=<apiKey>"
# → documents/raiz con gen {seed, version, params}

# 3) Un invitado de prueba entra de verdad
#    lanzar({ url }) + onJoinGame(id,'firebase') + esperar('window.game.motorIniciado === true')
```

La **auto-admisión** (`chkAdmitir`, activada por defecto) admite al invitado sin intervención. En esta sesión la partida fue `lobo-nuevo` y el host se llamó `Jugador`.

### 2. Localizar al humano por CDP

El host corre en un Chrome con perfil temporal. Su perfil se ve en `ps` y contiene `DevToolsActivePort`:

```bash
ps -eo pid,args | grep 'user-data-dir=/tmp/mazerpg-agente'
# --user-data-dir=/tmp/mazerpg-agente-FOYKd3 --remote-debugging-port=0
```

```js
// Conectar a la página del host (WebSocket + Runtime.evaluate)
const port = readFileSync('/tmp/mazerpg-agente-FOYKd3/DevToolsActivePort', 'utf8').split('\n')[0].trim();
const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json())
  .find(t => t.type === 'page' && /MazeRPG/.test(t.title));
const ws = new Client(page.webSocketDebuggerUrl); // faye-websocket (transitiva de firebase)

// Runtime.evaluate con returnByValue → leer el estado interno del host
const estado = await ev(`(() => {
  const g = window.game;
  let user = null;
  // remotosActivos es un getter privado de TS, pero accesible en runtime
  g.remotosActivos.forEach((v) => {
    const e = v && v.entidad;
    if (!e || !e.id || v.dc?.readyState !== 'open') return;
    const cand = { id: e.id, nick: e.nombre, f: e.fila, c: e.columna, pc: v.pc?.connectionState };
    if (!user || cand.pc === 'connected') user = cand; // preferir el conectado
  });
  return {
    host: { f: g.protagonista.fila, c: g.protagonista.columna, hp: g.protagonista.vidaActual },
    user,
    enemigos: g.listaDeEnemigos.filter(e => e.estaVivo)
      .map(e => ({ id: e.id, nombre: e.nombre, f: e.fila, c: e.columna, hp: e.vidaActual })),
    nodo: g.gestorMundo?.nodoActivoId,
  };
})()`);
```

> **Ojo con las conexiones stale**: `jugadoresRemotos` conserva entradas de probes y reintentos en `new`/`connecting`. Filtra por `dc.readyState === 'open'` y prefiere `pc.connectionState === 'connected'`.

### 3. Mapa en bitmask y pathfinding

`window.__mazerpgAgente.mapa()` devuelve una rejilla de números. **Cada bit es un muro, no una apertura**:

| Bit | Valor | Significado |
|---|---|---|
| 0 | 1 | muro **superior** |
| 1 | 2 | muro **inferior** |
| 2 | 4 | muro **izquierdo** |
| 3 | 8 | muro **derecho** |
| 4 | 16 | **transitable** |

Ejemplo: `26 = 16 + 2 + 8` → celda transitable con muros inferior y derecho. Una celda `15` no tiene el bit 16: es muro.

```js
const transitable = (f, c) =>
  f >= 0 && f < mapa.filas && c >= 0 && c < mapa.columnas && (mapa.celdas[f][c] & 16) !== 0;

function siguientePaso(desde, hasta, bloqueadas = new Set()) {
  // BFS 4-vecinos: el vecino existe si el muro de ese lado está a 0
  const prev = new Map();
  const cola = [[desde.f, desde.c]];
  prev.set(clave(desde.f, desde.c), null);
  while (cola.length) {
    const [f, c] = cola.shift();
    if (f === hasta.f && c === hasta.c) break;
    const v = mapa.celdas[f][c];
    const vecinos = [];
    if ((v & 1) === 0) vecinos.push([f - 1, c]);
    if ((v & 2) === 0) vecinos.push([f + 1, c]);
    if ((v & 4) === 0) vecinos.push([f, c - 1]);
    if ((v & 8) === 0) vecinos.push([f, c + 1]);
    for (const [nf, nc] of vecinos) {
      if (!transitable(nf, nc) || bloqueadas.has(clave(nf, nc))) continue;
      if (!prev.has(clave(nf, nc))) { prev.set(clave(nf, nc), [f, c]); cola.push([nf, nc]); }
    }
  }
  // Reconstruir y devolver el PRIMER paso (no el camino entero)
  // ...
}
```

- Usa **distancia de camino (BFS)**, no Manhattan, para decidir si ya estás a 2 casillas.
- Al **seguir**, bloquea las celdas de enemigos para no iniciar combate sin querer; si no hay ruta, reintenta sin bloqueo.
- **Recarga el mapa al cambiar de nodo** (`gestorMundo.nodoActivoId`): la raíz mide 60×60 y la casa 9×16.

### 4. Mover: teclado sintetizado en `window`

```js
async function pulsar(tecla) {
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(tecla)}, bubbles: true }))`);
  await SLEEP(45);
  await ev(`window.dispatchEvent(new KeyboardEvent('keyup', { key: ${JSON.stringify(tecla)}, bubbles: true }))`);
}
// Paso real: pulsar + esperar ~120-240 ms; el movimiento es 1 celda por pulsación.
```

### 5. Seguidor y combatiente: la máquina de estados

Objetivo pedido por el humano: **seguir a ~2 casillas**, atacar si se para y hay enemigos, y **no robarle el objetivo** cuando él ataca.

```js
// Cada tick (~250 ms):
const camino = distanciaBFS(host, user);
const userAtaca = accionesDeCombateDelUsuario() || eventosMeleeDelUsuario();

if (userAtaca) {
  // No tocar su enemigo: defensa propia o buscar OTROS enemigos
  const otros = enemigos.filter(e => manhattan(e, user) > 2);
  const objetivo = masCercano(host, otros, radio = 8);
  if (objetivo) enganchar(objetivo);
  else if (host.combate && adyacente(host, atacante)) whirlwind(); // defensa
  else esperar();
} else if (userParado > 2s && enemigoCercano <= 8) {
  enganchar(enemigoCercano);
} else if (camino > 2) {
  pasoHacia(user); // mantener ~2 casillas
} else {
  esperar();
}
```

**Detectar que el humano ataca** sin API privilegiada:

```js
// Hook sobre la cola de comandos pública del host.
// El invitado envía 'action' por WebRTC; el host la encola con su id.
const cola = game.colaAcciones;
const nativePush = cola.push;
cola.push = function (...args) {
  for (const a of args) {
    if (a?.id !== game.idLocalActivo && TIPOS.has(a?.accion?.tipo)) {
      window.__mazeFollowHook.acciones.push({ t: Date.now(), tipo: a.accion.tipo });
    }
  }
  return nativePush.apply(cola, args);
};
// TIPOS = new Set(['fireball','bow','whirlwind','freeze'])
```

Además, la melé del invitado aparece en `game.registroAgente` como `tipo: 'combate'` con `datos.atacante === nick`.

**Enganchar a un enemigo**:

- Si `Chebyshev ≤ 1`: `whirlwind` (tecla 1) + **embestida** (moverse a su celda dispara una ronda de combate).
- Si está lejos: `bow` (tecla 4), `fireball` (2) si `Manhattan ≤ 5`, `freeze` (3) si `≤ 4`, y acercarse por BFS hasta distancia 2.
- Cooldowns = `10/agilidad` (arco), `30/inteligencia` (bola), `90/fuerza` (giro), `120/inteligencia` (congelar), en ms. Pulsar de más es inocuo: el juego ignora la habilidad si sigue en cooldown.
- **Cuidado**: las habilidades auto-apuntan al enemigo visible más cercano, no al que tú elegiste. Por eso no conviene usarlas cuando el humano está peleando: le robarían el objetivo.

### 6. Ejecutar el seguidor en segundo plano

```bash
setsid -f node /tmp/opencode/mazerpg_follow.mjs >/tmp/opencode/mazerpg_follow.log 2>&1 </dev/null
pgrep -af mazerpg_follow
tail -f /tmp/opencode/mazerpg_follow.log
```

`setsid -f` desacopla el proceso del shell; el log con timestamps permite auditar cada decisión (`modo=espero`, `modo=sigo`, `modo=ataco`, `modo=defensivo`).

### 7. Pitfalls reales (los que costaron tiempo)

1. **Bucle sin sleep**: si la rama "espero" no duerme, el seguidor gira a cientos de ticks/s y martillea CDP. Añade `await SLEEP(tickMs)` al final de **cada** iteración.
2. **Replay de eventos viejos**: al arrancar se relee el ring buffer de `registroAgente` y se registran combates pasados. Inicializa `ultimoSeq` al máximo del primer snapshot.
3. **Conexiones stale**: filtra `dc.readyState === 'open'` y `pc.connectionState === 'connected'`.
4. **Dos Chromes distintos**: la sesión del MCP y el host son procesos separados. Los tools del MCP **no** controlan el host; hay que hablar CDP con el perfil correcto (`DevToolsActivePort`).
5. **El host es el corazón**: si el proceso muere, el *heartbeat* de Firestore se detiene y la partida cae.
6. **Cambio de nodo**: al cruzar un portal cambian las dimensiones del mapa; recarga el mapa y no reutilices el anterior.

### 8. Resultado real de la sesión

- Partida Firebase: **`lobo-nuevo`** (host `Jugador`, invitado `Aragorn`).
- Host en `(40,34)`; humano localizado en `(2,45)` y luego `(4,45)`.
- BFS estimó **77 pasos**; el host recorrió **87** (el humano se movía) y quedó adyacente en `(7,44)`.
- Después, el seguidor mantuvo **2 casillas de camino**: host `(6,44)`, humano `(4,44)`.

## Consejo pro

**No construyas una API privilegiada para el agente: dale el mismo teclado que a un humano.** Separa los "ojos" (MCP/snapshot, solo lectura) de las "manos" (CDP/teclado) y mantén el host como un **proceso independiente** de la sesión del agente. Esa separación hace el sistema observable, depurable y honesto: todo lo que hace el agente lo podría hacer una persona mirando la pantalla.
