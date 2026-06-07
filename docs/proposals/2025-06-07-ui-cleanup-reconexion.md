# Limpieza de UI, Reconexión y Nuevas Opciones

- **Estado**: Propuesta
- **Fecha**: 2025-06-07
- **Fuente**: `ui-cleanup-and-new-game-option` (4 commits, no mergeado)
- **Dependencias**: Ninguna

## Contexto

La rama `ui-cleanup-and-new-game-option` implementa mejoras de usabilidad en la interfaz y funcionalidad de reconexión que no han sido integradas en `main`.

## Propuesta

### 1. Limpieza de UI

- **Recolocación de menús**: Menú principal a la izquierda, acciones arriba.
- **Logs lado a lado**: Visualización de logs de conexión optimizada.
- **Nueva opción "New Game"**: Botón para reiniciar partida sin recargar la página.

### 2. Reconexión automática

- Lógica de reconexión cuando el jugador pierde conexión.
- Guardado temporal de estado local.
- Reintento de unirse a la misma partida.

### 3. Opción "Desatascar"

- Comando de emergencia para mover al jugador cuando está atascado.
- Robustez del sistema de teleportación.

## Consecuencias

- **Positivas**:
  - UX mejorada significativamente.
  - Menos frustración por desconexiones.
  - Herramienta de recovery para bugs de colisión.

- **Negativas**:
  - Requiere rebase (rama basada en versión antigua).
  - La reconexión puede tener race conditions con el estado del juego.

- **Riesgos**:
  - La reconexión puede fallar si el host cambió el estado del juego significativamente.

## Referencias

- Rama: `ui-cleanup-and-new-game-option-10977526157056483679`
- Commits: 4 commits con cambios en 69 archivos (+3023/-14592)
- Archivos clave: `src/ui/UIManager.ts`, `src/main.ts`, `src/network/NetworkManager.ts`
