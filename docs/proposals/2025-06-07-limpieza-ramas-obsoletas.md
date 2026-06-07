# Limpieza y Archivado de Ramas Obsoletas

- **Estado**: Propuesta
- **Fecha**: 2025-06-07
- **Fuente**: Análisis de branches del repositorio
- **Dependencias**: Ninguna

## Contexto

El repositorio acumula ramas que ya no son relevantes: mergeadas, obsoletas o basadas en versiones antiguas del proyecto. Mantenerlas genera confusión y ruido visual.

## Propuesta

### Ramas a archivar (mergeadas o contenidas en `main`)

| Rama | Motivo |
|------|--------|
| `fix--multiplayer-sync` | Merge de `feature/host-authoritative-sync` ya en `main` |
| `refactor-analysis-12963097995031006677` | Ya mergeada en `main` |
| `feature/character-actions-update-671443092862364909` | Ya mergeada |
| `feature/modular-implementation-13975438501929626979` | Ya mergeada |
| `feature/host-authoritative-sync-8756322264695793164` | Ya mergeada |
| `feature/sprite-migration-analysis-and-infra-12358115067566099152` | Ya mergeada |
| `feature/learn-networking-webrtc` | Ya mergeada |
| `develop` | Ya mergeada |

### Ramas obsoletas (revierten código antiguo)

| Rama | Motivo |
|------|--------|
| `jules-graphics-improvement-13767810730549723346` | Revierte a `public/maze.html` monolítico |

### Ramas con propuestas pendientes (mover a referencias en `proposals/`)

| Rama | Propuesta derivada |
|------|--------------------|
| `feature/difficulty-items-xp-12673207957702073884` | `2025-06-07-sistema-items-xp-dificultad.md` |
| `home-sweet-home-818438520533950681` | `2025-06-07-mapa-privado-home-sweet-home.md` |
| `ui-cleanup-and-new-game-option-10977526157056483679` | `2025-06-07-ui-cleanup-reconexion.md` |
| `origin/analisis-host-dedicado-11834633133244937891` | `2025-06-07-servidor-dedicado.md` + `2025-06-07-red-hibrida-federada.md` |
| `origin/feat/websocket-migration-plan-6825007319129763829` | `2025-06-07-migracion-websockets.md` |

### Ramas a eliminar (redundantes)

```bash
# Archivar (git branch -d para mergeadas)
git branch -d fix--multiplayer-sync
git branch -d refactor-analysis-12963097995031006677
git branch -d feature/character-actions-update-671443092862364909
git branch -d feature/modular-implementation-13975438501929626979
git branch -d feature/host-authoritative-sync-8756322264695793164
git branch -d feature/sprite-migration-analysis-and-infra-12358115067566099152
git branch -d feature/learn-networking-webrtc
git branch -d develop

# Eliminar obsoleta (git branch -D)
git branch -D jules-graphics-improvement-13767810730549723346

# Eliminar remote obsoletas
git push origin --delete analisis-host-dedicado-11834633133244937891
git push origin --delete feat/websocket-migration-plan-6825007319129763829
```

### Ramas a mantener

| Rama | Motivo |
|------|--------|
| `feature-character-creation-madness-difficulty-10829604070513669949` | Verificar contenido antes de decidir |
| `rev_mov_touch` | Verificar contenido antes de decidir |
| `feature/multi-host` | Verificar contenido antes de decidir |
| `feature/difficulty-items-xp-*` | Mantener como referencia (ya documentada en proposals) |
| `home-sweet-home-*` | Mantener como referencia (ya documentada en proposals) |
| `ui-cleanup-and-new-game-option-*` | Mantener como referencia (ya documentada en proposals) |

## Consecuencias

- **Positivas**:
  - Repositorio más limpio y fácil de navegar.
  - Menos confusión para nuevos contribuidores.
  - Historial de propuestas preservado en `docs/proposals/`.

- **Negativas**:
  - Se pierde acceso fácil a ramas antiguas (pero ya están documentadas).
  - Algunas ramas pueden contener código útil no documentado.

- **Riesgos**:
  - Eliminar ramas remote requiere permisos de push.
  - Algunas ramas no verificadas pueden tener contenido valioso.

## Pasos recomendados

1. Verificar ramas no analizadas (`feature-character-creation-madness-difficulty-*`, `rev_mov_touch`, `feature/multi-host`).
2. Proceder con la limpieza de ramas mergeadas y obsoletas.
3. Mantener ramas con propuestas como referencia.
