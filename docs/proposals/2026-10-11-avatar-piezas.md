# Spec: Piezas v1 — remap fijas + overlay con anclas (Fase 2)

**Fecha:** 2026-10-11 · **Ronda:** `20261011c-avatar-piezas-overlay` · **Diseño aprobado:** prototipos `agent/` (v3 piezas F validadas) + híbrido (base F ligera, dimorfismo en piezas)
**Base:** `feature/avatar-piezas-overlay` · **Propuesta:** `20261011b-agent-avatar-piezas-capas`

## Modelo unificado

Dos clases de pieza, mismo compositor:
- **pieza-remap** (peto, botas): predicado tono+banda ya existente, paleta FIJA de la pieza (no del usuario). Sin arte nuevo.
- **pieza-overlay** (pelo-largo, casco): geometría nueva con ancla medida por frame (cabeza-x + anchos fijos, lección v2→v3). Arte programático versionado en script.

## §1 Datos

- Ranuras: `pelo | torso | piernas | casco`.
- `apariencia.piezas: Record<Ranura, string | null>` (variant-id o null=off; v1 una variante por ranura y género: `pelo-largo-f`, `peto-f`, `botas-f`…; M usa base + casco unisex).
- `sanearApariencia`: variante desconocida → null; sin `piezas` → todo null (retrocompat).
- Viaja en `apariencia` (handshake/`avatar`/sesión sin cambios de forma). Reglas: `fichaOk` admite `piezas` en apariencia (size ≤ 3).

## §2 Arte y registro

- `scripts/gen_piezas.py` (receta versionada): genera `pieces.png` (overlays) + `piezas.json` (por pieza/variante/clase/estado/frame: ancla + caja) + `PIEZA_PALETAS` (remaps fijos).
- `SpriteConfig`: registra overlays (`pieza_{id}_{frame}`); remaps usan el compositor existente con paleta fija.
- Orden: base tineada → remaps → overlays. Caché: clave += piezas.

## §3 UI y validación

- Modal: toggle por ranura (variantes futuras caben en el mismo slot); preview con piezas.
- Validación: matriz con/sin piezas × M/F (el mando acepta o pide receta); suite+build; manual navegador.
- Éxito v1: F con identidad propia componible, M intacto, sin regresión, retrocompat (sin piezas = bandas v2).

## Fuera

Variantes múltiples por slot, pixel-art libre, máscaras finas, inventario/equipo.
