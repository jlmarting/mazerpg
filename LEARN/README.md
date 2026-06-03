# Índice de píldoras LEARN

Colección de píldoras formativas extraídas del desarrollo real de este proyecto.

---

## WebRTC y Multiplayer

Píldoras dedicadas a la arquitectura de red P2P, señalización y sincronización de estado.

| # | Título | Descripción |
|---|--------|-------------|
| [00 - Introducción a WebRTC](webrtc/00-webrtc-intro.md) | Conceptos básicos: `RTCPeerConnection`, `RTCDataChannel`, STUN/ICE y el handshake |
| [02 - Signaling híbrido](webrtc/02-signaling-hibrido.md) | Cómo usar Firebase y HTTP como transportes de signaling sobre la misma base P2P |
| [03 - Buffering de candidatos ICE](webrtc/03-buffering-candidatos-ice.md) | Patrón para manejar la condición de carrera entre ICE candidates y `setRemoteDescription` |
| [04 - Host-Authority con Snapshots](webrtc/04-host-authority-snapshots.md) | Arquitectura host-autoritativa: snapshots periódicos, predicción local y snap-back con umbral |

---

> **Nota**: Los números de las píldoras reservan huecos para futuras áreas (01, 05-09...).
> La estructura de carpetas sigue el área temática para mantener el orden a largo plazo.
