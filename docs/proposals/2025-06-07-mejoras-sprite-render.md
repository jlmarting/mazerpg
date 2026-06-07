# Mejoras de Renderizado de Sprites

- **Estado**: Propuesta
- **Fecha**: 2025-06-07
- **Fuente**: `fix/sprites_no_visibles` (rama actual, 1 commit sobre main)
- **Dependencias**: Relacionado con `2025-06-07-sistema-items-xp-dificultad.md`

## Contexto

La rama `fix/sprites_no_visibles` (rama actual) contiene un fix que robustece el renderizado de sprites y la sincronización de estado al recibir daño o renacer. Este cambio es pequeño (4 archivos, +95/-22) y está listo para merge.

## Propuesta

### 1. Fix de renderizado de sprites

- Mejora en el manejo de sprites no visibles.
- Fallback más robusto cuando los sprites no se cargan correctamente.

### 2. Sincronización de estado

- Corrección de sincronización al recibir daño.
- Corrección de sincronización al renacer.
- Mejora en la robustez del estado compartido.

## Consecuencias

- **Positivas**:
  - Bug fix inmediato que mejora la experiencia.
  - Cambio pequeño y bajo riesgo.
  - Listo para merge.

- **Negativas**:
  - Solo corrige síntomas; no aborda causas raíz más profundas.

- **Riesgos**:
  - Mínimos por ser un cambio pequeño y bien acotado.

## Implementación sugerida

1. Merge inmediato de `fix/sprites_no_visibles` a `main`.
2. Verificar que el fix funciona en entorno de producción.

## Referencias

- Rama: `fix/sprites_no_visibles`
- Commits: 1 commit (`0adb9a5`)
- Archivos: `src/core/Renderer.ts`, `src/core/SpriteManager.ts`, `src/entities/EntidadRPG.ts`, `src/main.ts`
