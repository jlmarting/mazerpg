# Mundo persistente con burbuja de realidad (Fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la mazmorra única y efímera actual en un mundo persistente en árbol (fase 1: conectores tipados con fundido), con burbuja de realidad de doble radio, persistencia versionada y retrocompatible en Firebase, y housing local estricto.

**Architecture:** Árbol de `NodoMundo`; cada nodo es `Celda[][]` autogenerado de forma determinista por `gen {nombre, version, seed, params}`. Solo el nodo activo vive en memoria y solo las celdas dentro de `radioSim` simulan y sincronizan; fuera está congelado. Los cambios se emiten como `DeltaMundo` con `fmt: 1` y los arbitra el host por `tick` (last-writer-wins). Firebase persiste `partidas/{id}/mundos/{nodoId}` (nuevo) sin tocar la forma actual de `partidas`. Housing = nodo `personal` con `ownerId`, persistido local del dueño, acceso por portal.

**Tech Stack:** TypeScript + Vite (existente), Canvas 2D, Firebase Firestore + WebRTC (existente). Sin dependencias nuevas. Verificación: `pnpm tsc --noEmit`, `pnpm build` y helpers de chequeo puros; no hay runner de tests en `package.json` (scripts `dev/build/preview`), así que los tests viven como scripts `*.spec.ts`/helpers deterministas ejecutables con `tsx`/script o aserciones en el propio arranque.

**Spec:** `/home/jl/Aureus/DEVCONTEXT/10_proyectos/mazerpg/sesiones/20261009b-mundo-persistente-burbuja/agent/02-spec-fase-1-mundo-persistente-burbuja.md`

## Global Constraints

- TypeScript estricta vía `tsc` (`pnpm build` = `tsc && vite build`); cada task termina con `tsc`/`build` en verde.
- `fmt: 1` fijado como versión de formato de delta (constante única en el código).
- `gen.version` fijado y reproducido exactamente por generador; determinismo garantizado por seed.
- `radioSim ≤ RADIO_VISION(=radioVis)` siempre; `radioSim` nuevo en `GameConfig`.
- `serializarMapa`/`deserializarMapa` NO tocan `conectorId`; los conectores viven como deltas `conector` aparte.
- Retrocompatibilidad: doc `partidas/{id}` sin subcolección `mundos` = un único nodo BSP, exactamente el comportamiento actual; la forma del doc de lobby no cambia.
- Housing fase 1: casa visitable solo con dueño online; fuera de alcance `ultimaVersion` en global y "casa pública".

## Review Focus

1. **Determinismo entre clientes** — mismo `gen{seed,params,version}` debe producir `Celda[][]` idéntico en dos clientes (test por cada generador; un generador indeterminista rompe la sincronización entera).
2. **Doc `partidas` sin `mundos`** — debe seguir jugando como la mazmorra de hoy; nunca tratarlo como error ni inicializar mundo vacío (test explícito).
3. **Delta fuera de `radioSim`** — debe quedar congelado (no aplicarse ni emitirse) y no "coleando" al entrar después (test de frontera).
4. **Portal a casa offline** — debe renderizarse como inactivo y no intentar conexión P2P contra un dueño ausente (test de estado).
5. **Conflicto mismo-celda dos jugadores** — gana el de mayor `tick` (host), sin divergencias permanentes entre clientes (test last-writer-wins).

---

### Task 1: Modelo de mundo (`NodoMundo`, `ConectorMundo`, `DeltaMundo`)

**Files:**
- Create: `src/world/mundo.ts`
- Modify: `src/world/Celda.ts:20-21` (añadir `conectorId`)
- Test: `src/world/mundo.helpers.spec.ts` (helper determinista, ejecutable)

**Interfaces:**
- Consumes: `Celda` (`src/world/Celda.ts`).
- Produces:
  - `interface NodoMundo { id: string; padreId: string | null; transform: { df: number; dc: number }; filas: number; columnas: number; tipo: 'mazmorra' | 'abierto' | 'planta' | 'natural' | 'personal'; gen: GenSpec; celdas: Celda[][]; ownerId: string | null; }`
  - `interface GenSpec { nombre: string; version: number; seed: number; params: Record<string, number | string>; }`
  - `interface ConectorMundo { id: string; tipo: 'portal' | 'escalera' | 'salida' | 'entrada'; nodoOrigenId: string; filaO: number; columnaO: number; nodoDestinoId: string; filaD: number; columnaD: number; housingOwnerId: string | null; }`
  - `type DeltaCambio = {tipo:'cavar'} | {tipo:'escenario';tipoEscenario:'puerta'|'trampa'|'ninguno';estado:string} | {tipo:'objeto';campo:'alimento'|'tienePico'|'burbuja';valor:unknown|null} | {tipo:'conector';accion:'añadir'|'quitar';conector:ConectorMundo}`
  - `interface DeltaMundo { fmt: 1; nodoId: string; fila: number; columna: number; autoria: string; tick: number; cambio: DeltaCambio; }`
  - `const FMT_DELTA = 1`
  - `aplicarDelta(celdas: Celda[][], delta: DeltaMundo): boolean` (aplica el cambio a la celda si existe el nodo/celda; false si fuera de rango)
  - `resolverLWW(actual: DeltaMundo | null, entrante: DeltaMundo): DeltaMundo` (gana mayor `tick`; empate: el entrante — determinista)

- [ ] **Step 1: Helper de test (aserciones)**

```ts
// mundo.helpers.spec.ts — helpers que el runner/arranque valida con pila de asserts
// - crearNodoRaiz(...) devuelve NodoMundo tipo 'mazmorra', padreId null
// - aplicarDelta {tipo:'objeto', campo:'alimento', valor:null} borra alimento => true
// - resolverLWW(a{tick:5}, b{tick:9}) === b (gana mayor tick)
```

- [ ] **Step 2: Verificar compilación del test**

Run: `pnpm tsc --noEmit`
Expected: PASS sin errores de tipos en `mundo.helpers.spec.ts`.

- [ ] **Step 3: Implementar `mundo.ts` con las interfaces y helpers**

Tipos exactamente como en el bloque Produces; `aplicarDelta` con switch por `delta.cambio.tipo` (cavar/escenario/objeto/conector mutan la celda o adjuntan/quitan `conectorId`); `resolverLWW` pura.

- [ ] **Step 4: Verificar `tsc`**

Run: `pnpm tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add src/world/mundo.ts src/world/Celda.ts src/world/mundo.helpers.spec.ts
git commit -m "feat(world): modelo NodoMundo/ConectorMundo/DeltaMundo (fmt=1) + LWW"
```

---

### Task 2: Generadores versionados (deterministas) por tipo

**Files:**
- Create: `src/world/generadores.ts`
- Modify: `src/world/mundo.ts` (registrar generadores)
- Test: `src/world/generadores.helpers.spec.ts`

**Interfaces:**
- Consumes: `NodoMundo/GenSpec` (Task 1), `Celda`, `generarLaberintoBSP` (`src/world/generation.ts`).
- Produces:
  - `generarNodo(gen: GenSpec, filas: number, columnas: number): Celda[][]` — despacha por `gen.nombre: 'mazmorra'|'abierto'|'planta'|'natural'`, aplica seed determinista y `gen.version`.
  - `mulberry32(seed: number): () => number` — PRNG determinista por seed (los generadores la usan en vez de `Math.random`).
  - Mapa inmutable `GENERADORES: Record<string, Record<number, (rng, filas, columnas, params) => Celda[][]>>` (nombre → version → función).
  - El BSP actual queda reescrito como generador `mazmorra version 1` usando el rng sembrado (sin cambiar su resultado para una seed dada).

- [ ] **Step 1: Test determinismo**

```ts
// generadores.helpers.spec.ts
// - generarNodo({nombre:'planta', version:1, seed:42, params:{}}, 30, 30)
//   llamado dos veces === deep-equal (mismas celdas transitables/muros)
// - distinto seed (43) => al menos una celda difiere en el mismo tipo
```

- [ ] **Step 2: Verificar compilación**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Implementar `generadores.ts`**

PRNG `mulberry32`; reescribir `generarLaberintoBSP` interna para tomar `rng` (misma lógica BSP); cuatro generadores `mazmorra/abierto/planta/natural` mínimos, cada uno `version 1`. Registrar en `GENERADORES`.

- [ ] **Step 4: Verificar `tsc` + build**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: tsc 0, build OK.

- [ ] **Step 5: Commit**

```bash
git add src/world/generadores.ts src/world/generation.ts src/world/generadores.helpers.spec.ts
git commit -m "feat(world): generadores versionados deterministas por tipo con seed"
```

---

### Task 3: Gestor de mundo (árbol, nodo activo, conectores)

**Files:**
- Create: `src/world/GestorMundo.ts`
- Modify: `src/types/index.ts:78` (añadir `nodoActivo` al contrato `IGame`)
- Test: `src/world/GestorMundo.helpers.spec.ts`

**Interfaces:**
- Consumes: `NodoMundo/ConectorMundo/DeltaMundo` (Task 1), `generarNodo` (Task 2), `IGame`.
- Produces:
  - `class GestorMundo { mundo: Map<string, NodoMundo>; conectores: Map<string, ConectorMundo>; nodoActivoId: string; }`
  - `crearMundoInicial(gen: GenSpec, filas: number, columnas: number): NodoMundo` (raíz `padreId: null`)
  - `obtenerNodoActivo(): NodoMundo` (lanza si no existe — bug de programación)
  - `obtenerCeldas(): Celda[][]` (alias `obtenerNodoActivo().celdas` — mantiene la firma actual del Renderer/pathfinding/entidades)
  - `conectorEn(fila: number, columna: number): ConectorMundo | null` (celda del nodo activo)
  - `atravesar(conectorId: string): { nodo: NodoMundo; fila: number; columna: number }` (carga/genera destino, conmuta nodoActivo, devuelve punto de aparición)
  - `registrarConector(conector: ConectorMundo): void`

- [ ] **Step 1: Tests del gestor**

```ts
// GestorMundo.helpers.spec.ts
// - crearMundoInicial devuelve raíz con padreId null y celdas no-vacías
// - registrarConector + conectorEn localiza por celda
// - atravesar conmuta nodoActivo y devuelve aparición válida (esTransitable)
```

- [ ] **Step 2: Verificar compilación**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Implementar `GestorMundo.ts`**

Gestor puro en memoria; `atravesar` materializa destino llamando a `generarNodo` si no existe en `mundo`; mantiene referencia al nodo activo; expone `obtenerCeldas()` para el resto del código actual.

- [ ] **Step 4: Verificar `tsc` + build**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/world/GestorMundo.ts src/types/index.ts src/world/GestorMundo.helpers.spec.ts
git commit -m "feat(world): GestorMundo — árbol, nodo activo y conectores"
```

---

### Task 4: Burbuja de realidad (doble radio) en `Game` y `GameConfig`

**Files:**
- Modify: `src/types/index.ts:3-18` (añadir `radioSim`)
- Modify: `src/main.ts` (filtrado por `radioSim` en simulación y emisión de deltas; verificar portal vía `GestorMundo.conectorEn`)
- Test: `src/world/burbuja.helpers.spec.ts`

**Interfaces:**
- Consumes: `Config RADIO_VISION` existente, `GestorMundo` (Task 3), `celda.ultimoAvistamiento` (`Celda`).
- Produces:
  - `GameConfig.radioSim: number` (nuevo; valor por defecto `Math.min(RADIO_VISION, …)` garantizando `radioSim ≤ radioVis`)
  - `dentroDeBurbuja(fila: number, columna: number, f0: number, c0: number, radio: number): boolean` — helper distancia Euclídea `≤ radio` (reutilizable por UI/logs)
  - En `Game`: al aplicar movimiento/acción/delta, se ignora si `!dentroDeBurbuja(..., radioSim)`; al renderizar, `radioVis` (RADIO_VISION) sigue marcando `ultimoAvistamiento`.

- [ ] **Step 1: Tests burbuja**

```ts
// burbuja.helpers.spec.ts
// - dentroDeBurbuja(0,0, 3,0, radio=3) => true (borde inclusive)
// - dentroDeBurbuja(0,0, 4,0, radio=3) => false (fuera)
// - config por defecto respeta radioSim <= RADIO_VISION
```

- [ ] **Step 2: Verificar compilación**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Implementar filtrado burbuja en `main.ts`**

Añadir `radioSim` a `GameConfig` (con default garantizando `radioSim ≤ RADIO_VISION`); helper puro; en el bucle de acciones (`resolverAccion`, recepción de mensajes multi) comprobar `dentroDeBurbuja` antes de mutar/aplicar y antes de difundir; `verificarPortal` delega a `GestorMundo.conectorEn`/`atravesar` (Task 3) con fundido.

- [ ] **Step 4: Verificar `tsc` + build**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/main.ts src/world/burbuja.helpers.spec.ts
git commit -m "feat(game): burbuja de realidad — radioSim (sim+sync) vs radioVis (render)"
```

---

### Task 5: Persistencia Firebase retrocompatible (`partidas/{id}/mundos/{nodoId}`)

**Files:**
- Create: `src/world/persistenciaMundo.ts`
- Modify: `src/network/FirebaseManager.ts` (métodos de mundo) y `src/main.ts` (enganche al arbitraje del host)
- Test: `src/world/persistenciaMundo.helpers.spec.ts`

**Interfaces:**
- Consumes: `DeltaMundo` (Task 1), `FirebaseManager.getDb()` existente, `GestorMundo` (Task 3).
- Produces:
  - `class PersistenciaMundo { constructor(db: firebase.firestore.Firestore, idPartida: string) }`
  - `guardarDelta(delta: DeltaMundo): Promise<void>` — escribe en `partidas/{id}/mundos/{nodoId}/deltas` con `fmt:1` y `tick`.
  - `cargarNodo(nodoId: string): Promise<{ gen: GenSpec; ownerId: string | null; deltas: DeltaMundo[] } | null>` — null si no existe (el cliente lo genera local).
  - `listarNodos(): Promise<string[]>` — ids de nodo del mundo de la partida.
  - `compactarNodo(nodoId: string, hastaTick: number, snapshot: unknown): Promise<void>` — materializa y descarta deltas antiguos.
  - En `Game` (host): al aplicar un delta autorizado, lo persiste; al cargar partida, `listarNodos` + `cargarNodo` y aplica deltas en orden.

- [ ] **Step 1: Tests persistencia**

```ts
// persistenciaMundo.helpers.spec.ts
// - doc partidas sin 'mundos' => listarNodos() = [] (NO inicializa mundo; retrocompat)
// - roundtrip: guardarDelta -> cargarNodo devuelve el delta intacto (mock db)
// - compactarNodo descarta deltas con tick <= hastaTick y conserva gen/version
```

- [ ] **Step 2: Verificar compilación**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Implementar `persistenciaMundo.ts` + enganche**

Usa `db.collection('partidas').doc(idPartida).collection('mundos')`; el host en `Game` escribe deltas tras `resolverLWW` y en el arranque de partida materializa cada nodo con `generarNodo(gen)` + deltas ordenados por `tick`. `fmt` siempre `1` en escritura; lectura tolerante a `fmt` desconocido (ignora delta) para futuro.

- [ ] **Step 4: Verificar `tsc` + build**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/world/persistenciaMundo.ts src/network/FirebaseManager.ts src/main.ts src/world/persistenciaMundo.helpers.spec.ts
git commit -m "feat(persistencia): subcolección mundos/{nodoId} retrocompatible + deltas fmt=1"
```

---

### Task 6: Housing local (nodo `personal` con `ownerId`, portal estricto)

**Files:**
- Create: `src/world/housing.ts`
- Modify: `src/world/GestorMundo.ts` (conector personal), `src/main.ts` (interacción portal), `src/core/Renderer.ts` (portal activo/inactivo)
- Test: `src/world/housing.helpers.spec.ts`

**Interfaces:**
- Consumes: `NodoMundo`/`ConectorMundo` (Task 1), `GestorMundo` (Task 3), idLocal de `NetworkManager`.
- Produces:
  - `class HousingLocal { constructor(idLocal: string) }` — persiste en `localStorage` bajo clave `mazerpg.casa.{idLocal}`.
  - `guardarCasa(nodo: NodoMundo): void` / `cargarCasa(): NodoMundo | null`.
  - `crearPortalPersonal(miNodo: NodoMundo, destinoCelda: {fila,columna}): ConectorMundo` con `tipo: 'portal'` y `housingOwnerId = idLocal`.
  - `portalDisponible(conector: ConectorMundo, onlineIds: Set<string>): boolean` — true solo si `housingOwnerId ∈ onlineIds` (fase 1 estricta).
  - Renderer: portal con `housingOwnerId` se dibuja atenuado si `portalDisponible() === false`.

- [ ] **Step 1: Tests housing**

```ts
// housing.helpers.spec.ts
// - roundtrip: guardarCasa/cargarCasa mantiene gen+ownerId (localStorage)
// - portalDisponible con dueño online === true; con dueño ausente === false
// - portal personal solo editable por su dueño (deltas ignorados si no-owner)
```

- [ ] **Step 2: Verificar compilación**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Implementar `housing.ts` + portal**

Almacenamiento local (JSON) del nodo del dueño; creación del conector; chequeo de disponibilidad con `onlineIds` (jugadores conectados vía `NetworkManager`); render atenuado cuando no disponible.

- [ ] **Step 4: Verificar `tsc` + build**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/world/housing.ts src/world/GestorMundo.ts src/main.ts src/core/Renderer.ts src/world/housing.helpers.spec.ts
git commit -m "feat(housing): nodo personal local + portal estricto (dueño online)"
```

---

### Task 7: Integración en el arranque + checklist de aceptación

**Files:**
- Modify: `src/main.ts:908-1050` (iniciarMotorJuego → crear/cargar mundo inicial vía `GestorMundo`)
- Modify: `src/types/index.ts:59` (migración `IGame.mapaLaberinto` → `GestorMundo.obtenerCeldas()`; mantener getter de compatibilidad mientras se migra)
- Test: `src/world/integracion.helpers.spec.ts`

**Interfaces:**
- Consumes: Todo lo anterior.
- Produces:
  - `Game` arranca creando el mundo raíz (`tipo: 'mazmorra'`) por `GestorMundo.crearMundoInicial` si la partida no tiene `mundos`; si la partida tiene `mundos`, `listarNodos`+`cargarNodo` materializa el mundo persistido.
  - Los puntos que hoy leen `game.mapaLaberinto` (Jugador, EnemigoNPC, UIManager, Renderer, pathfinding, NetworkManagerHttp) quedan intactos consumiendo `GestorMundo.obtenerCeldas()` vía un getter de compatibilidad `game.mapaLaberinto` que devuelve el `Celda[][]` del nodo activo (migración incremental, sin reescribir 40 referencias en esta fase).

- [ ] **Step 1: Tests integración**

```ts
// integracion.helpers.spec.ts
// - partida sin mundos arranca con un único nodo BSP (comportamiento actual)
// - partida con mundos carga el nodo persistido y lo conmuta al activo
// - game.mapaLaberinto (getter) === gestorMundo.obtenerCeldas()
```

- [ ] **Step 2: Verificar compilación**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Implementar integración en `main.ts`**

Arranque vía GestorMundo; el getter de compatibilidad `mapaLaberinto` delega al nodo activo; el resto del código sigue compilando sin tocar las ~40 lecturas directas.

- [ ] **Step 4: Verificación global**

Run: `pnpm tsc --noEmit && pnpm build && python3 verification/verify_sprites.py`
Expected: tsc 0, build OK, sprites 56/0.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/types/index.ts src/world/integracion.helpers.spec.ts
git commit -m "feat(game): arranque del mundo vía GestorMundo con getter de compatibilidad"
```

---

## Self-review (verificado contra la spec)

1. **Cobertura de spec**: §2 modelo → Task 1 (+Celda.conectorId); §3 generadores → Task 2 (determinismo seed, `generarLaberintoBSP` reescrito con rng sembrado); §4 burbuja doble radio → Task 4 (`radioSim` nuevo, `radioVis`=RADIO_VISION existente, borde inclusive, fuera = congelado); §5 persistencia retrocompat → Task 5 (subcolección, doc-sin-mundos=nodo BSP, fmt=1, compactación); §6 housing estricto → Task 6 (local, portal, solo-dueño-online, no-owner no edita); §8 aceptación → Task 7 (arranque, getter compatibilidad, verificación global).
2. **Step scan**: cada paso es ambiguo-cero; las firmas exactas viven en Produces; cuerpos solo donde el algoritmo no se deduce (PRNG, LWW). Sin "handle edge cases" vacíos.
3. **Tipo consistente**: `DeltaMundo.fmt: 1`, `GenSpec`, `NodoMundo`, `ConectorMundo`, `resolverLWW`, `obtenerCeldas()`, `dentroDeBurbuja`, `portalDisponible` usados con el mismo nombre en tasks posteriores.
4. **Review Focus**: las 5 líneas tienen test en la task dueña — determinismo (Task 2), doc-sin-mundos (Task 5), delta fuera de radioSim (Task 4), portal offline (Task 6), conflicto LWW (Task 1).
5. **Proporción**: firma+assert, no transcript; 7 tasks con deliverable testeable cada una; sin setup/docs mezclados.
