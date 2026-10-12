# Piezas v1 (remap fijas + overlay) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Piezas componibles on/off (pelo-largo, peto, botas, casco) sobre la base con tintes.

**Architecture:** `gen_piezas.py` genera overlays + tabla de anclas + paletas fijas; el compositor compone base tineada → remaps fijos → overlays; `piezas` viaja dentro de `apariencia` (sin cambios de protocolo).

**Tech Stack:** TypeScript estricto, Canvas 2D, Python/PIL (generación), `scripts/test.mjs`, Firestore rules.

**Spec:** `docs/proposals/2026-10-11-avatar-piezas.md`

## Global Constraints

- Rama: `feature/avatar-piezas-overlay` (worktree `.worktrees/feature-avatar-piezas-overlay`); nada a `main`.
- `pnpm build` verde tras cada tarea; `pnpm test` con estilo existente.
- Arte programático versionado en script; matrices mandan (gate humano por pieza).
- Sin `piezas` = bandas v2 (retrocompat total). Caídos: sin piezas (como tintes).
- Reglas: deploy a pulso del mando, no en este plan.

## Review Focus

- `piezas` ausente (cliente viejo) → todo null = solo tintes (test en Tarea 2).
- Variante desconocida o de otro género (`casco-x`, `pelo-largo-f` en `m`) → null, sin romper (test en Tarea 2).
- Overlay sin ancla para un frame (hueco en tabla) → pieza omitida + log, resto compone (test en Tarea 2).
- Sheet `pieces.png` sin cargar → overlays omitidos, remaps y base intactos (manual en Tarea 3).
- Reglas viejas (sin `piezas`) rechazan ficha nueva → el handshake cubre; test manual denegación en Tarea 3.

---

## Estructura de ficheros

- Crear `scripts/gen_piezas.py` — recetas versionadas: pelo-largo (overlay, melena anclada a tono), casco (overlay, domo+cresta+visera), peto/botas (remap: paletas fijas). Salida: `public/sprites/pieces.png`, `src/config/piezas.json`, matrices.
- Crear `public/sprites/pieces.png`, `piezas.json` (formato abajo).
- Modificar `src/core/avatarTintes.ts` (+spec): `piezas` en tipo/saneado, `anclaPara(tabla, variante, frameKey)`, clave con piezas.
- Modificar `src/config/apariencia.ts` (`PIEZA_PALETAS`, `RANURAS`), `src/core/SpriteConfig.ts` (registro overlays `pieza_{variante}_{frameKey}`), `src/core/AvatarCompositor.ts` (orden de composición), `src/core/Renderer.ts` (pasa frameKey), `src/ui/LobbyManager.ts` + `index.html` (toggles), `src/main.ts` (preview), `firestore.rules` (apariencia size ≤ 3 + `piezas` mapa).

**Formato `piezas.json`:** `{ "variantes": { "<id>": { "ranura": "pelo|torso|piernas|casco", "generos": ["m","f"], "tipo": "remap|overlay", "paleta": {zona: hex} | null, "sheet": "pieces", "anclas": { "<clase>_<estado>_<idx>": {"dx": n, "dy": n, "w": n, "h": n} } } } }` — ancla en píxeles del frame base (esquina sup-izq), escalado por `C/sw` al dibujar.

---

### Task 1: Arte + registro + matrices (gate humano por pieza)

**Files:**
- Create: `scripts/gen_piezas.py`, `public/sprites/pieces.png`, `piezas.json`
- Modify: ninguno de motor.

**Interfaces:**
- Consumes: cuerpos M/F del repo, recetas validadas en prototipos (`agent/` ronda `20261011c`).
- Produces: `pieces.png` + `piezas.json` (formato arriba) + matrices.

- [ ] **Step 1: Generar v1** — Run: `python3 scripts/gen_piezas.py --apply` — Expected: `pieces.png` + `piezas.json` con variantes `pelo-largo-f`, `peto-f`, `botas-f`, `casco` (unisex) × frames idle/walking/attacking × 3 clases (+ F: mismos frames sobre sheets `_f`).
- [ ] **Step 2: Determinismo** — Doble ejecución + `cmp` — Expected: idénticos.
- [ ] **Step 3: Matrices** — M/F × con/sin piezas (idle+walking+attacking) — Expected: el mando las acepta o pide receta (gate humano; el commit espera su sí; iterar receta sin tocar motor).
- [ ] **Step 4: Commit** — `git add scripts/gen_piezas.py public/sprites/pieces.png src/config/piezas.json verification/avatar-matriz-piezas*.png && git commit -m "feat(piezas): arte v1 + registro"`.

### Task 2: Motor (modelo + composición + UI)

**Files:**
- Modify: `src/core/avatarTintes.ts`, `src/core/avatarTintes.helpers.spec.ts`, `src/config/apariencia.ts`, `src/core/SpriteConfig.ts`, `src/core/AvatarCompositor.ts`, `src/core/Renderer.ts`, `src/ui/LobbyManager.ts`, `index.html`, `src/style.css`, `src/main.ts`, `firestore.rules`

**Interfaces:**
- Consumes: `piezas.json` + `pieces.png` (Task 1).
- Produces: `apariencia.piezas: Record<'pelo'|'torso'|'piernas'|'casco', string | null>`; composición ordenada; toggles en modal.

- [ ] **Step 1: Test que falla** — Spec: `sanearApariencia({...zonas, genero:'m', piezas:{pelo:'pelo-largo-f', torso:'no-existe', piernas:null, casco:null}}, 'mago')` → `piezas.pelo` conserva si la variante admite el género... (el género de la VARIANTE se valida contra tabla: el spec importa una tabla mínima inline, no `piezas.json`); variante desconocida → null; sin `piezas` → todo null. `anclaPara(TABLA_MIN, 'casco', 'explorador_idle_0')` → `{dx,dy}`; frame ausente → null. Run: `pnpm test` — Expected: FAIL.
- [ ] **Step 2: Modelo puro** — `piezas` en `AparienciaAvatar` + saneado (desconocida/otro género → null; ausente → todo null) + `anclaPara(tabla, variante, frameKey)` + `RANURAS` + clave con piezas. Run: `pnpm test` — Expected: PASS.
- [ ] **Step 3: Registro y composición** — `SpriteConfig`: overlays `pieza_{variante}_{frameKey}` desde `piezas.json`; `AvatarCompositor`: tras la variante tineada base, aplica remaps fijos (`PIEZA_PALETAS[variante]` sobre las mismas bandas) y dibuja overlays en ancla escalada (`C/sw`); hueco de ancla o sheet ausente → omitir pieza + warn (nunca throw); caídos → sin piezas. `Renderer`: pasa `frameKey = ${clase}_${estado}_${frameActual}` y `genero` para elegir sheet M/F de overlays (mismo `pieces.png`: las geometrías F van en regiones propias).
- [ ] **Step 4: UI** — Modal: 4 toggles (Pelo largo/Peto/Botas/Casco; solo variantes del género actual) + preview con piezas; `CharacterData`/`onSaveCharacter` llevan `piezas`; reglas: apariencia size ≤ 3 con `piezas` mapa (forma, paridad).
- [ ] **Step 5: Verificar** — Run: `pnpm test`, `pnpm build` — Expected: verde.
- [ ] **Step 6: Commit** — `git commit -m "feat(piezas): motor v1"`.

### Task 3: Validación final

- [ ] **Step 1: Matriz full** — M/F × piezas on/off (del repo) — el mando acepta o pide receta (solo script+regenerar).
- [ ] **Step 2: Navegador** — toggles, preview, remotos, recarga, piezas en three states; sheet bloqueado → base intacta sin excepción.
- [ ] **Step 3: Puerta** — Run: `pnpm test`, `pnpm build` — Expected: verde.
- [ ] **Step 4: Turno de cierre** — Commits en la ronda + propuesta `20261011b-agent-avatar-piezas-capas` → Realizada (mover a histórico + índice).
