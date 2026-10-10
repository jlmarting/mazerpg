# Informe Técnico: Arquitectura de Comunicación Híbrida y Federada

## 1. Concepto Propuesto
Se propone un sistema de red híbrido que combina **WebRTC (P2P)** para la comunicación local dentro de "zonas" y **WebSockets (Cliente-Servidor)** para la federación de dichas zonas y la comunicación de larga distancia.

## 2. Componentes del Sistema

### 2.1. Nodos Host de Zona (WebRTC)
*   Cada instancia del juego puede actuar como un **Host de Zona**.
*   Gestiona un cluster local de jugadores mediante canales de datos WebRTC.
*   Es la autoridad local para los eventos que ocurren en su área (IA de monstruos locales, colisiones inmediatas).

### 2.2. Servidor de Enlace (WebSocket Bridge)
*   Actúa como el registro central de todos los Hosts activos.
*   Permite la comunicación inter-zona: si el Jugador A (en Zona 1) envía un mensaje global o realiza una acción que afecta a la Zona 2, el mensaje viaja:
    `Jugador A -> Host Zona 1 -> Servidor WebSocket -> Host Zona 2 -> Jugadores en Zona 2`.

### 2.3. Mecanismo de Entrada y Resiliencia
*   **Acceso Inteligente**: Un nuevo jugador intenta unirse a una zona existente mediante WebRTC.
*   **Auto-escalado (Sharding)**: Si el jugador no puede unirse (ej. zona llena o latencia alta), el sistema lo promueve automáticamente a **Host de una nueva zona**.
*   **Resiliencia**:
    *   Si el Servidor WebSocket cae, las zonas locales siguen funcionando independientemente (P2P).
    *   Si un Host de Zona cae, se activa el mecanismo de **Migración de Host** dentro del cluster WebRTC para mantener la zona viva antes de reconectar con el bridge.

## 3. Análisis de Ventajas

| Característica | Host Dedicado Puro | Híbrido Federado |
| :--- | :--- | :--- |
| **Coste Servidor** | Alto (proporcional a jugadores) | Bajo (solo tráfico de coordinación) |
| **Escalabilidad** | Limitada por CPU del servidor | Prácticamente ilimitada (distribuida) |
| **Latencia local** | Media (depende del servidor) | Muy baja (P2P directo) |
| **Persistencia** | Alta (centralizada) | Media (requiere snapshots en el bridge) |
| **Resiliencia** | Punto único de fallo | Fallo parcial (zonas aisladas) |

## 4. Desafíos Técnicos y Viabilidad
La viabilidad es alta dado que el proyecto ya cuenta con una base sólida de WebRTC y una transición a TypeScript modular.

### 4.1. Sincronización de Fronteras
Es el mayor desafío: los jugadores que se encuentran en el límite entre dos zonas deben poder verse. Esto requiere que los Hosts vecinos intercambien información de posición de "jugadores frontera" a través del servidor WebSocket.

### 4.2. Autoridad Distribuida
Se debe implementar un protocolo claro para la transferencia de "propiedad" de un objeto o entidad cuando cruza de una zona a otra para evitar duplicidades o pérdida de estado.

## 5. Conclusión
El modelo híbrido federado es la solución óptima para un juego que busca **escalabilidad masiva con costes mínimos de infraestructura**. Proporciona una experiencia resiliente donde el mundo puede seguir existiendo de forma fragmentada incluso ante fallos en el nodo central.

---
*Elaborado por: Jules, Software Engineer*
