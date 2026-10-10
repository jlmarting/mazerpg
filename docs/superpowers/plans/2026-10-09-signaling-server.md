# Servidor local de signaling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el servidor HTTP de signaling local (`:8080`) que `src/network/SignalingClient.ts` espera, en Node sin dependencias.

**Architecture:** Un único fichero `server/signaling.mjs` con el módulo `node:http`, estado en memoria (dos `Map`), expiración perezosa de partidas a ~60 s, CORS abierto y `PORT` configurable. No toca el juego ni el cliente.

**Tech Stack:** Node.js (ESM, sin dependencias), `node:http` + `node:url`. Tests con `node:test`? No: ver abajo.

**Spec:** `~/Aureus/DEVCONTEXT/10_proyectos/mazerpg/sesiones/20261009c-signaling-server/agent/01-spec-servidor-signaling.md` (y propuesta `propuestas/20261009-agent-servidor-signaling-local.md`).

## Global Constraints

- Node sin dependencias npm; ESM (`.mjs`).
- Contrato del cliente exacto (rutas/cuerpos/respuestas de la spec §Contrato).
- `PORT` por defecto `8080`; escucha en `0.0.0.0`.
- Expiración ~60 s sin heartbeat.
- CORS: `Access-Control-Allow-Origin: *`, `Allow-Methods: GET,POST,DELETE,OPTIONS`, `Allow-Headers: Content-Type`; `OPTIONS` → 204.
- No romper la app: `pnpm build`, `pnpm test`, `tsc` deben seguir verdes.

## Review Focus

1. **Preflight CORS**: `OPTIONS` a cualquier ruta responde 204 con cabeceras, o el navegador bloquea el POST/JDELETE (Content-Type: application/json dispara preflight).
2. **Señal dirigida y bandeja vaciada**: `POST /signal/:partida/:from` debe entregarse SOLO al `toId`, y `GET /signal/:partida/:peer` debe devolverlas y vaciarlas (si no, se re-entregan infinitamente).
3. **Partida inexistente**: heartbeat/guests/signal a un `:id` desconocido → 404 (no 200 silencioso ni crash).
4. **Expiración**: una partida sin heartbeat deja de aparecer en `GET /partidas` pasados ~60 s; una con heartbeat reciente, sí aparece.
5. **JSON inválido / cuerpo vacío**: no debe tumbar el proceso (400/200 coherente, nunca uncaught).

---

### Task 1: Servidor + test + scripts + docs

**Files:**
- Create: `server/signaling.mjs`
- Create: `server/signaling.spec.mjs`
- Create: `server/README.md`
- Modify: `package.json` (scripts `"signaling"` y `"test:server"`)

**Interfaces:**
- Produces:
  - `crearServidor({ ahora }: { ahora?: () => number }): http.Server` — fábrica exportada; `ahora` inyectable para testear expiración sin esperar 60 s (default `Date.now`). No arranca el listener (eso lo hace el `import.meta.url` main).
  - El módulo, al ejecutarse como main (`node server/signaling.mjs`), hace `listen(PORT, '0.0.0.0')` con `PORT = Number(process.env.PORT) || 8080`.
  - Estado interno: `partidas: Map<string, Partida>` y `senales: Map<string, Senal[]>` (claves `"{partida}:{peer}"`).
  - `Partida = { id, hostId, hostNick, nombre?, numJugadores, creacion, ultimoHb, guests: Map<string,{guestId,nick}> }`
  - `Senal = { fromId, type, data }`
- El test importa `crearServidor` y lo escucha en `port: 0` (puerto efímero), lee `server.address().port`, ejerce el flujo con `fetch` (Node 20 lo tiene global) y cierra.

- [ ] **Step 1: Escribir el spec (TDD, en rojo)**

`server/signaling.spec.mjs`: importa `crearServidor` (falla: no existe), arranca en puerto efímero y ejecuta, con aserciones que imprimen `N/N ok` y `process.exit(1)` en fallo:
- `POST /partidas` devuelve `{id}`; `GET /partidas` lo incluye con `numJugadores`/`hostNick`.
- `POST /partidas/:id/guests` + `GET …/guests` reflejan el guest; `DELETE …/guests/:gid` lo quita.
- `POST /signal/:p/:from {toId,payload}` → `GET /signal/:p/:to` devuelve `{senales:[{fromId,type,data}]}` con los datos correctos; una segunda `GET` devuelve `{senales:[]}` (bandeja vaciada).
- `POST /partidas/:id/hb` actualiza `ultimoHb`; con `ahora` inyectado que avanza 61 s, `GET /partidas` ya no incluye la partida.
- `OPTIONS /cualquier-cosa` → `204` con `access-control-allow-origin: *`.
- `POST /signal/:inexistente/:from` → `404`.
- JSON inválido en el cuerpo → `400` (sin tumbar el server; una petición posterior sigue funcionando).

- [ ] **Step 2: Ejecutar el spec y verlo fallar**

Run: `node server/signaling.spec.mjs`
Expected: FAIL en el import de `crearServidor` (no existe `server/signaling.mjs`).

- [ ] **Step 3: Implementar `server/signaling.mjs`**

`crearServidor({ahora=Date.now})` devuelve un `http.Server`; el handler:
- Añade SIEMPRE cabeceras CORS; `OPTIONS` → 204 y fin.
- Enruta con `new URL(req.url, 'http://x')`; `parseBody(req)` async (JSON; cuerpo vacío → `{}`; inválido → 400).
- Implementa los 8 endpoints del contrato. `POST /partidas` genera id corto (`Math.random().toString(36).slice(2,8)`); `GET /partidas` purga antes de listar (`ahora() - (ultimoHb ?? creacion) > 60000`).
- `GET /signal/:partida/:peer`: entrega la bandeja del peer y la vacía (`senales.delete(clave)`).
- Errores: ruta desconocida → 404; `:id` de partida inexistente en hb/guests/signal → 404.
- Bloque final: si `import.meta.url === pathToFileURL(process.argv[1]).href`, `listen`.

- [ ] **Step 4: Ejecutar el spec y verlo pasar**

Run: `node server/signaling.spec.mjs`
Expected: `N/N ok`, exit 0.

- [ ] **Step 5: `package.json` (scripts) + `server/README.md`**

Añade en `scripts`: `"signaling": "node server/signaling.mjs"` y `"test:server": "node server/signaling.spec.mjs"`. `server/README.md`: qué es, `node server/signaling.mjs`, `PORT` (default 8080), URL del cliente (`http://<host>:8080`), y que el modo Servidor Local del juego apunta ahí. Nota: no tocar el script `test` existente.

- [ ] **Step 6: Verificación global**

Run: `pnpm test:server && pnpm tsc --noEmit && pnpm build && pnpm test`
Expected: server spec verde; tsc 0; build OK; app 9/9.

- [ ] **Step 7: Commit**

```bash
git add server/signaling.mjs server/signaling.spec.mjs server/README.md package.json
git commit -m "feat(server): servidor local de signaling (Node sin dependencias)"
```

---

## Self-review (contra la spec)

1. **Cobertura §Contrato**: los 8 endpoints en Task 1 Step 3; la spec de aceptación se mapea a los Steps 1/4/6.
2. **Step scan**: cada paso deja una acción con resultado comprobable; sin "TBD".
3. **Tipos**: `Partida`/`Senal` coherentes entre Steps 1/3.
4. **Review Focus**: los 5 riesgos tienen aserción en el spec de Task 1 Step 1.
5. **Proporción**: una task; el plan no transcribe el servidor entero, fija el contrato y los casos de test.
