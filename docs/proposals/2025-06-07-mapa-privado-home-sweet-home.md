# Mapa Privado "Home Sweet Home" con Teletransporte

- **Estado**: Propuesta
- **Fecha**: 2025-06-07
- **Fuente**: `home-sweet-home` (4 commits, no mergeado)
- **Dependencias**: Relacionado con `2025-06-07-sistema-items-xp-dificultad.md`

## Contexto

La rama `home-sweet-home` implementa un mapa privado bucolico donde los jugadores pueden teletransportarse, con una modal de selección de personaje antes de reanudar la partida.

## Propuesta

### 1. Mapa privado "Home Sweet Home"

- Mapa temático (isla bucólica, casas).
- Acceso exclusivo para el jugador propietario.
- Generación procedural del mapa privado.

### 2. Sistema de teletransporte

- Mecanismo de teletransporte entre zonas o al mapa privado.
- Integración con el sistema de portales existente.

### 3. Modal de selección de personaje

- Modal que aparece antes de reanudar la partida.
- Permite cambiar de clase/personaje.
- Persiste la selección del jugador.

## Consecuencias

- **Positivas**:
  - Experiencia de usuario mejorada (hub personal).
  - Base para sistema de bases/hogares.
  - Mejora la retención del jugador.

- **Negativas**:
  - Requiere rebase (rama basada en versión antigua).
  - Generación procedural adicional puede afectar rendimiento.
  - Diseño de assets nuevos necesario.

- **Riesgos**:
  - Complejidad de sincronización del mapa privado en multiplayer.
  - Memoria: mantener dos mapas activos simultáneamente.

## Referencias

- Rama: `home-sweet-home-818438520533950681`
- Commits: 4 commits con cambios en 59 archivos (+2936/-11042)
- Archivos clave: `src/main.ts`, `src/world/generation.ts`
