# Cuerpos F (materialización) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Materializar los cuerpos F validados en el repo y usarlos según `genero`.

**Architecture:** Script versionado genera sheets `_f` + `jugadoras` (misma geometría); el motor elige prefijo `player`/`player_f` por `genero`, que viaja como el resto de la apariencia.

**Tech Stack:** TypeScript estricto, Python/PIL (solo generación), `scripts/test.mjs`, Firestore rules.

**Spec:** `docs/proposals/2026-10-11-avatar-cuerpos-f.md`

## Global Constraints

- Rama: `feature/avatar-piezas-overlay` (worktree `.worktrees/feature-avatar-piezas-overlay`); nada a `main`.
- `pnpm build` verde tras cada tarea; `pnpm test` con estilo existente (`*.helpers.spec.ts`).
- Los sheets base NO se tocan (el script solo lee; la matriz lo demuestra por diff vacío en `players.png`/`hero_custom.png`).
- Sin `genero` = `'m'` en toda frontera (retrocompat total).
- Reglas: deploy a pulso del mando (como fase 2), no en este plan.

## Review Focus

- Handshake/sesión/ficha sin `genero` (cliente viejo) → `'m'`, sin romper (test en Tarea 2).
- `genero` con valor basura (`'x'`, `null`) → `'m'` (test en Tarea 2).
- Sheet `_f` sin cargar (404) → `obtenerSprite` undefined → fallback geométrico existente, sin excepción (test manual en Tarea 3).
- `jugadoras` ausente en un `sprites.json` viejo (herramientas externas) → `procesarMapping` ya tolera `mapping` undefined (sin test; código existente).
- Receta del script con números fuera de receta versionada → el script falla en voz alta, nunca escribe a medias (test en Tarea 1: segunda ejecución byte-idéntica).

---

## Estructura de ficheros

- Crear `scripts/gen_cuerpos.py` — promovido de `/tmp/gen_cuerpos_v3.py`: receta v3 con params nombrados, lee `public/sprites/players.png`+`hero_custom.png`+`sprites.json`, escribe `players_f.png`, `hero_custom_f.png` y el bloque `jugadoras`.
- Crear `public/sprites/players_f.png`, `public/sprites/hero_custom_f.png` (generados, commiteados).
- Modificar `src/config/sprites.json` (`recursos` +2, `mapeo.jugadoras`), `src/core/SpriteConfig.ts` (1 línea: `procesarMapping(jugadoras, 'player_f')`), `src/core/Renderer.ts` (prefijo por genero), `src/core/avatarTintes.ts` + spec (`genero` en tipo/saneado), `src/main.ts` (getCharacterData/onSaveCharacter/pintarPreviewAvatar), `src/ui/LobbyManager.ts` (selector M/F + CharacterData), `src/network/FirebaseManager.ts` (ficha con genero), `firestore.rules` (`genero` en fichaOk, size ≤ 5).

---

### Task 1: Script + sheets + `jugadoras`

**Files:**
- Create: `scripts/gen_cuerpos.py`, `public/sprites/players_f.png`, `public/sprites/hero_custom_f.png`
- Modify: `src/config/sprites.json`

**Interfaces:**
- Consumes: receta v3 validada (ronda `20261011c/agent/02`).
- Produces: sheets `_f` + `mapeo.jugadoras` (misma geometría que `jugadores`, `imagen` → recursos `_f`).

- [ ] **Step 1: Promover el script** — `scripts/gen_cuerpos.py` desde `/tmp/gen_cuerpos_v3.py`: params nombrados arriba (`CADERA_FILAS`, `PELO_EXTRA`, `TONOS_PELO`, `ANCLA_PELO` por clase); ante todo: verifica que `players.png`/`hero_custom.png` no cambian (hash antes/después; si cambian, aborta).
- [ ] **Step 2: Generar** — Run: `python3 scripts/gen_cuerpos.py` — Expected: crea los 2 PNG + imprime el bloque `jugadoras` (o lo escribe con `--apply`, a elegir en implementación; documentarlo en la cabecera).
- [ ] **Step 3: Determinismo** — Run dos veces + `cmp` de los PNG — Expected: byte-idénticos.
- [ ] **Step 4: Matriz desde repo** — Regenerar matriz M/F con los sheets commiteados (adapta `/tmp/matriz_cuerpos_v2.py` a leer repo) — Expected: el mando la acepta (gate humano, fuera de este task-loop; el commit espera su sí).
- [ ] **Step 5: Commit** — `git add scripts/gen_cuerpos.py public/sprites/*_f.png src/config/sprites.json verification/avatar-matriz-f-repo.png && git commit -m "feat(cuerpos): sheets F + jugadoras (receta v3)"`.

### Task 2: Motor (`genero` de punta a punta)

**Files:**
- Modify: `src/core/SpriteConfig.ts`, `src/core/Renderer.ts`, `src/core/avatarTintes.ts`, `src/core/avatarTintes.helpers.spec.ts`, `src/main.ts`, `src/ui/LobbyManager.ts`, `src/network/FirebaseManager.ts`, `firestore.rules`, `index.html` (selector M/F)

**Interfaces:**
- Consumes: `jugadoras` (Task 1), `AparienciaAvatar` + `sanearApariencia` existentes.
- Produces: `AparienciaAvatar.genero: 'm' | 'f'`; keys `player_f_{clase}_{estado}[_N]`; modal con M/F.

- [ ] **Step 1: Test que falla** — Spec: `sanearApariencia({formato:1, zonas:{...}, genero:'x'}, 'mago').genero === 'm'`; sin `genero` → `'m'`; con `'f'` → `'f'`. Run: `pnpm test` — Expected: FAIL (campo no existe).
- [ ] **Step 2: Tipo + saneado** — `genero: 'm' | 'f'` en `AparienciaAvatar` (+ defecto `'m'` en `APARIENCIA_DEFECTO`); saneado en `sanearApariencia`. Run: `pnpm test` — Expected: PASS.
- [ ] **Step 3: Registro y prefijo** — `procesarMapping((c.mapeo as any).jugadoras, 'player_f')` en `SpriteConfig.ts`; en `Renderer.ts` (resolución ~L218): `const prefix = esNPC ? 'npc' : (aparienciaEfectiva(clase, entidad.apariencia).genero === 'f' ? 'player_f' : 'player')`.
- [ ] **Step 4: Plomería** — `getCharacterData`/`onSaveCharacter`/`pintarPreviewAvatar` (preview: base `player_f_...` cuando `'f'`), `CharacterData` + botones M/F en `characterModal` (repintan preview), `guardarSesion`/`reanudarPartida` (ya pasan `avatar` entero: sin cambios salvo tipos), handshake/`avatar` (sin cambios: `apariencia` viaja entera), `guardarAparienciaJugador`/`leerAparienciaJugador` (la ficha lleva `genero` vía `fichaJugador`: extender helper + test), reglas `fichaOk` (+`genero` en `['m','f']`, size ≤ 5).
- [ ] **Step 5: Verificar** — Run: `pnpm test`, `pnpm build` — Expected: verde.
- [ ] **Step 6: Commit** — `git commit -m "feat(cuerpos): genero de punta a punta"`.

### Task 3: Validación final

- [ ] **Step 1: Matriz repo** — Ya generada en Task 1 Step 4; el mando la acepta o pide receta v4 (cambio solo en script + regenerar + commit `fix(cuerpos): receta v4`).
- [ ] **Step 2: Navegador** — M/F en el modal, preview, remotos cruzados, recarga; sheet `_f` bloqueado (renombrar temporalmente) → fallback geométrico sin excepción.
- [ ] **Step 3: Puerta** — Run: `pnpm test`, `pnpm build` — Expected: verde.
- [ ] **Step 4: Turno de cierre** — Anotar commits en la ronda `20261011c`.
