# Análisis: Migración de WebRTC a WebSockets

Este documento analiza la viabilidad, ventajas y desafíos de migrar la capa de red de Laberinto RPG de WebRTC (P2P) a WebSockets (Servidor-Cliente).

## 1. Estado Actual (WebRTC + Firebase)
Actualmente, el juego utiliza una arquitectura **P2P con Host Autoritativo**:
- **Transporte**: WebRTC Data Channels (UDP-like o TCP-like según configuración).
- **Señalización**: Firebase Firestore para el intercambio de ofertas/respuestas y candidatos ICE.
- **Descubrimiento**: Firebase Firestore para listar partidas activas.
- **Lógica**: Uno de los jugadores (el Host) ejecuta la IA y valida las acciones.

### Ventajas Actuales
- **Bajo Coste**: No hay servidor central para el tráfico de datos.
- **Latencia P2P**: Conexión directa entre jugadores (si no hay relay TURN).

### Desafíos Actuales
- **NAT Traversal**: Muchos jugadores no pueden conectarse entre sí sin servidores TURN complejos.
- **Complejidad de Señalización**: El proceso de handshake de WebRTC es propenso a errores y lento.
- **Dependencia del Host**: Si el Host tiene mala conexión, toda la partida sufre. La migración de Host es compleja.

## 2. Propuesta: WebSockets (Socket.io)
Migrar a una arquitectura de **Servidor Centralizado**:
- **Transporte**: WebSockets (TCP).
- **Servidor**: Un backend en Node.js (por ejemplo).
- **Lógica**: Puede seguir siendo Host-Autoritativo (uno de los clientes es el Host) o Servidor-Autoritativo (la lógica se mueve al backend).

### Comparativa Técnica

| Característica | WebRTC (Actual) | WebSockets (Propuesto) |
| :--- | :--- | :--- |
| **Protocolo Base** | UDP/SCTP (generalmente) | TCP |
| **Conectividad** | P2P (Directa) | Cliente-Servidor |
| **Fiabilidad** | Alta (DataChannels configurados) | Muy Alta (TCP) |
| **Facilidad de Uso** | Compleja (ICE/STUN/TURN) | Sencilla (Directo) |
| **Latencia** | Mínima (directa) | Media (salto extra por servidor) |
| **Coste Servidor** | Casi nulo (solo señalización) | Elevado (tráfico de datos central) |

## 3. Impacto en la Arquitectura
La migración permitiría simplificar enormemente el `NetworkManager`. En lugar de gestionar múltiples `RTCPeerConnection`, el cliente solo mantendría **una única conexión** con el servidor de WebSockets.

### Escenarios de Migración
1.  **Relevo (Relay)**: El servidor solo reenvía mensajes. Uno de los clientes sigue siendo el "Host" lógico. Es la migración más fácil.
2.  **Autoritativo (Full Server)**: La lógica de NPCs, colisiones y estado del mundo se mueve al servidor Node.js. Esto elimina las trampas y mejora la estabilidad, pero requiere reescribir mucha lógica de TypeScript en el backend.

## 4. Conclusión del Análisis
La migración a **WebSockets (Escenario 1: Relay)** es altamente recomendada para mejorar la tasa de éxito de conexión entre jugadores y simplificar el mantenimiento del código, manteniendo la lógica actual de juego.

---

# Plan de Migración

## Fase 1: Infraestructura Backend (Node.js)
1.  Crear un proyecto Node.js con `socket.io`.
2.  Implementar gestión de "Rooms" (salas) para agrupar jugadores por partida.
3.  Implementar lógica de asignación de Host (el primero que entra en la sala es el Host).
4.  Servicio de descubrimiento: Reemplazar el listado de Firebase por un endpoint o evento de socket que devuelva salas activas.

## Fase 2: Abstracción en el Frontend
1.  **Refactorizar `NetworkManager`**:
    - Crear una interfaz `INetworkProvider`.
    - Implementar `WebRTCProvider` (el código actual).
    - Implementar `WebSocketProvider` (usando `socket.io-client`).
2.  **Desacoplar Firebase**:
    - Mover la lógica de `FirebaseManager` a una interfaz de `DiscoveryService` para que el juego pueda funcionar sin Firebase.

## Fase 3: Implementación del Transporte WebSocket
1.  Integrar el cliente de `socket.io` en el frontend.
2.  Mapear los mensajes actuales (`JSON`) a eventos de socket.
3.  Implementar el "Handshake" simplificado (unirse a sala -> recibir estado inicial).

## Fase 4: Pruebas y Transición
1.  Habilitar un selector de "Modo de Red" en el menú de desarrollo para probar ambos sistemas.
2.  Realizar pruebas de latencia con varios jugadores.
3.  Desplegar el servidor (por ejemplo, en Heroku, Render o un VPS).

## Fase 5: Limpieza (Opcional)
1.  Eliminar dependencias de Firebase si el servidor de WebSockets asume todas las funciones.
2.  Optimizar el payload de los mensajes (usar buffers binarios si es necesario).
