# Arquitectura de Comunicación Híbrida y Federada

- **Estado**: Propuesta
- **Fecha**: 2025-06-07
- **Fuente**: `origin/analisis-host-dedicado` → `INFORME_RED_HIBRIDA_RESILIENTE.md`
- **Dependencias**: Relacionado con `2025-06-07-servidor-dedicado.md`, `2025-06-07-migracion-websockets.md`

## Contexto

Un servidor dedicado único puede ser un punto único de fallo y no escala bien para mundos grandes. Se busca una arquitectura que combine lo mejor de P2P (bajo coste, latencia local) con servidores (federación, resiliencia).

## Propuesta

Sistema de red **híbrido** que combina:

### 1. Nodos Host de Zona (WebRTC)
- Cada instancia del juego puede actuar como **Host de Zona**.
- Gestiona un cluster local de jugadores mediante WebRTC DataChannel.
- Autoridad local para eventos en su área (IA de monstruos, colisiones inmediatas).

### 2. Servidor de Enlace (WebSocket Bridge)
- Registro central de todos los hosts activos.
- Comunicación inter-zona: mensajes globales o acciones entre zonas.
- Flujo: `Jugador A → Host Zona 1 → Servidor WebSocket → Host Zona 2 → Jugadores Zona 2`.

### 3. Mecanismo de Entrada y Resiliencia
- **Acceso inteligente**: Nuevo jugador intenta unirse a zona existente vía WebRTC.
- **Auto-escalado (Sharding)**: Si zona llena o latencia alta, el sistema promueve al jugador a **Host de una nueva zona**.

## Consecuencias

- **Positivas**:
  - Escalabilidad horizontal: nuevas zonas se crean automáticamente.
  - Resiliencia: si un host cae, solo afecta a su zona.
  - Bajo coste en tráfico de red local.

- **Negativas**:
  - Complejidad significativa de implementación.
  - Requiere servidor WebSocket como componente nuevo.
  - Sincronización entre zonas puede introducir latencia.

- **Riesgos**:
  - Over-engineering para el tamaño actual del juego.
  - Bugs de sincronización inter-zona difíciles de depurar.

## Alternativas consideradas

1. **Servidor dedicado simple**: Más fácil de implementar pero punto único de fallo.
2. **P2P puro mejorado**: Reconexión + migración de host (ya parcialmente implementado).

## Referencias

- Rama: `origin/analisis-host-dedicado`
- Documento original: `INFORME_RED_HIBRIDA_RESILIENTE.md`
- Relacionado: `2025-06-07-servidor-dedicado.md`
