# LEARN: Introducción a WebRTC para juegos multijugador

## Concepto

WebRTC (Web Real-Time Communication) es una tecnología del navegador que permite la comunicación directa entre dos usuarios sin pasar por un servidor central. Aunque se hizo famosa por videollamadas, su superpoder para los juegos es el **`RTCDataChannel`**: un canal de datos rápido, bidireccional y orientado a mensajes que funciona como un socket UDP-like pero con la seguridad de estar encapsulado en el navegador.

## Por qué es importante

- **Baja latencia**: una vez conectados, los paquetes viajan directamente entre jugadores. No hay "viaje de ida y vuelta" al datacenter.
- **Reduce costes de servidor**: no necesitas un backend potente retransmiendo el estado del juego a todos los clientes; el host lo hace por P2P.
- **Funciona en el navegador**: sin plugins, sin descargas, sin dependencias externas para el jugador.

## Explicación sencilla

Imagina que quieres enviar una carta a tu vecino. La opción clásica (cliente-servidor) sería meterla en un buzón, que un cartero la lleve a una oficina central, la clasifique y la devuelva a tu vecino. Con WebRTC, en cambio, **te la das directamente por el balcón** (conexión P2P).

El único problema: para poder dársela por el balcón, primero necesitáis acordar **en qué balcón os encontráis** (señalización), **qué tipo de sobre usáis** (SDP: descripción de la sesión) y **si hay vallas de por medio** (candidatos ICE: rutas alternativas si el balcón directo no funciona).

Una vez resuelto eso, el cartero ya no interviene nunca más.

## Ejemplo práctico

En nuestro juego creamos una conexión WebRTC en apenas unas líneas:

```typescript
// 1. Crear la conexión peer-to-peer
const pc = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
});

// 2. Abrir un canal de datos para enviar mensajes del juego
const dc = pc.createDataChannel("mazeRPG");

// 3. Cuando el canal se abre, podemos enviar JSON directamente
dc.addEventListener('open', () => {
  dc.send(JSON.stringify({ tipo: 'movimiento', fila: 5, columna: 3 }));
});

// 4. Recibir mensajes del otro jugador
dc.onmessage = (evento) => {
  const mensaje = JSON.parse(evento.data);
  console.log("Recibido:", mensaje);
};
```

**¿Qué son esas partes?**

| Componente | Para qué sirve | Analogía |
|------------|----------------|----------|
| `RTCPeerConnection` | El "túnel" directo entre navegadores | El balcón |
| `RTCDataChannel` | El tubo por donde pasan los mensajes del juego | El sobre |
| `STUN` | Un servidor que te dice tu IP pública | El portero que te dice "vives en la calle Mayor, 4" |
| `ICE Candidate` | Una ruta posible para llegar al otro (IP, puerto, tipo) | Las instrucciones para llegar al balcón |
| `SDP Offer/Answer` | El acuerdo de cómo será la conexión | El plano del balcón |

En este proyecto usamos WebRTC exclusivamente para **datos** (`RTCDataChannel`), no para audio ni vídeo. Eso simplifica mucho el handshake porque solo negociamos un canal de texto/binario y no streams multimedia.

## Consejo pro

No confundas **signaling** con **datos**. El signaling es el "acuerdo previo" y necesita un transporte cualquiera (Firebase, HTTP, WebSocket, un QR code escaneado con el móvil...). Los datos son el "juego en sí" y viajan por el `RTCDataChannel` sin intermediarios.

Por eso en nuestro juego los dos backends de signaling (Firebase y HTTP) acaban creando exactamente el mismo `RTCPeerConnection`: porque el signaling es solo el mensajero que trae el plano del balcón. Una vez construido, el mensajero se va a casa.

> **Regla de oro**: WebRTC no es magia. Es un acuerdo de dos navegadores para hablar directamente. Todo lo demás (signaling, reintentos, sincronización de estado) es responsabilidad tuya.
