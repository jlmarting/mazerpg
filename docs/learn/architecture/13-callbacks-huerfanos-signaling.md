# LEARN: Callbacks huérfanos en sistemas de señalización

## Concepto

Cuando un sistema de señalización (como el que usa WebRTC para intercambiar ofertas, respuestas y candidatos ICE) permite registrar callbacks mediante un método `onSignal(callback)`, cada llamada añade una función al array interno `onSignalCallbacks[]`. Si el código que registra el callback **no lo desregistra explícitamente** cuando la conexión se completa, ese callback queda **huérfano**: sigue ocupando memoria y, peor aún, sigue ejecutándose en cada ciclo de polling.

## Por qué es importante

- **Crecimiento lineal imparable**: cada nueva conexión (o reconexión) añade un callback que nunca se elimina. Con el tiempo, el array puede contener cientos o miles de funciones.
- **Degradación progresiva**: el polling itera sobre *todos* los callbacks cada 1-3 segundos. Más callbacks = más CPU por ciclo = más lentitud hasta el bloqueo total.
- **Difícil de detectar en pruebas cortas**: el problema solo se manifiesta tras minutos de juego con reconexiones, justo como describes en tu experiencia.

## Explicación sencilla

Imagina que cada vez que un invitado llama a tu puerta, tú apuntas su nombre en una lista... pero nunca lo tachas cuando se va. Con el tiempo, la lista es tan larga que cada vez que alguien llama, tardas minutos en encontrar al que realmente está llamando.

## Ejemplo práctico

El patrón problemático (extraído del código real):

```typescript
// ⚠️ PELIGRO: cada llamada a setupWebRTCHost añade un callback que NUNCA se limpia
async setupWebRTCHost(guestId: string, game: IGame) {
    // Se registra un callback en signaling.onSignalCallbacks[]
    const unsub = this.signaling.onSignal((fromId, payload) => {
        if (fromId !== guestId) return;  // ← filtra, pero el callback sigue en memoria
        // ... manejar señal ...
    });
    this.unsubscribes.set(guestId, unsub);  // ← guardado, pero nunca se usa

    dc.addEventListener('open', () => {
        game.ui.registrarLogConexion(`Canal abierto con ${guestId}`);
        pc.onicecandidate = null;
        // ❌ FALTA: this.unsubscribes.get(guestId)() — nunca se desregistra el callback
    });
}
```

La versión correcta:

```typescript
async setupWebRTCHost(guestId: string, game: IGame) {
    const unsub = this.signaling.onSignal((fromId, payload) => {
        if (fromId !== guestId) return;
        // ...
    });
    this.unsubscribes.set(guestId, unsub);

    dc.addEventListener('open', () => {
        // ✅ Desregistramos el callback ahora que el canal P2P está abierto
        const unsub = this.unsubscribes.get(guestId);
        if (unsub) { unsub(); this.unsubscribes.delete(guestId); }
        
        pc.onicecandidate = null;
        if (this.idPartidaActual) this.signaling!.limpiarSignaling(this.idPartidaActual, guestId);
    });
}
```

El lado Guest ya implementa correctamente este patrón. El lado Host simplemente lo omitió.

## Consejo pro

Siempre que tengas un método que devuelva una función de limpieza (unsubscriber), **trátalo como un `disposable`**:

```typescript
// Cada onSignal debe tener su unsub en el mismo scope o mapa
const unsub = this.signaling.onSignal(handler);
this.cleanups.set(id, unsub);

// Y cuando termines: unsub();
```

Establece como regla del equipo: "quien registra, desregistra". Si `onSignal` retorna `() => void`, úsalo. No lo guardes "por si acaso" — úsalo en el momento adecuado (cuando el canal de datos se abra, cuando el peer se desconecte, etc.).
