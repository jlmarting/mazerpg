# Spec: Avatar v1 — tintes por remapeo de paleta (red + persistencia)

**Fecha:** 2026-10-11 · **Ronda:** `20261011b-avatar-tintes-v1` (vault) · **Propuesta:** `20261010d` creación de personaje/avatar
**Base:** `main` @ `424fc3e` · **Rama asumida:** `feature/avatar-tintes-v1` (estrategia rama-por-ronda pendiente de análisis ecosistema)

## Brief aprobado

Editor visual de avatar cuyo v1 son **tintes por parte** (quickwin); piezas, máscaras y pixel-art quedan como mejoras según resultados. Los tintes **viajan y se ven en remoto**. Persistencia **sesión + partida**. **Orden d→e:** esta spec construye la capa de apariencia que inventario/equipo consumirá.

## Vía elegida (A) y descartadas

- **A. Remapeo de paleta por zona (elegida):** tabla zona→color-origen por clase; remapeo en runtime (offscreen + caché). Cero arte nuevo, vale para todos los frames/estados. Riesgo: sangrado si dos zonas comparten tonos → retoque mínimo de sprites base.
- **B. Máscaras de zona:** máxima calidad pero arte por frame×clase×estado — rompe el quickwin (propuesta futura).
- **C. Tinte global único:** tiñe hasta la cara — descartado salvo fallback.

## §1 Esquema `apariencia` + protocolo + persistencia

```ts
type ZonaAvatar = 'piel' | 'pelo' | 'torso' | 'piernas';
interface AparienciaAvatar { formato: 1; zonas: Record<ZonaAvatar, string>; } // hex por zona
```

- **Paletas cerradas** `PALETAS: Record<ZonaAvatar, string[]>` (6–8 hex por zona). Sin color libre: acota la caché y garantiza armonía.
- **Origen** `ORIGEN_ZONA: Record<ZonaAvatar, string[]>` — tonos del sprite base que identifican cada zona (lista: el tono claro dista ~80 del oscuro y un umbral mayor sangraría; vacía = indistinguible → guerrero y piel en v1, vía máscaras futura).
- **Defecto** `APARIENCIA_DEFECTO[clase]` — primeros tonos de su ORIGEN (equivale al sprite actual; piel = primer hex de su paleta).
- **Saneado** `sanearApariencia(a: unknown): AparienciaAvatar` en TODA frontera (sesión, handshake, Firestore). Dato malo → defecto; el render nunca recibe dato inválido.
- **Protocolo:** `apariencia?` opcional en handshake (`NetworkManager`, `NetworkManagerHttp`; retrocompat, viejos lo ignoran) + `{ tipo: 'avatar', id, apariencia }` al cambiar. Nunca por tick (~60 bytes).
- **Persistencia local:** `mazeRPG_lastSession.avatar?` (ausente = defecto; migración implícita).
- **Persistencia en partida:** doc `partidas/{id}/jugadores/{idLocal}` = `{ nick, clase, apariencia, actualizado }`, `set(merge:true)` al unirse/cambiar; pre-hidrata antes del handshake (el handshake manda en conflicto). Reglas `jugadores/{jid}` con forma válida (sin auth no hay identidad que exigir: paridad con `mundos/`; el handshake cubre la denegación).

## §2 Compositor + render

- **Módulo aislado** `src/core/AvatarCompositor.ts`: `obtenerVariante(sheet, frame, clase, apariencia): HTMLCanvasElement`. Remapeo por distancia euclídea RGB (umbral 40, valor inicial ajustable con la matriz visual) **conservando sombreado** (traslada la diferencia de luminosidad; detalle fino en el plan). Transparentes intactos. Testeable sin red ni UI.
- **Caché LRU de 64 entradas** (valor inicial), clave `sheet|frame|clase|hash(zonas)`. Defecto = ruta actual (coste cero).
- **Render:** `Renderer` usa la variante si hay apariencia no-defecto, igual local (`Jugador`) que remoto (`JugadorRemoto.apariencia`). Fallo → sprite sin tintes + log.
- **Arte acotado:** retoque del PNG solo si alguna zona sale `null`; mismos recortes (sin tocar `sprites.json` salvo cambio de geometría).

## §3 UI + preview + validación

- **Modal:** una fila de swatches por zona mapeada (3 en v1: pelo/torso/piernas; piel y guerrero pendientes de máscaras/aplanado — sinergia con acciones-por-dispositivo). Reutiliza clase/stats/preview. Cambio de clase → defecto de la nueva (conserva coincidencias). `onSaveCharacter` suma `apariencia`; `color` legacy se mantiene como acento sin acoplar; sesiones viejas → defecto.
- **Preview viva:** medallón con el sprite tineado real (idle) en cada cambio — lo que ves es lo que viaja.
- **Validación:** matriz visual 3 clases × 4 estados × paletas (el mando acepta tolerancia o pide retoque); units (`sanearApariencia`, roundtrip, cota LRU) en `scripts/test.mjs`; `tsc` + build verdes; manual a dos clientes (uno viejo): personalizar → remoto → recarga → reunirse, sin regresión de FPS.
- **Éxito v1:** zonas mapeadas personalizables (3: pelo/torso/piernas; piel pendiente de máscaras), visibles en remoto, persistentes, sin regresión, retrocompat.

## Fuera de alcance (propuestas futuras)

`20261011a` máscaras · `20261011b` piezas por capas · `20261011c` pixel-art libre · `20261010e` inventario/equipo (consume esta capa).
