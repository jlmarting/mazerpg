# LEARN: El bucle de render que nunca duerme

## Concepto

`requestAnimationFrame(callback)` encadena el callback al siguiente ciclo de pintado del navegador. Si al final del callback vuelves a llamar a `requestAnimationFrame`, creas un **bucle infinito** que se ejecuta ~60 veces por segundo hasta que se cierra la pestaña. Si no hay una forma de romper ese bucle (guardando el id devuelto y llamando a `cancelAnimationFrame`), el juego sigue renderizando frames aunque esté en pausa, en background, o haya terminado.

## Por qué es importante

- **Consumo perpetuo de CPU/GPU**: el navegador sigue pintando y ejecutando lógica aunque el juego esté en estado de "game over" o en segundo plano.
- **Imposible de pausar**: si no tienes el `requestId` guardado, no puedes detener el bucle ni siquiera para ahorrar batería.
- **El navegador te mata**: los navegadores modernos degradan la prioridad de las pestañas en background, pero si el bucle es intensivo (renderizado + lógica + red), el navegador puede acabar matando la pestaña o el usuario forzando el cierre.

## Explicación sencilla

Es como tener un coche con el acelerador pegado al suelo. El motor va a toda revolución siempre, aunque el coche esté aparcado. Tarde o temprano algo se sobrecalienta.

## Ejemplo práctico

El patrón problemático:

```typescript
class Game {
    iniciarMotorJuego() {
        if (this.motorIniciado) return;
        this.motorIniciado = true;
        // ... generar mapa, enemigos, objetos ...
        this.cicloDeJuego();  // ← arranca el bucle infinito
    }

    cicloDeJuego() {
        this.actualizar();
        this.renderer.limpiar();
        // ... dibujar todo ...
        
        requestAnimationFrame(() => this.cicloDeJuego());  // ← RAF perpetuo
    }

    abandonarPartida() {
        window.location.reload();  // ← única "solución": matar la página
    }
}
```

La versión con control:

```typescript
class Game {
    private gameLoopId: number | null = null;  // ← guardamos el id del RAF

    detenerMotorJuego() {
        if (this.gameLoopId !== null) {
            cancelAnimationFrame(this.gameLoopId);  // ← rompemos el bucle
            this.gameLoopId = null;
        }
        this.motorIniciado = false;
    }

    cicloDeJuego() {
        if (this.juegoTerminado) {
            this.detenerMotorJuego();  // ← fin del juego, paramos el bucle
            return;
        }
        
        this.actualizar();
        this.renderer.limpiar();
        // ... dibujar todo ...
        
        this.gameLoopId = requestAnimationFrame(() => this.cicloDeJuego());
        //            ^^^^^ guardamos para poder cancelar
    }

    abandonarPartida() {
        this.detenerMotorJuego();  // ← limpiamos sin recargar la página
        // ... limpiar estado de red, timers, etc. ...
        this.regresarAlMenuPrincipal();
    }
}
```

## Consejo pro

El patrón seguro para cualquier bucle con `requestAnimationFrame`:

```typescript
private loopId: number | null = null;
private running = false;

start() {
    if (this.running) return;
    this.running = true;
    this.tick();
}

stop() {
    this.running = false;
    if (this.loopId !== null) {
        cancelAnimationFrame(this.loopId);
        this.loopId = null;
    }
}

private tick() {
    if (!this.running) return;
    this.update();
    this.render();
    this.loopId = requestAnimationFrame(() => this.tick());
}
```

Con esta plantilla:
- `start()` es reentrante (no crea bucles duplicados)
- `stop()` corta el bucle inmediatamente
- El flag `running` evita que un RAF pendiente ejecute lógica después de `stop()`
- Siempre puedes pausar/reanudar sin recargar la página
