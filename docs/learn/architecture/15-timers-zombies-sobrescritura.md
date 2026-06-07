# LEARN: Timers zombie — cuando sobrescribes un servicio sin destruir el anterior

## Concepto

Cuando guardas una instancia de un servicio en una propiedad (`this.signaling = new SignalingClient()`) y luego la sobrescribes con una nueva instancia, la anterior no se destruye automáticamente. Si esa instancia tenía **timers activos** (`setInterval`, `setTimeout`), listeners de red o callbacks registrados, esos recursos siguen vivos y ejecutándose en segundo plano.

## Por qué es importante

- **Múltiples timers ejecutándose en paralelo**: cada SignalingClient zombie sigue haciendo polling HTTP a su ritmo. Con el tiempo, decenas de clientes zombi pueden estar haciendo cientos de peticiones por minuto.
- **Las conexiones nunca se cierran**: los `fetch` pendientes, los `onSnapshot` de Firestore, etc., se acumulan. El navegador tiene un límite de conexiones simultáneas.
- **Silencioso y progresivo**: no hay error visible inmediato. El navegador se vuelve más lento gradualmente hasta que el usuario nota el lag o el crash.

## Explicación sencilla

Es como tener una radio encendida en tu salón. Si compras una radio nueva y la colocas al lado, la vieja no se apaga sola. Ahora tienes dos radios sonando. Si sigues comprando radios nuevas sin apagar las viejas, tu salón se llena de ruido insoportable.

## Ejemplo práctico

El patrón problemático en el código real:

```typescript
class Game {
    signaling: SignalingClient | null = null;

    // ⚠️ Tres sitios diferentes que sobrescriben sin limpiar:

    iniciarComoHostHttp() {
        // El SignalingClient anterior (si existe) se pierde
        this.signaling = crearSignalingClient();  // ← el viejo sigue con su pollTimer!
        this.networkHttp = new NetworkManagerHttp();
        // ...
    }

    async listarPartidasHttp() {
        if (!this.signaling) {
            this.signaling = crearSignalingClient();  // ← otro nuevo
        }
        // ...
    }

    private iniciarModoHttp() {
        if (this.networkHttp) return;
        this.signaling = crearSignalingClient();  // ← y otro más
        // ...
    }
}
```

Cada SignalingClient tiene su propio `pollTimer` (setInterval a 1s). Si un usuario alterna entre modos de conexión varias veces, puede haber múltiples clientes zombi haciendo polling simultáneo.

La versión segura:

```typescript
iniciarComoHostHttp() {
    // ✅ Destruir antes de crear
    this.signaling?.desconectar();
    this.networkHttp?.desconectar();
    
    this.signaling = crearSignalingClient();
    this.networkHttp = new NetworkManagerHttp();
    this.networkHttp.setSignaling(this.signaling);
    // ...
}
```

Y el `desconectar()` debe ser completo:

```typescript
desconectar(): void {
    this.detenerPolling();      // mata el setInterval
    this.initialized = false;   
    this.idPartidaActual = null;
    this.onSignalCallbacks = [];     // limpia arrays de callbacks
    this.onPartidasCallbacks = [];   // limpia arrays de callbacks
}
```

## Consejo pro

Establece el principio de **"destruir antes de crear"** para cualquier servicio con ciclo de vida:

```typescript
setServicio(nuevo: T) {
    this.activo?.destroy();   // siempre destruir el anterior
    this.activo = nuevo;      // asignar el nuevo
}
```

Mejor aún, usa un método auxiliar para cambios de modo:

```typescript
private cambiarModoRed(nuevoModo: 'firebase' | 'http' | 'manual') {
    // Fase 1: destruir todo lo anterior
    this.signaling?.desconectar();
    this.networkHttp?.desconectar();
    this.network?.desconectar?.();
    this.detenerIntervalosFirebase();
    this.detenerIntervalosHttp();

    // Fase 2: iniciar el nuevo modo
    switch (nuevoModo) {
        case 'http':
            this.signaling = crearSignalingClient();
            this.networkHttp = new NetworkManagerHttp();
            this.networkHttp.setSignaling(this.signaling);
            break;
        // ...
    }
}
```

Este patrón centralizado previene no solo los timers zombie, sino también muchos otros leaks asociados al cambio de modo de juego.
