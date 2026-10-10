# Mundo persistente Fase 2 — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fase 2 del mundo persistente — arbitraje LWW real, persistencia completa de ediciones (fuera de burbuja + escenario/decor), casa duradera en Solo, enemigos por-nodo, arte para huéspedes y hardening de reglas Firestore.

**Architecture:** Híbrido deltas+snapshot sobre el contrato `partidas/{id}/mundos/{nodoId}` existente: ediciones interactivas viajan como `DeltaMundo` (autor-tick respetado, árbitro por celda), estado de sesión como `snapshot` por nodo (enemigos/escenario/celdas plegadas); la casa solo espeja ese mismo contrato a `localStorage`. Firestore es depositario asíncrono (sin listeners en vivo).

**Tech Stack:** TypeScript + Vite (build esbuild en runner), WebRTC datachannel (`NetworkManager`), Firestore compat SDK, GitHub Actions (hosting deploy), es runner propio `scripts/test.mjs` (compila `src/world/*.helpers.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-10-10-mundo-persistente-fase2-design.md` (leerla junto al plan; aquí se citan sus decisiones).

## Global Constraints

- Trabajo en **worktree** `feature/mundo-persistente-fase2` desde `main` @ `0201791`; **nunca** commitear directamente en `main` local.
- Retrocompatibilidad: `fmt` de deltas queda en 1 (no cambiar); docs de nodo/snapshot usan campo `formato` (ausencia = 1). Datos de fase 1 sin migración; cliente viejo + payload nuevo no crashea.
- **Cuota**: Firestore = depositario asíncrono. Prohibido: listener en vivo sobre `deltas`, escritura por tick, escritura por visitantes en `deltas`. Snapshot de enemigos: 1 escritura por salida de nodo.
- Política de nodos personales: **ya existente** en `GestorMundo.aplicarDelta` (`puedeEditarNodo`) — conservarla y probarla.
- El juego corre en español: nombres de código en español, mensajes de UI en español (estilo existente).
- Runner de specs: solo `src/world/*.helpers.spec.ts` se compilan y corren (`pnpm test`). Microbenchmarks como aserciones con `performance.now()` DENTRO de estas specs.
- Muro de calidad por task: `pnpm test` verde; al cierre: `tsc` 0 · `build` OK · `verify_sprites` 71/0.
- Nada de secretos/valores de Firebase en el repo o logs (las reglas ni el plan los contienen).

## Review Focus

1. **Mensaje sin `tick` (cliente fase 1)**: esperar comportamiento de fase 1 (re-sello local) sin crash — Task 3.
2. **Delta de visitante en casa ajena** (`autoria ≠ ownerId`): el árbol debe rechazarlo (política dueño) — Task 5 (test puedeEditarNodo).
3. **`localStorage` lleno al guardar espejo de casa**: degradar con aviso, jamás tumbar arranque — Task 6.
4. **Snapshot corrupto/parcial en Firestore o espejo**: cargar ignorando pieza corrupta y regenerando por gen (mundo siempre jugable) — Task 5/6.
5. **Secciones desconocidas en `serializarMapa` v2** (formatos futuros): decoder las salta sin romper el bloque base — Task 2.

---

### Task 1: Delta `decor` y helpers de tick en `mundo.ts`

**Files:**
- Modify: `src/world/mundo.ts`
- Test: `src/world/mundo.helpers.spec.ts`

**Interfaces:**
- Produces: `DeltaCambio` añade `| { tipo: 'decor'; campo: 'sueloDecor' | 'mueble'; valor: string | null }`; `aplicarDelta` maneja `decor` (`celda.sueloDecor = valor || null` / `celda.mueble = valor || null`); nueva `conTickAutor(base: Omit<DeltaMundo,'tick'>, tickAutor: number | null | undefined, fallbackTick: number): DeltaMundo` (devuelve `{ ...base, tick: tickAutor ?? fallbackTick }`).
- Consumes: nada nuevo.

- [ ] **Step 1: Escribir tests fallidos en `mundo.helpers.spec.ts`**: `aplicarDelta decor mueble` (set + null reset), `aplicarDelta decor sueloDecor`, `conTickAutor usa tick del autor`, `conTickAutor cae al fallback si tickAutor null`.
- [ ] **Step 2: Run**: `pnpm test` → FAIL (tipo/case inexistente).
- [ ] **Step 3: Implementar** en `mundo.ts` los dos puntos de la interfaz (cuerpo trivial; sin lógica extra).
- [ ] **Step 4: Run**: `pnpm test` → PASS.
- [ ] **Step 5: Commit** `git add src/world/mundo.ts src/world/mundo.helpers.spec.ts && git commit -m "feat(mundo): delta decor (mueble/sueloDecor) + conTickAutor"`

### Task 2: `serializarMapa` v2 (secciones dispersas) + presupuesto

**Files:**
- Modify: `src/world/serialization.ts`
- Test: `src/world/serialization.helpers.spec.ts` (nuevo)

**Interfaces:**
- Consumes: nada.
- Produces: `serializarMapa(mapa: Celda[][], opts?: { v2?: boolean }): string` — bloque v1 sin cambios + tail `|S...|D...|E...` solo si `v2`; secciones S (`sueloDecor`), D (`mueble`), E (`tipoEscenario ≠ 'ninguno'`);
 formato de sección: `|LETRA` + registros separados por `;`, campos por `,`, coordenadas en base36, valores textuales (`puerta`, `trampa`, `idle`, `abierta`, `cerrada`, nombre de mueble) tal cual; triple E = `f,c,tipo,estado`. `deserializarMapa(mapa, datos): { filas, columnas }` inalterada en firma: tras el bloque base, si hay `|`, decodifica secciones sobre las celdas en rango; **sección con letra desconocida se salta hasta el próximo `|`**; payload v1 (sin `|`) idéntico a fase 1 — verificar que el deserializador de fase 1 ignora el tail (así el cliente viejo tolera v2).

- [ ] **Step 1: Tests fallidos en `serialization.helpers.spec.ts`**: v1 round-trip idéntico a hoy; v2 round-trip conserva muros/transitable + `sueloDecor`/`mueble`/escenario en celdas concretas; v2 sin decor → tail ausente; receptor-v1: `deserializarMapa` de fase 1 con payload v2 no crashea y lee {filas,columnas} correctos (simular extrayendo solo el bloque); sección desconocida `|X1,1,zz|` saltada sin crash; presupuesto: decode mapa 60×60 con v2 **≤ 5 ms** y encode nodo + `JSON.stringify` de snapshot de enemigos de 40 enemigos **≤ 10 ms** (`performance.now()`/`node:perf_hooks`).
- [ ] **Step 2: Run**: `pnpm test` → FAIL (funciones/cases nuevos).
- [ ] **Step 3: Implementar** en `serialization.ts` (algoritmo tail: recorrer celdas, emitir triples solo con valor ≠ def; secciones en orden S,D,E; decoder tolerante).
- [ ] **Step 4: Run**: `pnpm test` → PASS (incluida aserción de presupuesto).
- [ ] **Step 5: Commit** `git add src/world/serialization.ts src/world/serialization.helpers.spec.ts && git commit -m "feat(world): serialización v2 con secciones dispersas + presupuesto"`

### Task 3: LWW real — el tick del autor viaja y se respeta

**Files:**
- Modify: `src/main.ts` (`construirDelta`, emisores `dig_completed`/`pick_collected`/`shield_collected`/`food_consumed`/`object_spawned`, handlers de esos mensajes)
- Tests: `src/world/arbitroDeltas.helpers.spec.ts`, `src/world/mundo.helpers.spec.ts`

**Interfaces:**
- Consumes: `conTickAutor` (Task 1), `ArbitroDeltas.puedeAplicar` (existente).
- Produces: `construirDelta(fila, columna, cambio, autoria, tickAutor?: number | null)` en `main.ts` usa `conTickAutor` con `fallbackTick = this.siguienteTickMundo()`; los emisores adjuntan `tick: <delta.tick>` de la edición ya aplicada; los handlers construyen el delta con `tickAutor = typeof msg.tick === 'number' ? msg.tick : null`.

- [ ] **Step 1: Escribir tests fallidos**: en `arbitroDeltas.helpers.spec.ts` — delta con tick menor tras uno mayor → `puedeAplicar` **false**; `registrar` + re-entrante con tick igual → true (empate→entrante). En `mundo.helpers.spec.ts` — `conTickAutor` ya cubierto (Task 1).
- [ ] **Step 2: Run** `pnpm test` → el caso `puedeAplicar false` **debe fallar solo si el árbitro está mal**; si pasa, es el spec de red (main.ts) el que falla — registrar en la revisión qué falló exactamente.
- [ ] **Step 3: Implementar** en `main.ts` (puntos: `construirDelta` firma + 5 emisores + 5 handlers; NO tocar `ArbitroDeltas`).
- [ ] **Step 4: Run** `pnpm test` → PASS.
- [ ] **Step 5: Verificación de coherencia**: `tsc` (o `pnpm exec tsc --noEmit`) → 0.
- [ ] **Step 6: Commit** `git add src/main.ts src/world/arbitroDeltas.helpers.spec.ts && git commit -m "fix(mundo): LWW real — tick del autor viaja por red y se respeta (I2)"`

### Task 4: La burbuja gobierna la sim; las ediciones son del mundo

**Files:**
- Modify: `src/main.ts` (guardias `enBurbujaSim` en `resolverAccion` y handlers de deltas: líneas ~1810, ~2665, ~2856–2875), productores de `escenario` si existen mutaciones en runtime (paso grep)
- Tests: `src/world/burbuja.helpers.spec.ts` (semántica intacta), verificación manual de guardias

**Interfaces:**
- Consumes: `dentroDeBurbuja`/`radioSimPorDefecto` (burbuja.ts, sin cambios).
- Produces: las acciones que producen delta (`cavar`, recoger, crear comida, escenario) **bypassan** la guardia de burbuja; `mover` y lógica de entidades SIM siguen guardadas.

- [ ] **Step 1: grep** de mutaciones directas `tipoEscenario`/`estadoEscenario` fuera de `structor/generadores` — cada punto runtime se convierte en productor de delta `{ tipo:'escenario' }`; si no hay puntos runtime, la regla queda como guía (no crear demo artificial).
- [ ] **Step 2: Editar** guardias: `resolverAccion` → la guardia de burbuja solo envuelve acciones de sim; handlers de deltas → se elimina el `enBurbujaSim` de esos `case` (el árbitro + política de dueño siguen mandando).
- [ ] **Step 3: Run** `pnpm test` → PASS (burbuja intacta; el mundo no cambia aquí).
- [ ] **Step 4: Commit** `git add src/main.ts && git commit -m "feat(mundo): persistencia completa — ediciones válidas fuera de radioSim; escenario via delta"`

### Task 5: Snapshot por nodo (enemigos + plegado) en `PersistenciaMundo` y `mundo.ts`

**Files:**
- Modify: `src/world/mundo.ts` (tipos), `src/world/PersistenciaMundo.ts`
- Modify: `src/main.ts` (hooks en `atravesarConector`: fotografía del nodo saliente + restauración del destino)
- Tests: `src/world/persistenciaMundo.helpers.spec.ts` (nuevo), `src/world/integracion.helpers.spec.ts` (restauración)

**Interfaces:**
- Produces (mundo.ts): `export interface EnemigoFoto { id: string; fila: number; columna: number; nombre: string; tipo: string; vidaActual: number; vidaMaxima: number }`; `export interface EscenarioFoto { fila: number; columna: number; tipoEscenario: string; estadoEscenario: string }`; `export interface SnapshotNodo { formato: 1; enemigos?: EnemigoFoto[]; escenario?: EscenarioFoto[]; celdas?: DeltaMundo[] }`.
- Produces (PersistenciaMundo.ts): `guardarSnapshotParcial(nodoId: string, parcial: Omit<Partial<SnapshotNodo>,'formato'>): Promise<void>` — leer snapshot actual (`cargarNodo`), fusionar la parte y `set` (merge:true); `compactarNodo` pasa a usar `SnapshotNodo` (deltas ≤ hastaTick consolidados por celda vía `resolverLWW` quedan en `snapshot.celdas`).
- Produces (main.ts): al salir de nodo — foto de `listaDeEnemigos` → `guardarSnapshotParcial(nodoSalienteId, { enemigos })` (Firebase) **o** espejo local (Task 7, si no hay Firebase); al entrar — si el destino tiene `snapshot.enemigos` → reconstruir `EnemigoNPC` en esas posiciones (constructor exacto: `new EnemigoNPC(f, c, nombre, tipo, id, dificultad)`, luego `vidaActual = v; vidaMaxima = vm; setupEntity(e)` igual que el handler `'enemigos'`); si no hay foto ⇒ siembra por gen como hoy.

- [ ] **Step 1: Tests fallidos en `persistenciaMundo.helpers.spec.ts`** (Firestore fake en memoria, estilo interfaces `DocLike` ya existentes): `guardarSnapshotParcial fusiona enemigos sin pisar celdas`; `compactarNodo guarda SnapshotNodo con formato 1 y celdas LWW-consolidadas`; delta ≤ hastaTick plegado, > hastaTick intacto. En `GestorMundo.helpers.spec.ts`: delta de visitante (`autoria ≠ ownerId`) sobre nodo personal → `aplicarDelta` devuelve **false** (la política `puedeEditarNodo` queda probada — Review Focus #2).
- [ ] **Step 2: Run** `pnpm test` → FAIL.
- [ ] **Step 3: Implementar** tipos + `guardarSnapshotParcial` + `compactarNodo` v2.
- [ ] **Step 4: Run** `pnpm test` → PASS.
- [ ] **Step 5: Hooks en `main.ts`** (`atravesarConector`): fotografía + restauración descritas arriba (respetando el patrón del handler `'enemigos'` de fase 1).
- [ ] **Step 6: Test de restauración en `integracion.helpers.spec.ts`**: foto con enemigo muerto + vivo en posiciones → restaurado fiel.
- [ ] **Step 7: Run** `pnpm test` → PASS.
- [ ] **Step 8: Commit** `git add src/world/mundo.ts src/world/PersistenciaMundo.ts src/world/persistenciaMundo.helpers.spec.ts src/main.ts src/world/integracion.helpers.spec.ts && git commit -m "feat(mundo): snapshot por nodo (enemigos/escenario/celdas) + restauración al travesar"`

### Task 6: Espejo local (casa duradera en Solo)

**Files:**
- Create: `src/world/espejoLocal.ts`
- Test: `src/world/espejoLocal.helpers.spec.ts` (nuevo)
- Modify: `src/main.ts` (adopción de casa en `sembrarMundoBase`/`housingDecision`: rehidratar historia; guardar estado resultado con debounce; snapshot de enemigos de la casa al espejo)

**Interfaces:**
- Consumes: `AlmacenamientoLocal` (housing.ts), `SnapshotNodo`/`DeltaMundo` (mundo.ts).
- Produces (espejoLocal.ts): `export interface DocNodoLocal { formato: number; gen: GenSpec; ownerId: string | null; deltas: DeltaMundo[]; snapshot: SnapshotNodo | null; ultimaCompactacionTick: number }`; clase `EspejoLocal` con `guardarDoc(nodoId: string, doc: DocNodoLocal): void` (`mazerpg.mundo.<nodoId>`, `try/catch` cuota con `console.warn` como `guardarCasa`), `cargarDoc(nodoId: string): DocNodoLocal | null` (JSON defensivo), `borrarDoc(nodoId: string): void`; export `PREFIJO_MUNDO = 'mazerpg.mundo.'`.
- Produces (mundo.ts): `export function rehidratarHistoria(nodoCeldas: Celda[][], doc: DocNodoLocal): void` — aplica `snapshot.celdas` (plegadas) y luego deltas ordenados por tick con `aplicarDelta`.
- Main.ts: si `EspejoLocal.cargarDoc(casaId)` existe ⇒ tras sembrar la casa base (`casaPrevia`) se llama `rehidratarHistoria` y **no se regenera**; cada delta aplicado en la casa (o al salir/cerrar, debounce) → `guardarDoc` con deltas+snapshot compactado; «CREAR UNA NUEVA» ⇒ `borrarDoc`.

- [ ] **Step 1: Tests fallidos en `espejoLocal.helpers.spec.ts`**: guardar/cargar round-trip con deltas y snapshot; cuota llena (setItem que lanza `QuotaExceededError`) → `guardarDoc` NO lanza y avisa; doc corrupto → `cargarDoc` null; `rehidratarHistoria` rehidrta cavar+decor+escenario en orden por tick (snapshot.celdas primero).
- [ ] **Step 2: Run** `pnpm test` → FAIL.
- [ ] **Step 3: Implementar** `espejoLocal.ts` + `rehidratarHistoria`.
- [ ] **Step 4: Run** `pnpm test` → PASS.
- [ ] **Step 5: Wire en `main.ts`** (adopción, guardado debounced, reset al crear nueva) — el flujo completo de la casa duradera.
- [ ] **Step 6: Run** `pnpm test` → PASS · `tsc` → 0.
- [ ] **Step 7: Commit** `git add src/world/espejoLocal.ts src/world/espejoLocal.helpers.spec.ts src/world/mundo.ts src/main.ts && git commit -m "feat(housing): casa duradera — espejo local del contrato mundos (deltas+snapshot)"`

### Task 7: Arte para huéspedes — envío v2 y decor por el aire

**Files:**
- Modify: `src/main.ts` (`enviarMapaAlInvitado`: `serializarMapa(this.mapaLaberinto, { v2: true })`; `guardarSnapshot` del host usa fotos de enemigos {f,c,n,t,v,vm} ⇒ mapea a `EnemigoFoto` al persistir)
- Tests: `src/world/serialization.helpers.spec.ts` ya cubre round-trip; añadir caso: `v2 con casa decorada preserva muebles tras decode` (Task 2 lo tiene si se pidió aquí)

**Interfaces:**
- Consumes: `serializarMapa`/`deserializarMapa` v2 (Task 2), `EnemigoFoto` (Task 5).
- Produces: invitados renderizan `sueloDecor`/`mueble`/escenario del host; el mapa se envía `v2` en `enviarMapaAlInvitado` (único punto de envío de mapa completo).

- [ ] **Step 1: Editar** `enviarMapaAlInvitado` para `v2: true` y alinear el volcado de enemigos ({id,f,c,n,t,v,vm}) con la foto persistida.
- [ ] **Step 2: Run** `pnpm test` → PASS · `tsc` 0.
- [ ] **Step 3: Commit** `git add src/main.ts && git commit -m "feat(net): mapa v2 al invitado — decor/escenario viajan (huéspedes ven el arte)"`

### Task 8: Hardening — `firestore.rules` + despliegue CI + firebase.json

**Files:**
- Create: `firestore.rules`
- Modify: `firebase.json` (bloque `"firestore": { "rules": "firestore.rules" }`), `.github/workflows/firebase-hosting-merge.yml` y `firebase-hosting-pull-request.yml` (paso de despliegue de reglas)
- Test: sin spec local (S5); verificación = despliegue + aceptación del mando

**Interfaces:**
- Consumes: formas reales verificadas de `FirebaseManager` — `partidas/{pid}`: `{hostId: string, hostNick: string, creacion: number, numJugadores: number, estado: string, lastSeen: number}`; subcolecciones `conexiones/{guestId}` (+ `iceCandidatesHost|Guest`), `mundos/{nodoId}` (+ `deltas/{autoId}`).
- Produces: `firestore.rules` — match `partidas/{pid}` con `pid.matches('^[a-zA-Z0-9_-]{4,40}$')`; write de partida con validación de campos (strings ≤ 64 chars, números ≥ 0) y `request.resource.data.size() < 1024`; subdocos: read/write con mismo match + `request.resource.data.size() < 4096`; `match /{document=**} { allow read, write: if false; }` final. Antes de codificar: `grep` de TODAS las escrituras (FirebaseManager + NetworkManager signaling) y calcarse.
- CI: paso nuevo en ambos workflows: escribir el secret de SA a un archivo (`$RUNNER_TEMP`, sin loguear), `GOOGLE_APPLICATION_CREDENTIALS=... npx -y firebase-tools@latest deploy --only firestore:rules --project mazerpg-b2aa4 --json` — si falla por rol SA, documentar en el mensaje de error del step la instrucción de concesión (roles Firebase Rules) o desplegar manual por batuta.

- [ ] **Step 1: grep** escrituras reales (FirebaseManager + NetworkManager + main.ts persistencia) y listar campos/tamaños.
- [ ] **Step 2: Escribir** `firestore.rules` calcándose; añadir bloque a `firebase.json`.
- [ ] **Step 3: Añadir** paso de despliegue en ambos workflows (SA→archivo en `$RUNNER_TEMP`; nunca `echo` del secret al log).
- [ ] **Step 4: Verificación local**: `npx -y firebase-tools@latest deploy --only firestore:rules --project mazerpg-b2aa4 --json --force` **NO** se ejecuta desde el worktree (requiere credenciales) — dejar al CI/aceptación; local solo linter sintáctico si existe.
- [ ] **Step 5: Commit** `git add firestore.rules firebase.json .github/workflows/firebase-hosting-merge.yml .github/workflows/firebase-hosting-pull-request.yml && git commit -m "chore(security): reglas Firestore versionadas + despliegue en CI"`

### Task 9: Muro de calidad + integración

**Files:**
- Test: todos los specs del mundo; smoke headless (scripts existentes de fase 1)

- [ ] **Step 1: `pnpm exec tsc --noEmit`** → 0 errores.
- [ ] **Step 2: `pnpm test`** → todas las specs PASS (incluidas aserciones de presupuesto).
- [ ] **Step 3: `pnpm build`** → OK.
- [ ] **Step 4: `verify_sprites`** → 71/0.
- [ ] **Step 5: Smoke headless 2 clientes** (runner de fase 1): host edita fuera de su burbuja → invitado lo recibe; invitado pinta decor/escenario; misma celda host+invitado → gana el nuevo (log LWW); recarga → casa duradera.
- [ ] **Step 6:** revisión whole-branch + merge a `main` local SOLO tras visto del mando (batuta), push y CI verde.
- [ ] **Step 7: Commit final** (si quedan sueltos) `git add -A && git commit -m "chore: fase 2 mundo persistente — revisión final"`

---

**Nota de ejecución:** subagent-driven (precedente fase 1). Cada task termina commiteando **en el worktree**. La lista de aceptación del mando (§6 de la spec) ejecuta tras el merge.