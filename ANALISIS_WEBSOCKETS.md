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

## 3. Impacto en la Arquitectura: El Servidor Relay

### ¿Por qué Node.js si ya tenemos un Host Autoritativo?
Es una pregunta clave. Si un jugador ya actúa como "servidor" (Host Lógico), ¿para qué añadir un servidor real en Node.js? La respuesta no es por la *lógica*, sino por la **conectividad (el transporte)**.

#### 1. El Problema del "Punto a Punto" (WebRTC)
WebRTC intenta conectar a los jugadores directamente. Sin embargo, en el mundo real:
- **NATs Simétricos y Firewalls**: Aproximadamente el **20-30% de las conexiones P2P fallan** porque los routers no permiten conexiones entrantes no solicitadas.
- **Servidores TURN**: Para solucionar esto, WebRTC necesita servidores TURN (Traversal Using Relays around NAT). Un servidor TURN es, literalmente, un servidor que retransmite (relay) los datos. Configurar y pagar un servidor TURN profesional es complejo y caro.

#### 2. Node.js como Relay (El "Intermediario")
Al introducir un servidor Node.js con WebSockets, cambiamos el modelo de **Estrella P2P** a una **Estrella Centralizada**:
- **Bypass de NAT**: Todos los clientes se conectan *hacia afuera* al servidor Node.js. Como es una conexión saliente, los firewalls y NATs la permiten siempre.
- **Simplicidad de Señalización**: Eliminamos Firebase para el "handshake". El servidor Node.js sabe quién está en cada sala y conecta a los jugadores instantáneamente.
- **Host Lógico vs. Relay Físico**:
    - El **Jugador Host** sigue siendo el dueño de la verdad (IA, daño, mapa).
    - El **Servidor Node.js** es solo el "cartero" que asegura que los mensajes lleguen al Host y vuelvan a los clientes sin fallos de conexión.

### Escenarios de Migración

| Modelo | Rol del Servidor (Node.js) | Rol del Jugador Host | Complejidad |
| :--- | :--- | :--- | :--- |
| **Relay (Propuesto)** | Retransmite mensajes. Gestiona salas. | Ejecuta IA, valida acciones, genera mapa. | Baja (Reutiliza lógica actual) |
| **Full Server** | Ejecuta toda la lógica del juego. | Es un cliente "tonto" (solo envía input y renderiza). | Alta (Requiere portar lógica a Node) |

### Flujo de Mensajes en Modo Relay
1. **Cliente A** envía "Mover a (5,5)" al servidor Node.js.
2. **Servidor Node.js** reenvía el mensaje al **Jugador Host**.
3. **Jugador Host** valida el movimiento, actualiza la IA y envía un "Snapshot" al servidor Node.js.
4. **Servidor Node.js** retransmite el "Snapshot" a todos los clientes (incluido Cliente A).

## 4. El Factor "Lag" (Latencia)

Es totalmente cierto: **técnicamente, un servidor relay introduce más latencia que una conexión P2P directa.**

### Comparativa de Latencia Teórica
- **P2P Directo**: `Cliente A -> Cliente B` (Latencia: 30ms).
- **WebSocket Relay**: `Cliente A -> Servidor -> Cliente B` (Latencia: 30ms + 30ms = 60ms).

### ¿Por qué sigue siendo una opción viable para Laberinto RPG?

1.  **WebRTC ya usa Relays (TURN)**: Cuando WebRTC no puede conectar directamente (30% de los casos), usa un servidor TURN. El servidor TURN introduce **exactamente el mismo lag** que un WebSocket Relay, pero es más difícil de configurar.
2.  **Tipo de Juego (Tile-based)**: Laberinto RPG no es un shooter (FPS) de ritmo frenético. Los movimientos están limitados por un cooldown (100ms) y las celdas son discretas. Un incremento de 40-60ms en la latencia es prácticamente imperceptible en este género.
3.  **Estabilidad vs. Velocidad**: Es preferible tener 70ms de lag constantes y garantizados para todos, que tener 20ms para algunos y que otros ni siquiera puedan conectar.

### Estrategias para Mitigar el Lag Perceptual
Si el lag se vuelve un problema, el plan incluye:
- **Interpolación de Snapshots**: Los clientes no "teletransportan" a los jugadores a la nueva posición, sino que los deslizan suavemente entre el estado anterior y el nuevo.
- **Predicción en el Cliente**: Cuando pulsas "Arriba", tu personaje se mueve visualmente al instante en tu pantalla, y el servidor confirma ese movimiento milisegundos después.
- **Compensación de Lag**: El Host puede tener en cuenta la latencia de los jugadores al calcular el combate.

## 5. Conclusión del Análisis
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
