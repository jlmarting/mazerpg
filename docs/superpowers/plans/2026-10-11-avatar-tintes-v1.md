# Avatar v1 (tintes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el avatar v1: tintes por zona remapeados en runtime, visibles en remoto y persistentes (sesión + partida).

**Architecture:** Núcleo puro sin DOM (`avatarTintes.ts`, testeado en node) + adaptador canvas (`AvatarCompositor.ts`) + integración mínima (una llamada en `Renderer`, campo opcional en handshake, doc por jugador en Firestore).

**Tech Stack:** TypeScript estricto, Canvas 2D, WebRTC DataChannel, Firestore, `scripts/test.mjs` (esbuild + node).

**Spec:** `docs/proposals/2026-10-11-avatar-tintes-v1.md`

## Global Constraints

- Rama de trabajo: `feature/avatar-tintes-v1` (creada en la Tarea 1; todo commit va ahí, nunca a `main`).
- `pnpm build` = `tsc && vite build`: el build debe estar verde tras cada tarea.
- Tests nuevos: estilo existente (`assert` + `throw`, ver `src/world/housing.helpers.spec.ts`), ficheros `*.helpers.spec.ts`, se ejecutan con `pnpm test`.
- Paletas cerradas, sin color libre. Umbral de remapeo 40. LRU de 64 entradas.
- Campo `apariencia` siempre opcional en red; clientes viejos lo ignoran.
- `sanearApariencia` en TODA frontera; el render nunca recibe dato inválido.

## Review Focus

- Handshake de cliente viejo sin `apariencia` → se ve defecto de su clase (test en Tarea 3).
- `AparienciaAvatar` con `formato: 2` (futuro) → saneado a defecto, sin romper (test en Tarea 1).
- Sprite base inexistente o compositor con imagen sin dimensiones → sprite sin tintes + log, nunca excepción en el loop (test en Tarea 2).
- `localStorage` con `avatar` corrupto → defecto de clase, la sesión reanuda (test en Tarea 4).
- Firestore deniega `jugadores/{id}` (reglas) → el avatar sigue viajando por handshake; error logueado, sin romper el join (test manual en Tarea 6).

---

## Estructura de ficheros

- Crear `src/core/avatarTintes.ts` — puro sin DOM: tipos re-exportados, `distanciaRgb`, `aplicarTintes(datos, origen, destino)`, `sanearApariencia`, `aparienciaEfectiva`, `claveVariante`, `LRUCache`. Responsabilidad: toda decisión testeable en node.
- Crear `src/core/avatarTintes.helpers.spec.ts` — specs del anterior (exige ampliar el glob de `scripts/test.mjs`).
- Crear `src/core/AvatarCompositor.ts` — adaptador DOM: `obtenerVariante(sm, nombreSprite, clase, apariencia): string | null`. Responsabilidad: píxeles y caché de canvas, nada de red ni UI.
- Crear `src/config/apariencia.ts` — `PALETAS` (4 zonas × 6–8 hex), `ORIGEN_ZONA` (por clase, `string | null`), `APARIENCIA_DEFECTO`, `UMBRAL_TINTE = 40`, `LRU_MAX = 64`.
- Modificar `src/types/index.ts` — añadir `ZonaAvatar`, `AparienciaAvatar`.
- Modificar `src/core/SpriteManager.ts` — `SpriteInfo.image: CanvasImageSource` + `definirSpriteCanvas(nombre, canvas)` + `eliminarSprite(nombre)`.
- Modificar `src/core/Renderer.ts` (~L218–253) — resolver variante tineada antes de `dibujarSprite`.
- Modificar `src/entities/Jugador.ts` + `src/entities/JugadorRemoto.ts` — campo `apariencia`.
- Modificar `src/network/NetworkManager.ts` (~L78), `src/network/NetworkManagerHttp.ts` (~L46), `src/main.ts` (~L3034 handshake forzado, ~L3013 entidad, nuevo `case 'avatar'`, `onSaveCharacter` L375, `getCharacterData` L442, `guardarSesion` L912, `reanudarPartida` L923).
- Modificar `src/ui/LobbyManager.ts` (`CharacterData`, `saveCharacter` L199, preview) + `index.html` (`characterModal` L233: swatches + `<canvas id="avatarPreview">`).
- Modificar `src/network/FirebaseManager.ts` (guardar/leer doc `jugadores/{id}`) + `firestore.rules` (subcolección bajo `partidas/{pid}`).

---

### Task 1: Base pura + tipos + config + runner

**Files:**
- Create: `src/core/avatarTintes.ts`, `src/core/avatarTintes.helpers.spec.ts`, `src/config/apariencia.ts`
- Modify: `src/types/index.ts` (añadir tipos), `scripts/test.mjs` (glob `src/world` → `src/**/*.helpers.spec.ts`)

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: `ZonaAvatar`, `AparienciaAvatar` (definidos en `avatarTintes.ts`, re-exportados en `src/types/index.ts`), `PALETAS`, `ORIGEN_ZONA: Record<ZonaAvatar, string[]>` (lista de tonos-origen por zona; vacía = no mapeada), `APARIENCIA_DEFECTO` (= primeros tonos de ORIGEN por clase ≡ sprite actual), `sanearApariencia(a: unknown, clase: string): AparienciaAvatar`, `aparienciaEfectiva(clase: string, a?: AparienciaAvatar): AparienciaAvatar`, `aplicarTintes(datos: Uint8ClampedArray, origen: Record<ZonaAvatar, string[]>, destino: Record<ZonaAvatar, string>, umbral = 40): void`, `claveVariante(clase: string, frame: string, a: AparienciaAvatar): string`, `LRUCache<T>` con `get/set` y desalojo al superar 64.

- [ ] **Step 1: Crear la rama** — Run: `git checkout -b feature/avatar-tintes-v1` — Expected: `git branch --show-current` → `feature/avatar-tintes-v1`.
- [ ] **Step 2: Fijar valores de config** — En `src/config/apariencia.ts`: 4 zonas (`piel|pelo|torso|piernas`), 6–8 hex por zona en `PALETAS`; `ORIGEN_ZONA` por clase con los tonos muestreados (explorador: pelo `[#4a301a]`, torso `[#143c1e,#2e783c]`, piernas `[#8b5a2b]`, piel `[]`; mago: pelo `[#463c5a]`, torso `[#2d1455,#693caf]`, piernas `[#cdcde1]`, piel `[]`; guerrero: todo `[]` — aplanado en Tarea 2); `APARIENCIA_DEFECTO[clase]` = primeros tonos de su ORIGEN (piel = `PALETAS.piel[0]`).
- [ ] **Step 3: Escribir el spec que falla** — `src/core/avatarTintes.helpers.spec.ts` con: saneado de `{formato: 2}` → defecto; saneado de color fuera de paleta → defecto; `aplicarTintes` sobre 2×2 píxeles (origen→destino exacto, transparente intacto, color lejano intacto); LRU desaloja la entrada 65. Run: `pnpm test` — Expected: FAIL (módulo no existe).
- [ ] **Step 4: Ampliar el runner** — En `scripts/test.mjs`: `dirSpecs = src/world` → búsqueda recursiva `src/**/*.helpers.spec.ts`. Run: `pnpm test` — Expected: encuentra el spec nuevo (y sigue pasando los existentes).
- [ ] **Step 5: Implementar `src/core/avatarTintes.ts` + tipos** — Firmas exactas del bloque Interfaces; `aplicarTintes` conserva sombreado (traslada delta de luminosidad vs. origen). Run: `pnpm test` — Expected: PASS todo. Run: `pnpm build` — Expected: verde.
- [ ] **Step 6: Commit** — `git add scripts/test.mjs src/core/avatarTintes.ts src/core/avatarTintes.helpers.spec.ts src/config/apariencia.ts src/types/index.ts && git commit -m "feat(avatar): base pura de tintes + tipos + config"`.

### Task 2: SpriteManager canvas + Compositor (+ retoque base si hace falta)

**Files:**
- Create: `src/core/AvatarCompositor.ts`
- Modify: `src/core/SpriteManager.ts`, PNGs en `public/sprites/` (solo si hay zona `null` en ORIGEN_ZONA)

**Interfaces:**
- Consumes: `sanearApariencia`, `aplicarTintes`, `claveVariante`, `LRUCache`, `UMBRAL_TINTE`, `LRU_MAX` (Task 1).
- Produces: `AvatarCompositor.obtenerVariante(sm: SpriteManager, nombreSprite: string, clase: string, apariencia: AparienciaAvatar): string | null` (nombre registrado `tinte:<claveVariante>` o `null` si falla); `SpriteManager.definirSpriteCanvas(nombre, canvas)`, `SpriteManager.eliminarSprite(nombre)`.

- [ ] **Step 1: Test de `definirSpriteCanvas`/`eliminarSprite`** — Añadir a un spec node-compatible un test que falle sin los métodos (puede ser un spec mínimo `src/core/spriteManager.helpers.spec.ts` que importe solo tipos… `SpriteManager` usa `Image`/`document` solo dentro de métodos, no en import — verificar al implementar; si el import rompe node, el test se limita a `eliminarSprite` sobre mapa interno vía `definirSprite` simulado). Run: `pnpm test` — Expected: FAIL.
- [ ] **Step 2: Implementar cambios de SpriteManager** — `SpriteInfo.image: CanvasImageSource`; `definirSpriteCanvas(nombre, canvas: HTMLCanvasElement)` registra `{image: canvas, sx: 0, sy: 0, sw: canvas.width, sh: canvas.height}`; `eliminarSprite(nombre)` borra del mapa. Run: `pnpm test` + `pnpm build` — Expected: PASS/verde.
- [ ] **Step 3: Implementar `AvatarCompositor`** — `obtenerVariante`: `sanearApariencia` → si es defecto, retorna `null` (el llamador usa la ruta actual); si no: busca en LRU por `claveVariante`; si falta: `obtenerSprite` → offscreen canvas del recorte → `getImageData` → `aplicarTintes` → `putImageData` → `definirSpriteCanvas('tinte:'+clave)`; al desalojar LRU → `eliminarSprite`. Sin sprite base o imagen sin dimensiones → `null` + `console.warn` (nunca throw).
- [ ] **Step 4: Aplanado del guerrero (script determinista)** — El sprite base del guerrero es fotográfico (sin tonos dominantes): posterizar sus frames (`players.png` idle/walking/defending/fallen + `hero_custom.png` attacking) a tonos planos y reasignar `ORIGEN_ZONA.guerrero` (pelo/torso/piernas). Si la matriz visual (Tarea 6) lo rechaza: guerrero queda en defecto documentado, sin bloquear el v1.
- [ ] **Step 5: Verificar** — Run: `pnpm test`, `pnpm build` — Expected: verde. Smoke manual: `pnpm dev`, abrir lobby (el compositor aún no se usa; solo se verifica que nada regresa).
- [ ] **Step 6: Commit** — `git commit -m "feat(avatar): compositor de tintes + sprites canvas"`.

### Task 3: Protocolo + entidades + render

**Files:**
- Modify: `src/entities/Jugador.ts` (campo `apariencia: AparienciaAvatar` inicializado a defecto), `src/entities/JugadorRemoto.ts` (`apariencia?: AparienciaAvatar`), `src/entities/EntidadRPG.ts` (campo opcional base), `src/network/NetworkManager.ts`, `src/network/NetworkManagerHttp.ts`, `src/main.ts`, `src/core/Renderer.ts`

**Interfaces:**
- Consumes: Task 1 (tipos, saneado, defecto), Task 2 (`AvatarCompositor.obtenerVariante`).
- Produces: handshake con `apariencia?`; `case 'avatar'`; remotos tineados en `Renderer`.

- [ ] **Step 1: Campos de entidad** — `Jugador.apariencia` (defecto guerrero) + `JugadorRemoto.apariencia?` + `apariencia?: AparienciaAvatar` en la base `EntidadRPG` (`src/entities/EntidadRPG.ts`, mismo patrón que `color`, para que `Renderer` compile). Instanciar `AvatarCompositor` en el constructor de `Renderer` junto a `spriteManager`.
- [ ] **Step 2: Render** — En `Renderer.ts` (~L250, antes de `dibujarSprite`): si `!esNPC` y `aparienciaEfectiva(clase, entidad.apariencia)` no es defecto → `keyADibujar = compositor.obtenerVariante(...) ?? keyADibujar`.
- [ ] **Step 3: Envío** — Añadir `apariencia: aparienciaEfectiva(...)` al handshake en `NetworkManager.ts` (~L78) y `NetworkManagerHttp.ts` (~L46) (verificar con `grep -n handshake` si hay más sitios) + al handshake forzado del host (`main.ts` ~L3034). El reenvío `{...msg}` (~L3028) ya la preserva: no tocar.
- [ ] **Step 4: Recepción** — En `case 'handshake'` (~L3013): `if (msg.apariencia) jInfo.entidad.apariencia = sanearApariencia(msg.apariencia, clase)`. Nuevo `case 'avatar'`: actualiza `apariencia` de la entidad del `idSujeto` (saneada; si no hay entidad, ignorar + log). `handshake_ack` no cambia.
- [ ] **Step 5: Test de retrocompat** — Spec: entidad creada desde handshake sin `apariencia` → defecto de su clase (simular el `case` como función pura si es extraíble; si no, test de `aparienciaEfectiva(clase, undefined)`). Run: `pnpm test`, `pnpm build` — Expected: verde.
- [ ] **Step 6: Commit** — `git commit -m "feat(avatar): apariencia en protocolo y render"`.

### Task 4: Persistencia (sesión + Firestore + reglas)

**Files:**
- Modify: `src/main.ts` (`guardarSesion` L912, `reanudarPartida` L923), `src/network/FirebaseManager.ts`, `firestore.rules`

**Interfaces:**
- Consumes: `sanearApariencia`, `aparienciaEfectiva` (Task 1).
- Produces: `FirebaseManager.guardarAparienciaJugador(pid, jid, {nick, clase, apariencia})`, `FirebaseManager.leerAparienciaJugador(pid, jid)` (nombres exactos; firmas siguiendo el patrón de `crearPersistenciaMundo`).

- [ ] **Step 1: Sesión local** — `guardarSesion` añade `avatar: this.protagonista.apariencia`; `reanudarPartida` la restaura con `sanearApariencia(data.avatar, clase)` (ausente/corrupto → defecto).
- [ ] **Step 2: Test de sesión corrupta** — Spec: `sanearApariencia({zonas: {piel: 'no-es-hex'}})` → defecto; `sanearApariencia(undefined)` → defecto. Run: `pnpm test` — Expected: PASS.
- [ ] **Step 3: Firestore + reglas** — Doc `partidas/{pid}/jugadores/{jid}` = `{nick, clase, apariencia, actualizado}`; `set(merge:true)` al unirse y al cambiar apariencia; lectura al unirse para pre-hidratar (el handshake manda en conflicto). Reglas: subcolección con get/list para miembros y create/update solo propio `jid` (misma forma que las reglas de `mundos/`).
- [ ] **Step 4: Verificar** — Run: `pnpm test`, `pnpm build` — Expected: verde. (Deploy de reglas NO en esta tarea: sigue el precedente fase 2, a pulso del mando.)
- [ ] **Step 5: Commit** — `git commit -m "feat(avatar): persistencia de apariencia (sesion + partida)"`.

### Task 5: UI del modal + preview viva

**Files:**
- Modify: `index.html` (`characterModal` ~L233), `src/ui/LobbyManager.ts`, `src/main.ts` (`onSaveCharacter` L375, `getCharacterData` L442)

**Interfaces:**
- Consumes: `PALETAS`, `aparienciaEfectiva`, `AvatarCompositor` (Task 1–2).
- Produces: modal con 4 filas de swatches + preview tineada; `onSaveCharacter(nombre, color, clase, apariencia)`.

- [ ] **Step 1: HTML** — En `characterModal`: una fila de swatches por zona MAPEADA (lee `ORIGEN_ZONA[clase]`; piel hoy ausente → 3 filas: pelo/torso/piernas; botones con los hex de `PALETAS`, grandes/táctiles) + `<canvas id="avatarPreview" width="64" height="64">` junto al medallón (el medallón CSS se conserva).
- [ ] **Step 2: Lógica** — `CharacterData` + `getCharacterData` suman `apariencia`; `saveCharacter` la lee de los swatches seleccionados; cambiar `.class-btn` re-aplica defecto de la clase (conserva coincidencias de paleta); cada cambio repinta `avatarPreview` con el compositor (frame idle). `onSaveCharacter` guarda `color` (acento, sin cambios) + `apariencia` + persiste sesión (Task 4) y publica en partida/Firestore + broadcast `avatar` si hay partida activa.
- [ ] **Step 3: Verificar** — Run: `pnpm test`, `pnpm build` — Expected: verde. Smoke: `pnpm dev` → personalizar las 4 zonas → preview tineada → guardar → recarga mantiene.
- [ ] **Step 4: Commit** — `git commit -m "feat(avatar): editor de tintes en el modal + preview"`.

### Task 6: Validación final

- [ ] **Step 1: Matriz visual** — Capturas 3 clases × 4 estados × todas las paletas; el mando acepta la tolerancia o pide retoque (si pide: retoque + actualizar `ORIGEN_ZONA`, commit `fix(avatar): retoque base`).
- [ ] **Step 2: Dos clientes** — Cliente A (nuevo) + cliente B (viejo, `main` sin campo): A personaliza → B lo ve por defecto y no rompe; B se ve en A por defecto; recarga con sesión; reunirse pre-hidrata desde Firestore; denegar reglas (experimento) → solo handshake, sin rotura.
- [ ] **Step 3: Puerta de calidad** — Run: `pnpm test`, `pnpm build` — Expected: verde. FPS sin regresión perceptible (caché LRU activa).
- [ ] **Step 4: Commit final + constancia** — Commit de restos (`test(avatar): ...` / `fix(avatar): ...`); anotar el turno de cierre en la ronda con los commits.
