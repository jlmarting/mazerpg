# LEARN: Fog of War con Decaimiento Temporal

## Concepto

El **Fog of War** (niebla de guerra) es una técnica visual clásica de juegos de estrategia y exploración: las áreas del mapa que el jugador ha visto pero ya no está mirando directamente se oscurecen progresivamente, recordando su disposición pero ocultando qué ocurre allí ahora. En nuestro juego implementamos esto mediante un **sistema de decaimiento temporal**: cada celda almacena `ultimoAvistamiento` (timestamp en ms), y el renderer calcula la opacidad de la niebla como proporción del tiempo transcurrido desde ese avistamiento.

Además, aplicamos **clipping de viewport**: solo dibujamos las celdas visibles en pantalla, no el mapa entero, lo que mantiene el rendimiento constante independientemente del tamaño del laberinto.

## Por qué es importante

- **Exploración significativa**: el jugador debe avanzar con cuidado porque no puede ver lo que ocurre detrás de él. Cada casilla explorada es información ganada.
- **Rendimiento constante**: en lugar de recalcular la visibilidad con raycasting en cada frame, simplemente consultamos un timestamp y comparamos con `Date.now()`. Es O(1) por celda.
- **Efecto visual elegante**: el decaimiento progresivo crea un gradiente suave que se siente más natural que un encendido/apagado brusco.
- **Facilita debug**: con `vistaDebugActivada` se desactiva la niebla completamente, permitiendo ver el mapa entero para testear colisiones y spawns.

## Explicación sencilla

Imagina que caminas por una cueva oscura con una **antorcha**. Las paredes que iluminas se ven perfectamente mientras estás allí. Cuando te alejas, la luz de la antorcha deja de llegar, pero **tus ojos aún recuerdan** cómo era esa pared durante unos segundos. Poco a poco, el recuerdo se difumina hasta convertirse en oscuridad completa.

En nuestro juego, la "antorcha" es el **radio de visión** del protagonista. La "memoria" es `ultimoAvistamiento`. Y el "difuminado" es la interpolación lineal de opacidad.

## Ejemplo práctico

### 1. Cada celda almacena cuándo fue vista por última vez (`Celda.ts`)

```typescript
export class Celda {
  esTransitable: boolean;
  muros = { superior: false, derecho: false, inferior: false, izquierdo: false };
  tienePico: boolean = false;
  burbuja: boolean = false;

  // === SISTEMA DE NIEBLA ===
  ultimoAvistamiento: number = 0;  // 0 = nunca vista

  constructor(esTransitable: boolean) {
    this.esTransitable = esTransitable;
  }
}
```

**Qué está pasando aquí**:
- `ultimoAvistamiento` es un simple `number` que guarda `Date.now()` cuando la celda entra en el radio de visión del jugador.
- El valor inicial `0` significa "nunca ha sido vista". Esa celda se dibuja completamente negra.
- No guardamos booleanos (`visitada: true/false`). Un timestamp nos da más información: sabemos *cuándo* se visitó, lo que permite efectos de decaimiento.

### 2. Actualizar el avistamiento cuando el jugador se mueve (`main.ts`)

```typescript
actualizarVisibilidad() {
    const radio = this.config.RADIO_VISION;
    const centroF = this.protagonista.fila;
    const centroC = this.protagonista.columna;

    for (let df = -radio; df <= radio; df++) {
        for (let dc = -radio; dc <= radio; dc++) {
            const f = centroF + df;
            const c = centroC + dc;

            if (f < 0 || f >= this.config.NUMERO_FILAS) continue;
            if (c < 0 || c >= this.config.NUMERO_COLUMNAS) continue;

            // Solo actualizar si está dentro del círculo de visión
            if (df * df + dc * dc <= radio * radio) {
                this.mapaLaberinto[f][c].ultimoAvistamiento = Date.now();
            }
        }
    }
}
```

**Qué está pasando aquí**:
- Recorremos un cuadrado de lado `2*radio + 1` centrado en el jugador.
- Filtramos por distancia euclidiana (`df² + dc² <= radio²`) para crear un **círculo de visión** en lugar de un cuadrado.
- Cada celda dentro del círculo recibe `Date.now()` como nuevo timestamp. Esto se ejecuta cada vez que el jugador se mueve o en cada tick.

### 3. El renderer calcula opacidad en cada frame (`Renderer.dibujarNiebla`)

```typescript
dibujarNiebla(
  mapaLaberinto: Celda[][],
  offset: CameraOffset,
  config: GameConfig,
  persistenceOverride?: number
) {
  // En modo debug, no dibujar niebla (ver todo el mapa)
  if (config.vistaDebugActivada) return;

  const { colOffset, filaOffset, TAMANO_CELDA, ALTO_UI_TOP } = offset;
  const { CELDAS_VISIBLES_X, CELDAS_VISIBLES_Y, NUMERO_FILAS, NUMERO_COLUMNAS, TIEMPO_DESVANECIMIENTO_NIEBLA } = config;

  // El tiempo que tarda una celda en pasar de "totalmente visible" a "totalmente oscura"
  const fadeTime = persistenceOverride || TIEMPO_DESVANECIMIENTO_NIEBLA;
  const tiempoActual = Date.now();

  // === CLIPPING DE VIEWPORT: solo iterar celdas visibles ===
  const fInicio = Math.floor(filaOffset);
  const fFin = Math.ceil(filaOffset + CELDAS_VISIBLES_Y);
  const cInicio = Math.floor(colOffset);
  const cFin = Math.ceil(colOffset + CELDAS_VISIBLES_X);

  for (let fila = fInicio; fila < fFin; fila++) {
    if (fila < 0 || fila >= NUMERO_FILAS) continue;

    for (let columna = cInicio; columna < cFin; columna++) {
      if (columna < 0 || columna >= NUMERO_COLUMNAS) continue;

      const celda = mapaLaberinto[fila][columna];
      let opacidad = 1;  // 1 = completamente negro (oculto)

      if (celda.ultimoAvistamiento > 0) {
        const tiempoDesdeVisto = tiempoActual - celda.ultimoAvistamiento;

        if (tiempoDesdeVisto < 50) {
          // Acaba de ser visto: completamente transparente
          opacidad = 0;
        } else {
          // Decaimiento lineal: opacidad proporcional al tiempo transcurrido
          opacidad = Math.min(1, tiempoDesdeVisto / fadeTime);
        }
      }

      // Solo dibujar si hay algo que oscurecer (optimización)
      if (opacidad > 0) {
        this.ctx.fillStyle = `rgba(0, 0, 0, ${opacidad})`;
        const x = (columna - colOffset) * TAMANO_CELDA;
        const y = (fila - filaOffset) * TAMANO_CELDA + ALTO_UI_TOP;
        this.ctx.fillRect(x, y, TAMANO_CELDA, TAMANO_CELDA);
      }
    }
  }
}
```

**Qué está pasando aquí**:
- `fadeTime` es configurable. Por defecto es `TIEMPO_DESVANECIMIENTO_NIEBLA` (ej. 3000 ms = 3 segundos). Los exploradores tienen un `persistenceOverride` mayor (1.5×) porque su clase les da mejor memoria visual.
- La fórmula `opacidad = tiempoDesdeVisto / fadeTime` produce un **decaimiento lineal**: a los 0 ms opacidad es 0 (transparente), a los 1500 ms es 0.5 (semi-visible), a los 3000 ms es 1 (completamente negro).
- El clipping (`fInicio`, `fFin`, `cInicio`, `cFin`) limita el bucle a las celdas visibles en pantalla. En un mapa de 100×100 celdas, si solo se ven 15×10, iteramos 150 celdas en lugar de 10,000.
- El check `if (opacidad > 0)` evita llamadas a `fillRect` innecesarias. Si una celda está en el radio de visión actual (`tiempoDesdeVisto < 50`), `opacidad` es 0 y no se dibuja nada.

### 4. La niebla también afecta entidades y UI (`Renderer.ts`)

```typescript
dibujarEntidad(entidad: IEntidadRPG, offset: CameraOffset, config: GameConfig, mapaLaberinto?: Celda[][]) {
  // ... cálculos de posición ...

  // Niebla de guerra: si la celda está completamente oscura, no dibujar la entidad
  if (!vistaDebugActivada && mapaLaberinto) {
    const gridF = Math.round(entidad.visualFila);
    const gridC = Math.round(entidad.visualColumna);
    const celdaActual = mapaLaberinto[gridF]?.[gridC];
    if (celdaActual) {
      const tiempoDesdeVisto = Date.now() - celdaActual.ultimoAvistamiento;
      if (celdaActual.ultimoAvistamiento === 0 || tiempoDesdeVisto > TIEMPO_DESVANECIMIENTO_NIEBLA) {
        return;  // Entidad completamente oculta
      }
    }
  }

  // ... dibujar entidad ...
}

dibujarBarraVida(entidad: IEntidadRPG, offset: CameraOffset, config: GameConfig, mapaLaberinto?: Celda[][]) {
  // La barra de vida también respeta la niebla
  if (!vistaDebugActivada && mapaLaberinto) {
    const gridF = Math.round(entidad.visualFila);
    const gridC = Math.round(entidad.visualColumna);
    const celdaActual = mapaLaberinto[gridF]?.[gridC];
    if (celdaActual) {
      const tiempoDesdeVisto = Date.now() - celdaActual.ultimoAvistamiento;
      if (celdaActual.ultimoAvistamiento === 0 || tiempoDesdeVisto > TIEMPO_DESVANECIMIENTO_NIEBLA) {
        return;  // No dibujar barra si está en oscuridad
      }
    }
  }
  // ... dibujar barra ...
}
```

**Qué está pasando aquí**:
- Las entidades y sus barras de vida usan la **misma lógica de niebla** que el mapa. Si una celda está completamente oscura (`tiempoDesdeVisto > fadeTime`), la entidad que esté allí no se dibuja.
- Esto evita el efecto raro de "veo una barra de vida flotando en la oscuridad".
- El cálculo usa `Math.round(visualFila)` porque `visualFila` puede ser fraccionaria debido a la interpolación suave de movimiento.

---

### Curva de decaimiento visual

```
Opacidad
   1.0 │                    ┌──────────
       │                  /
   0.5 │               /
       │            /
   0.0 │─────────/
       └───────────────────────────────
         0ms    1500ms    3000ms   Tiempo
                ↑ fadeTime
```

- **0–50 ms**: zona "viva" (jugador actualmente allí). Opacidad = 0.
- **50 ms – fadeTime**: zona de memoria. Opacidad crece linealmente.
- **> fadeTime**: zona olvidada. Opacidad = 1 (completamente negra).

## Consejo pro

### 1. Usa `requestAnimationFrame` para el timestamp

En nuestro código usamos `Date.now()`, que tiene una granularidad de ~1 ms. Para efectos más suaves, considera usar `performance.now()` (granularidad de microsegundos) o incluso un contador de ticks acumulados:

```typescript
// Más determinista para multiplayer
this.tickActual++;
celda.ultimoAvistamientoTick = this.tickActual;
// En renderer: opacidad = (tickActual - ultimoAvistamientoTick) / fadeTicks;
```

Esto garantiza que todos los clientes vean exactamente la misma opacidad si están sincronizados por ticks.

### 2. Añade un buffer de "recién visto" para evitar parpadeos

El rango de 0–50 ms (`tiempoDesdeVisto < 50`) actúa como un **hysteresis buffer**: evita que una celda justo en el límite del radio de visión parpadee entre visible y semi-visible por pequeñas fluctuaciones de posición del jugador.

### 3. Niebla como mecánica de juego, no solo como efecto visual

En nuestro juego, la niebla oculta enemigos y eventos. Puedes extender esto a mecánicas más profundas:
- **Trampas reaparecen** en celdas que han estado en oscuridad más de X segundos.
- **Enemigos respawnean** solo en celdas olvidadas.
- **Pistas de sonido** (ruido de pasos) son la única forma de detectar enemigos en la niebla.

### 4. Considera un segundo layer de "explorado vs visible"

Nuestro sistema tiene dos estados visuales: "visible ahora" (opacidad 0) y "olvidad" (opacidad 1). Muchos juegos añaden un estado intermedio: **"explorado pero no visible"**, donde ves la geometría del mapa pero no las entidades. Esto requiere dos capas de renderizado:

```typescript
// Capa 1: mapa base (suelo, muros) — siempre visible si fue explorado
// Capa 2: entidades dinámicas — solo visibles si opacidad < 1
// Capa 3: overlay negro con opacidad variable
```

### 5. Optimiza el clipping si el mapa es gigante

Para mapas de 1000×1000 celdas, incluso el clipping de viewport puede ser costoso si recalculas `fInicio`/`fFin` en cada frame. Considera cachear los límites y solo recalcularlos cuando la cámara cambia de celda:

```typescript
private viewportCache = { fInicio: 0, fFin: 0, cInicio: 0, cFin: 0, lastColOffset: -1, lastFilaOffset: -1 };

obtenerViewport(offset: CameraOffset) {
  if (offset.colOffset === this.viewportCache.lastColOffset &&
      offset.filaOffset === this.viewportCache.lastFilaOffset) {
    return this.viewportCache;
  }
  // ... recalcular y cachear ...
}
```

> **Regla de oro**: la niebla de guerra no es solo oscuridad; es información. Controlar qué sabe el jugador y cuándo lo sabe es una herramienta de diseño tan poderosa como cualquier arma o habilidad.
