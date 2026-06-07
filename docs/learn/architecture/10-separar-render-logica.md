# LEARN: Separar Render de Lógica con `requestAnimationFrame`

## Concepto

En un juego en navegador, el monitor refresca la pantalla típicamente a 60 Hz (60 FPS). Si atamos la lógica del juego (movimiento, combate, IA) a la frecuencia de dibujo, dos problemas surgen: (1) en monitores de 144 Hz la lógica iría demasiado rápida, y (2) si el renderizado se retrasa (lag de frame), la lógica también se congela. La solución es **desacoplar** el loop de renderizado (`requestAnimationFrame`) del loop de lógica del mundo (el *tick*), usando un control de tiempo independiente.

En nuestro juego, `cicloDeJuego()` corre a la frecuencia del monitor vía `requestAnimationFrame`, pero `procesarTick()` (IA, resolución de acciones, snapshots) solo se ejecuta cuando ha transcurrido al menos `config.tickRate` milisegundos desde el último tick.

## Por qué es importante

- **Framerate visual fluido**: el canvas se redibuja tan rápido como el monitor permita, con interpolación suave entre posiciones lógicas.
- **Lógica determinista**: el estado del mundo avanza a un ritmo constante e independiente del hardware. Un jugador con monitor de 144 Hz no tiene ventaja sobre otro con 60 Hz.
- **Recuperación ante lag**: si un frame tarda 200 ms (por ejemplo, por una tarea pesada del navegador), el renderer puede saltarse frames, pero la lógica ejecuta los ticks pendientes sin perderse.
- **Facilita debugging**: puedes pausar el renderizado (congelar la pantalla) sin afectar la simulación interna.

## Explicación sencilla

Imagina un **reloj de péndulo** en una vitrina de cristal:

- El **péndulo** es la **lógica del juego**: cada oscilación completa es un *tick*. Tiene su propio ritmo, constante, marcado por un mecanismo interno (`tickRate`).
- El **cristal** es el **renderer**: un visitante puede mirar el péndulo cuantas veces quiera por el cristal, pero eso no hace que el péndulo oscile más rápido.
- Si un visitante mira 60 veces por segundo (60 FPS) y el péndulo oscila 10 veces por segundo (10 Hz), a veces verá el péndulo en la misma posición que la vez anterior, pero eso no importa: el mecanismo interno sigue funcionando a su ritmo.

## Ejemplo práctico

### 1. El loop de renderizado: 60 FPS del monitor (`main.ts`)

```typescript
export class Game {
  public config: GameConfig = {
    // ...
    tickRate: 16   // ~60 ticks/segundo (1000/16 ≈ 62.5 Hz)
  };

  cicloDeJuego() {
    // === FASE 1: LÓGICA (variable, controlada por tiempo) ===
    this.actualizar();

    // === FASE 2: RENDER (siempre, a 60 FPS nativos del monitor) ===
    this.renderer.limpiar();
    const offset = this.renderer.obtenerOffsetCamara(this.protagonista, this.config);

    this.renderer.aplicarZoom(this.config);
    this.renderer.dibujarLaberinto(this.mapaLaberinto, offset, this.config);
    this.renderer.dibujarNiebla(this.mapaLaberinto, offset, this.config, persistence);

    // Actualizar frames de animación (interpolación visual)
    this.protagonista.actualizarEstado();
    this.network.jugadoresRemotos.forEach(j => { if (j.entidad) j.entidad.actualizarEstado(); });
    this.listaDeEnemigos.forEach(e => { if (e.estaVivo) e.actualizarEstado(); });

    // Dibujar entidades interpoladas
    this.renderer.dibujarEntidad(this.protagonista, offset, this.config, this.mapaLaberinto);
    this.network.jugadoresRemotos.forEach(j => {
        if (j.entidad) this.renderer.dibujarEntidad(j.entidad, offset, this.config, this.mapaLaberinto);
    });
    this.listaDeEnemigos.forEach(e => {
        if (e.estaVivo) this.renderer.dibujarEntidad(e, offset, this.config, this.mapaLaberinto);
    });

    // Proyectiles, UI, textos flotantes...
    this.ui.actualizarTextosFlotantes();
    this.ui.dibujarTextosFlotantes(this.renderer.getCtx());

    // Bolas de fuego, radares, efectos visuales
    for (let i = this.bolasDeFuego.length - 1; i >= 0; i--) {
        const b = this.bolasDeFuego[i];
        b.pct += b.speed || 0.02;  // Avance porcentual por frame visual
        // ... colisiones y dibujo ...
        this.renderer.dibujarProyectil(b, offset, this.config);
    }

    this.renderer.finalizarZoom();
    this.renderer.dibujarMarcadoresMovimiento(this.config);
    this.renderer.dibujarUI(this);

    // === FASE 3: PROGRAMAR EL SIGUIENTE FRAME ===
    requestAnimationFrame(() => this.cicloDeJuego());
  }
}
```

**Qué está pasando aquí**:
- `requestAnimationFrame` le pide al navegador: "llámame justo antes del próximo refresco de pantalla". Es más eficiente que `setInterval` porque se sincroniza con el compositor del navegador y se pausa automáticamente cuando la pestaña no está activa.
- `actualizar()` se llama **en cada frame visual**, pero dentro de `actualizar` hay una guarda de tiempo que decide si realmente se ejecuta un *tick* lógico.
- `actualizarEstado()` (de las entidades) avanza los **frames de animación** cada 200 ms (5 FPS de animación), pero se *llama* 60 veces por segundo. Esto permite que la interpolación visual (`visualFila`, `visualColumna`) sea suave incluso cuando el frame de animación no cambia.

### 2. El loop de lógica: controlado por tiempo (`main.ts`)

```typescript
actualizar() {
    if (!this.protagonista) return;

    // === Actualizar UI fija (HP, stats, cooldowns) ===
    const hpStat = document.getElementById('hpStat');
    if (hpStat) hpStat.textContent = `${Math.floor(this.protagonista.vidaActual)}/${this.protagonista.vidaMaxima}`;
    // ... más stats ...

    // === LÓGICA DEL HOST: solo el host ejecuta ticks del mundo ===
    if (this.esHost) {
        const ahoraTick = Date.now();
        if (ahoraTick - this.ultimoTick >= this.config.tickRate) {
            this.procesarTick();
            this.ultimoTick = ahoraTick;
        }
    }

    // === Zoom progresivo (interpolación visual, no lógica) ===
    if (this.config.zoom !== this.config.targetZoom) {
        const diff = this.config.targetZoom - this.config.zoom;
        if (Math.abs(diff) < 0.01) {
            this.config.zoom = this.config.targetZoom;
        } else {
            this.config.zoom += diff * 0.05;  // Aproximación exponencial suave
        }
        this.ajustarDimensiones();
    }

    // === Autozoom en combate (transición visual suave) ===
    if (this.config.autoZoom) {
        if (this.protagonista.enCombateCon) {
            this.config.targetZoom = 3;
        } else {
            this.config.targetZoom = 1;
        }
    }
}
```

**Qué está pasando aquí**:
- `this.ultimoTick` guarda el timestamp del último tick ejecutado. Si han pasado al menos `tickRate` ms (16 ms ≈ 60 Hz), se ejecuta `procesarTick()`.
- El zoom no es instantáneo (`zoom = targetZoom`), sino que se **interpola** progresivamente (`zoom += diff * 0.05`). Esto ocurre en **cada frame visual**, no en cada tick lógico, por lo que la transición es suave aunque la lógica vaya a 10 Hz.
- La UI de estadísticas se actualiza en cada frame visual porque es barato y queremos que los números sean reactivos.

### 3. El tick: donde vive la lógica pesada (`main.ts`)

```typescript
procesarTick() {
    if (!this.esHost) return;  // Solo el host ejecuta lógica del mundo

    // === Resolver cola de acciones de jugadores ===
    while (this.colaAcciones.length > 0) {
        const item = this.colaAcciones.shift();
        this.resolverAccion(item.id, item.accion);
    }

    // === Actualizar IA de todos los NPCs ===
    this.listaDeEnemigos.forEach(e => (e as any).actualizarIA(this));

    // === Enviar snapshot del estado del mundo a todos los clientes ===
    this.enviarSnapshot();
}
```

**Qué está pasando aquí**:
- `procesarTick` es la "caja fuerte" de la lógica del juego. Aquí se resuelven movimientos, combates, spawns, muertes. Nada de esto depende de cuántos FPS tenga el monitor.
- En modo multijugador, solo el **host** ejecuta ticks. Los invitados reciben snapshots y hacen predicción local. Ver la píldora LEARN "Host-Authority con Snapshots".
- `colaAcciones` es el patrón Command Queue (ver píldora LEARN 12). Las acciones de los jugadores se encolan y se resuelven en orden durante el tick.

---

### Diagrama de flujo del game loop

```
requestAnimationFrame
       │
       ▼
  ┌─────────┐
  │ actualizar() │  ← Se llama en CADA frame visual (60 FPS)
  │   · UI fija  │
  │   · ¿Tick?   │  ← Solo si tickRate ms han pasado
  │   · Zoom     │
  └────┬────┘
       │
       ▼
  ┌─────────┐
  │ procesarTick() │  ← Solo host, solo cada ~16 ms
  │   · Resolver cola de acciones
  │   · Actualizar IA de NPCs
  │   · Enviar snapshot
  └────┬────┘
       │
       ▼
  ┌─────────┐
  │ Renderizado │  ← Se llama en CADA frame visual (60 FPS)
  │   · Limpiar canvas
  │   · Dibujar laberinto, niebla, entidades
  │   · Dibujar proyectiles, UI, textos flotantes
  └────┬────┘
       │
       ▼
requestAnimationFrame (loop)
```

## Consejo pro

### 1. Nunca uses `setInterval` para el game loop

`setInterval(() => this.gameLoop(), 16)` es un antipatrón porque:
- No se sincroniza con el refresco del monitor, causando *tearing* visual.
- Sigue ejecutándose incluso cuando la pestaña está en segundo plano, consumiendo CPU innecesariamente.
- Si un frame tarda más de 16 ms, `setInterval` encolará múltiples callbacks, saturando el hilo.

`requestAnimationFrame` se pausa en pestañas inactivas y se sincroniza con el compositor.

### 2. Acumulación de tiempo (time delta) para lag spikes

Nuestro código actual usa `if (ahora - ultimoTick >= tickRate)`, que es correcto para tick rates altos (60 Hz). Pero si `tickRate` fuera 100 ms (10 Hz) y el navegador se congelara 300 ms, solo ejecutaríamos un tick en lugar de tres. Para juegos con física determinista, usa **acumulación de tiempo**:

```typescript
let acumulado = 0;
const TICK_RATE = 100; // 10 Hz

function loop(timestamp) {
    const delta = timestamp - ultimoTimestamp;
    ultimoTimestamp = timestamp;
    acumulado += delta;

    while (acumulado >= TICK_RATE) {
        procesarTick();
        acumulado -= TICK_RATE;
    }

    renderizar(delta / TICK_RATE); // factor de interpolación
    requestAnimationFrame(loop);
}
```

### 3. Separa "update visual" de "update lógico"

En nuestro código, `actualizarEstado()` de las entidades avanza frames de animación e interpola posiciones visuales. Esto es **update visual** y debe ejecutarse en cada frame. El **update lógico** (mover la entidad de celda A a celda B, resolver combate) debe estar en `procesarTick`. Si mezclas ambos, un lag visual puede afectar la lógica del juego.

### 4. `tickRate` configurable para debugging

Considera exponer `tickRate` en un menú de debug. Durante desarrollo puedes poner `tickRate = 500` para ver claramente qué pasa en cada tick. En producción, `tickRate = 16` para 60 Hz. En juegos por turnos o de ritmo lento (como este), incluso `tickRate = 100` (10 Hz) es suficiente para la lógica, ahorrando CPU.

> **Regla de oro**: dibuja tan rápido como el monitor permita, pero piensa (ejecuta lógica) a tu propio ritmo. El jugador ve la interpolación; el servidor ve la verdad.
