# LEARN: Signaling híbrido — misma P2P, transportes distintos

## Concepto

WebRTC necesita un **canal auxiliar** (llamado *signaling*) para que dos peers se "descubran" antes de poder hablar directamente. El truco está en que **la lógica P2P es exactamente la misma** sin importar cómo intercambies esos primeros mensajes. En este proyecto usamos dos backends de señalización distintos —Firebase Firestore y un servidor HTTP propio— pero ambos crean el mismo `RTCPeerConnection` y el mismo `RTCDataChannel`.

## Por qué es importante

- **Te da libertad de infraestructura**: puedes empezar con Firebase (sin servidor propio) y migrar luego a HTTP si quieres independencia o menor latencia en la señalización.
- **Demuestra la separación de responsabilidades**: la conexión P2P no debe ensuciarse con detalles de *cómo* se intercambiaron los mensajes iniciales.
- **Hace el código testeable**: puedes mockear el signaling sin tocar nada de WebRTC.

## Explicación sencilla

Imagina que quedas con un amigo en un parque enorme sin teléfono. Necesitas a un **mensajero** que os diga en qué banco estáis sentados. Ese mensajero puede ser un pajarero, un ciclista o un dron: da igual. Una vez os encontráis, habláis **cara a cara** sin intermediarios.

En WebRTC:
- El **mensajero** es el *signaling* (Firebase, HTTP, WebSocket, ¡hasta palomas!).
- La **conversación cara a cara** es la conexión P2P (`RTCPeerConnection` + `RTCDataChannel`).

## Ejemplo práctico

En nuestro juego tenemos dos managers de red. Fíjate en lo **idéntico** que es el core WebRTC:

**Con Firebase (`NetworkManager.ts`)**:
```typescript
const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
const dc = pc.createDataChannel("mazeRPG");
// Guarda la oferta en Firestore para que el invitado la lea...
```

**Con HTTP (`NetworkManagerHttp.ts`)**:
```typescript
const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
const dc = pc.createDataChannel("mazeRPG");
// Envía la oferta vía this.signaling.enviarSenal(...)
```

La única diferencia está en **cómo se transportan los mensajes**:

| Fase | Firebase | HTTP |
|------|----------|------|
| Oferta | `doc(...).set({ offer })` | `POST /signal/:partida/:fromId` |
| Respuesta | `doc(...).set({ answer })` | Igual, pero vía polling |
| Candidatos ICE | Subcolección `iceCandidates` | Payload `type: 'ice'` |
| Recepción | `onSnapshot()` (push real-time) | Polling cada 1000 ms |

## Consejo pro

Diseña tu interfaz de signaling como si fuera un **contrato**, no una implementación. En nuestro caso ambos managers usan los mismos métodos conceptuales (`setupWebRTCHost`, `setupWebRTCGuest`, `enviarMensaje`), lo que nos permitiría añadir un tercer backend (WebSocket, gRPC, QR codes...) sin tocar una sola línea de la lógica P2P.

> **Regla de oro**: WebRTC es ciego al transporte de signaling. Aprovéchalo.
