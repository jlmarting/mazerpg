# Transición a Modelo de Host Dedicado

- **Estado**: Propuesta
- **Fecha**: 2025-06-07
- **Fuente**: `origin/analisis-host-dedicado` → `INFORME_HOST_DEDICADO.md`
- **Dependencias**: Ninguna

## Contexto

El modelo actual de WebRTC P2P con un jugador como host presenta limitaciones críticas:

- **Volatilidad**: Si el host cierra el navegador o pierde conexión, la partida termina para todos.
- **Carga en el cliente**: El host ejecuta IA de todos los NPCs, colisiones y generación del mapa, causando lag en dispositivos menos potentes.
- **Seguridad**: La autoridad reside en un cliente, vulnerable a manipulaciones (trampas).
- **Conectividad**: Depende de NAT traversal; a veces falla sin servidores TURN costosos.

## Propuesta

Implementar un **Host Dedicado** (servidor Node.js o similar) que:

1. **Gestione el estado global** de forma persistente (mapa, entidades, combate).
2. **Ejecute la IA de NPCs** y resolución de colisiones fuera del navegador del jugador.
3. **Mantenga la autoridad**: el servidor valida todas las acciones y es la fuente de verdad.
4. **Soporte sesiones persistentes**: los jugadores pueden entrar/salir de mundos sin depender del host original.
5. **Mejore la conectividad**: un servidor en centro de datos ofrece latencia más consistente y ancho de banda simétrico.

### Stack propuesto

- **Runtime**: Node.js (o Deno/Bun)
- **Comunicación**: WebSocket (Socket.io) o WebRTC SFU
- **Persistencia**: Firestore / Redis / SQLite según escala

## Consecuencias

- **Positivas**:
  - Partidas más estables y persistente.
  - Mejor rendimiento en clientes (offloading de lógica pesada).
  - Eliminación de problemas de NAT traversal.
  - Base para modo competitivo / leaderboard.

- **Negativas**:
  - Coste de infraestructura (aunque mínimo para escala pequeña).
  - Complejidad de desarrollo adicional.
  - Requiere migración de la lógica de red existente.

- **Riesgos**:
  - Over-engineering para un proyecto educativo/portfolio.
  - Latencia adicional vs P2P puro en LAN.

## Alternativas consideradas

1. **WebRTC SFU (Selective Forwarding Unit)**: Menor latencia pero mayor complejidad de infraestructura.
2. **Mejorar host existente**: Reconexión automática + migración de host (ya parcialmente implementado en ramas `ui-cleanup`).

## Referencias

- Rama: `origin/analisis-host-dedicado`
- Documento original: `INFORME_HOST_DEDICADO.md`
- Relacionado: `2025-06-07-red-hibrida-federada.md`, `2025-06-07-migracion-websockets.md`
