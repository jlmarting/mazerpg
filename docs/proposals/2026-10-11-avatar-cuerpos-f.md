# Spec: Cuerpos F — materialización (Fase 1 de piezas)

**Fecha:** 2026-10-11 · **Ronda:** `20261011c-avatar-piezas-overlay` · **Diseño aprobado:** turno `agent/02` (receta v3 validada en matriz)
**Base:** `feature/avatar-tintes-v1` · **Rama:** `feature/avatar-piezas-overlay`

## Qué se construye

Los cuerpos F validados pasan de `/tmp` al repo de forma determinista y el motor los usa según `genero`.

## §1 Generación determinista (`scripts/gen_cuerpos.py`)

- Entrada: `public/sprites/players.png` + `hero_custom.png` (+ `sprites.json` como geometría).
- Receta v3 versionada en el script (cadera +1px/side filas .66-.82 · pelo +5 filas + volumen anclado a tono de clase · hombros/cintura oscurecidos · busto sutil): **ningún número mágico fuera del script**.
- Salida: `public/sprites/players_f.png` + `hero_custom_f.png` + parche de `sprites.json` (`jugadoras`, misma geometría que `jugadores`, imagen → sheets `_f`).
- El script es re-ejecutable: regenera idéntico (la matriz de validación sale de su salida, no de `/tmp`).

## §2 Motor

- `SpriteConfig`: registra `jugadoras` igual que `jugadores` (mismas keys `player_{clase}_{estado}[_N]` — la categoría decide el sheet).
- `Renderer`: categoría = `genero === 'f' ? 'jugadoras' : 'jugadores'` al resolver sprite y variante tineada (el compositor ya es agnóstico: trabaja sobre el recorte que le den).
- `AparienciaAvatar.genero: 'm' | 'f'` (defecto `'m'`); `sanearApariencia` lo sanea (desconocido → `'m'`); viaja en handshake/`avatar`, sesión y ficha Firestore.
- Reglas: `fichaOk` admite `genero` en `['m','f']` (size ≤ 5).
- Modal: selector M/F (2 botones) + preview repinta con su sheet; `getCharacterData`/`onSaveCharacter` lo llevan.

## §3 Validación y éxito

- Matriz M/F regenerada desde los sheets del repo (no `/tmp`) — el mando la acepta o pide receta v4 (cambio solo en el script + regenerar).
- Suite + build verdes. Caídos F existen (cuerpo coherente) pero van en defecto (bandas v1 intactas).
- Éxito: F distinguible, M intacto píxel a píxel (el script no toca los sheets base), retrocompat (sin `genero` = `'m'`).

## Fuera (Fase 2)

Piezas (arte + anclas + registro + UI on/off) — spec propia tras esta.
