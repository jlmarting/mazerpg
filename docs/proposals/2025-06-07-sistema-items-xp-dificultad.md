# Sistema de Dificultad, Ítems y XP

- **Estado**: Propuesta
- **Fecha**: 2025-06-07
- **Fuente**: `feature/difficulty-items-xp` (8 commits, no mergeado)
- **Dependencias**: Relacionado con `2025-06-07-mejoras-sprite-render.md`

## Contexto

La rama `feature/difficulty-items-xp` implementa un conjunto de mejoras gameplay que no han sido integradas en `main`:

- Sistema de dificultad escalable
- Sistema de ítems y comida
- Sistema de experiencia (XP)
- Mapa infinito con coordenadas fijas
- Host tick control y sincronización estricta

## Propuesta

### 1. Sistema de dificultad

Diferentes niveles de dificultad que afectan:
- Estadísticas de enemigos (vida, daño, velocidad)
- Cantidad de enemigos por zona
- Frecuencia de ítems/curación
- Recompensas de XP

### 2. Sistema de ítems y comida

- **Ítems**: Objeto coleccionables que otorgan habilidades o mejoras temporales.
- **Comida**: Curación al ser consumida.
- Integración con el inventario del jugador.

### 3. Sistema de XP

- Acumulación de experiencia al derrotar enemigos.
- Sistema de niveles con desbloqueos.
- Sincronización multiplayer del progreso.

### 4. Mapa infinito

- Generación procedural sobre-the-fly.
- Coordenadas fijas (no relativas al jugador).
- Indicadores de posición en la UI.

### 5. Host tick control

- Control preciso del tick rate del host.
- Sincronización estricta entre host y clientes.

## Consecuencias

- **Positivas**:
  - Profundización significativa del gameplay.
  - Rejugabilidad mediante dificultad.
  - Base para sistema de progresión RPG.

- **Negativas**:
  - Requiere rebase completo (rama basada en versión antigua).
  - Complejidad de balanceo de dificultad y XP.
  - Testing extenso necesario.

- **Riesgos**:
  - La rama diverge mucho de `main`; integración puede ser costosa.
  - El mapa infinito puede tener bugs de memoria con sesiones largas.

## Implementación sugerida

1. **Fase 1**: Dificultad + comida (bajo riesgo, alto impacto).
2. **Fase 2**: Sistema de XP + niveles.
3. **Fase 3**: Mapa infinito (mayor complejidad).
4. **Fase 4**: Host tick control (requiere refactoring de red).

## Referencias

- Rama: `feature/difficulty-items-xp-12673207957702073884`
- Commits: 8 commits con cambios en 61 archivos (+3180/-12584)
- Archivos clave: `src/main.ts`, `src/entities/Jugador.ts`, `src/entities/EnemigoNPC.ts`, `src/network/NetworkManager.ts`
