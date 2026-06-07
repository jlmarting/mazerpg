# LEARN: Buffering de candidatos ICE

## Concepto

Durante el *handshake* de WebRTC, los **candidatos ICE** (las "direcciones posibles" por las que un peer puede ser alcanzado) pueden llegar **antes de que la descripción remota esté lista**. Si intentas añadirlos directamente, `RTCPeerConnection` los rechazará. La solución es **bufferizarlos** temporalmente y procesarlos en cuanto `setRemoteDescription()` haya terminado.

## Por qué es importante

- **Evita errores silenciosos**: `addIceCandidate()` sin `remoteDescription` lanza excepciones o simplemente falla.
- **Garantiza la conectividad**: en redes complejas (NAT simétrico, múltiples interfaces), los candidatos llegan en ráfagas. Perder uno puede romper la conexión.
- **Es un patrón universal**: cualquier implementación WebRTC robusta debe manejar esta condición de carrera.

## Explicación sencilla

Imagina que estás esperando a que te instalen la línea de teléfono en tu nuevo piso (`setRemoteDescription`). Mientras tanto, el cartero ya intenta entregarte cartas con direcciones de contacto de tus amigos (candidatos ICE). Si aún no tienes teléfono, no puedes guardar esas direcciones. La solución: **un buzón temporal** (`iceBuffer`) donde el cartero deja todo. En cuanto te instalan la línea, vacías el buzón y registras cada dirección.

## Ejemplo práctico

En nuestro juego usamos un array `iceBuffer` tanto en el host como en el invitado.

**Host esperando respuesta (`NetworkManager.ts`)**:
```typescript
const iceBuffer: any[] = [];

// 1. Listener de candidatos ICE del invitado (desde Firebase)
const unsubIce = game.firebase.getDb()
  .collection('partidas').doc(this.idPartidaActual)
  .collection('conexiones').doc(guestId)
  .collection('iceCandidatesGuest').onSnapshot((snapshot: any) => {
    snapshot.docChanges().forEach((change: any) => {
      if (change.type === 'added') {
        const cand = change.doc.data();
        // ¿Ya tenemos la descripción remota del invitado?
        if (pc.remoteDescription) {
          pc.addIceCandidate(new RTCIceCandidate(cand));
        } else {
          // Aún no → guardamos en el buffer
          iceBuffer.push(cand);
        }
      }
    });
  });

// 2. Cuando finalmente llega la respuesta (answer)...
pc.setRemoteDescription(new RTCSessionDescription(data.answer)).then(() => {
  // Vaciamos el buffer
  while (iceBuffer.length > 0) {
    pc.addIceCandidate(new RTCIceCandidate(iceBuffer.shift()));
  }
});
```

**Invitado esperando oferta (`NetworkManagerHttp.ts`)**:
```typescript
const iceBuffer: any[] = [];
this.iceBuffers.set('host', iceBuffer);

const unsub = this.signaling.onSignal((_fromId, payload) => {
  if (payload.type === 'offer' && !pc.currentRemoteDescription) {
    pc.setRemoteDescription(new RTCSessionDescription(payload.data)).then(() => {
      while (iceBuffer.length > 0) {
        pc.addIceCandidate(new RTCIceCandidate(iceBuffer.shift()));
      }
    });
  } else if (payload.type === 'ice') {
    if (pc.remoteDescription) {
      pc.addIceCandidate(new RTCIceCandidate(payload.data));
    } else {
      iceBuffer.push(payload.data);
    }
  }
});
```

## Consejo pro

No olvides **limpiar el buffer** cuando el canal de datos se abre o cuando la conexión falla. En nuestro código, cuando el `RTCDataChannel` emite `'open'`, desuscribimos los listeners de Firebase/HTTP y ponemos `pc.onicecandidate = null`. Esto evita fugas de memoria y candidatos huérfanos que podrían confundir reconexiones futuras.

> **Regla de oro**: en WebRTC, "llegar tarde" es normal. Siempre ten un buzón de reserva para los candidatos ICE.
