# Análisis de Migración de WebRTC a WebSockets

- **Estado**: Propuesta
- **Fecha**: 2025-06-07
- **Fuente**: `origin/feat/websocket-migration-plan` → `ANALISIS_WEBSOCKETS.md`
- **Dependencias**: Relacionado con `2025-06-07-servidor-dedicado.md`

## Contexto

El sistema actual de WebRTC P2P tiene ventajas (bajo coste, latencia directa) pero presenta desafíos significativos:

- **NAT Traversal**: Muchos jugadores no pueden conectarse sin servidores TURN complejos.
- **Complejidad de señalización**: El handshake de WebRTC es propenso a errores y lento.
- **Dependencia del host**: Si el host tiene mala conexión, toda la partida sufre.

## Propuesta

Migrar a una arquitectura de **Servidor Centralizado con WebSockets** (Socket.io):

| Característica | WebRTC (Actual) | WebSockets (Propuesto) |
|---|---|---|
| Transporte | UDP-like (DataChannel) | TCP (WebSocket) |
| Latencia P2P | Directa (si no hay relay) | Via servidor (+~10-50ms) |
| NAT Traversal | Problemático | No aplica |
| Coste infraestructura | TURN servers (caro) | Un servidor Node.js |
| Complejidad señalización | Alta (SDP + ICE) | Baja (Socket.io) |
| Escalabilidad | Limitada por host | Horizontal vía clustering |

### Opciones de implementación

1. **WebSocket puro**: Máximo control, más trabajo.
2. **Socket.io**: Auto-reconexión, fallback, rooms integradas.
3. **WebSocket + Redis Pub/Sub**: Para escalar horizontalmente.

## Consecuencias

- **Positivas**:
  - Eliminación de problemas de NAT/TURN.
  - Señalización más simple y robusta.
  - Base sólida para modo competitivo / matchmaking.

- **Negativas**:
  - Pérdida de ventajas P2P (latencia en LAN, sin coste de servidor).
  - Requiere infraestructura de servidor permanente.
  - TCP Head-of-line blocking vs UDP.

- **Riesgos**:
  - Para juegos en LAN, WebRTC sigue siendo superior.
  - Si el servidor cae, todas las partidas se ven afectadas.

## Alternativas consideradas

1. **WebRTC + SFU**: Mantener P2P pero usar servidor de reenvío para resolver NAT. Más complejo pero preserva latencia P2P.
2. **Mejorar WebRTC actual**: Servidores TURN propios + reconexión automática.

## Referencias

- Rama: `origin/feat/websocket-migration-plan`
- Documento original: `ANALISIS_WEBSOCKETS.md`
- Relacionado: `2025-06-07-servidor-dedicado.md`
