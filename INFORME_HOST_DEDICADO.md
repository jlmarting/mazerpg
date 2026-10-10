# Informe Técnico: Transición a un Modelo de Host Dedicado

## 1. Introducción
Este informe analiza la conveniencia y viabilidad de implementar un **Host Dedicado** (Servidor Dedicado) para el juego de laberinto multijugador, en lugar del modelo actual basado en WebRTC P2P con un jugador actuando como anfitrión.

## 2. Análisis del Estado Actual (WebRTC P2P)
Actualmente, el juego utiliza una arquitectura donde uno de los jugadores asume el rol de "Host".

### Limitaciones Identificadas:
*   **Volatilidad**: Si el jugador host cierra su navegador o pierde la conexión, la partida termina abruptamente para todos.
*   **Carga en el Cliente**: El host es responsable de procesar la IA de todos los NPCs, las colisiones y la generación del mapa, lo que puede causar lag en dispositivos menos potentes.
*   **Seguridad y Autoridad**: Al estar la "fuente de la verdad" en un cliente, es vulnerable a manipulaciones (trampas).
*   **Conectividad**: Depende de la capacidad de los clientes para establecer conexiones P2P (NAT Traversal), lo que a veces falla sin servidores TURN costosos.

## 3. Escenario Propuesto: Host Dedicado
Un host dedicado sería un proceso servidor (ej. Node.js) que reside fuera del navegador del jugador y gestiona el estado global de forma persistente.

### 3.1. Conveniencia
*   **Disponibilidad 24/7**: Los jugadores pueden entrar y salir de un mundo persistente sin depender de que el creador de la sala esté conectado.
*   **Estabilidad de Red**: Un servidor en un centro de datos ofrece latencias más consistentes y mayor ancho de banda simétrico.
*   **Fuente de Verdad Centralizada**: El servidor valida todos los movimientos y daños, eliminando la posibilidad de trampas básicas por parte de los clientes.
*   **Escalabilidad de IA**: Permite gestionar una mayor cantidad de NPCs y lógica compleja sin degradar la experiencia de juego del jugador host.

### 3.2. Viabilidad Técnica
Gracias al esfuerzo de **modularización** detectado en el proyecto (rama `feature/modular-implementation`), la transición es altamente viable.

#### Factores Clave:
1.  **Desacoplamiento**: La lógica de generación de laberintos (`generation.ts`), tipos de entidades y reglas RPG ya están siendo separadas del renderizado (Canvas). Esto permite que el mismo código corra en el servidor (entorno *headless*).
2.  **Protocolo de Comunicación**:
    *   **Opción WebRTC**: Se puede usar en el servidor mediante librerías como `node-datachannel`, permitiendo que el cliente mantenga su lógica actual de `RTCPeerConnection`.
    *   **Opción WebSockets**: Sería la más natural para un modelo cliente-servidor, simplificando la conectividad y eliminando problemas de NAT.

#### Desafíos:
*   **Coste de Infraestructura**: Requiere el alquiler de servidores (VPS) o contenedores, a diferencia del modelo P2P que es "gratuito" en términos de ancho de banda.
*   **Refactorización de Red**: Es necesario adaptar el `NetworkManager` para que hable con un único punto central en lugar de gestionar múltiples pares.

## 4. Conclusión y Recomendación
La implementación de un host dedicado es **altamente conveniente** para transformar el proyecto de una demo técnica P2P a un juego multijugador robusto y profesional.

**Recomendaciones:**
1.  **Culminar la modularización**: Asegurar que toda la lógica de juego sea independiente del DOM.
2.  **Implementar un prototipo en Node.js**: Usar WebSockets (Socket.io) para una primera versión del host dedicado, ya que ofrece mayor estabilidad para conexiones cliente-servidor que WebRTC.
3.  **Hibridación**: Mantener la opción de "Host Local" (P2P manual) para partidas privadas sin coste, pero ofrecer el "Servidor Oficial" para la experiencia principal.

---
*Elaborado por: Jules, Software Engineer*
