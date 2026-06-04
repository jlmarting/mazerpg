# LEARN: State Machine Ligero para Animación

## Concepto

Una **máquina de estados** (state machine) es un patrón de diseño donde una entidad solo puede estar en **un estado a la vez**, y las transiciones entre estados siguen reglas predefinidas. En nuestro juego implementamos una versión **ligera**: sin librerías externas, sin grafos complejos, solo un campo `estadoActual` de tipo literal de unión (`'idle' | 'walking' | 'attacking' | 'defending' | 'fallen'`) más un temporizador de expiración.

Cada estado se mapea directamente a una secuencia de sprites: `player_guerrero_walking_0`, `_1`, `_2...` El renderer solo necesita saber `estadoActual` y `frameActual` para decidir qué dibujar.

## Por qué es importante

- **Previene estados inconsistentes**: una entidad no puede estar atacando y caminando a la vez. La máquina de estados fuerza un único estado activo.
- **Desacopla lógica de visualización**: el motor de combate y la IA deciden *qué estado* tiene la entidad; el renderer solo consulta ese estado para dibujar. No hay lógica de dibujo en el combate ni lógica de combate en el renderer.
- **Permite animaciones temporales**: estados como `attacking` o `defending` duran un tiempo fijo (ej. 500 ms) y luego vuelven automáticamente a `idle` o `walking`. No necesitas gestionar timers externos.
- **Escalable sin complejidad**: añadir un nuevo estado es tan simple como añadir un literal al tipo y una rama en `setEstado`. No requiere refactorizar el motor entero.

## Explicación sencilla

Imagina a un **actor en un teatro** que solo puede interpretar una escena a la vez:

- **Idle** = está en el escenario esperando, sin hacer nada.
- **Walking** = camina de un lado a otro.
- **Attacking** = saca la espada y ataca. Dura exactamente 3 segundos; cuando termina, vuelve a idle o walking.
- **Defending** = levanta el escudo. Dura 2 segundos; luego baja el escudo.
- **Fallen** = ha "muerto" en escena. Es un estado **absorbente**: una vez caído, no puedes levantarte (a menos que haya un mecanismo de resurrección).

El **director** (`setEstado`) decide cuándo cambiar de escena, pero respeta reglas estrictas: no puedes pasar de "muerto" a "caminando" sin una transición especial. El **vestuario** (renderer) mira qué escena se está interpretando y pone al actor el traje correspondiente.

## Ejemplo práctico

### 1. Definir los estados y sus reglas de transición (`EntidadRPG.ts`)

```typescript
export abstract class EntidadRPG implements IEntidadRPG {
  // === Sistema de Animación y Estados ===
  estadoActual: 'idle' | 'walking' | 'attacking' | 'defending' | 'fallen' = 'idle';
  frameActual: number = 0;
  ultimaActualizacionFrame: number = 0;
  estadoExpira: number = 0;  // Timestamp en ms; 0 = no expira

  /**
   * Cambia el estado de la entidad, respetando reglas de transición.
   * Reinicia el frame a 0 para que la animación comience desde el principio.
   */
  setEstado(
    nuevoEstado: 'idle' | 'walking' | 'attacking' | 'defending' | 'fallen',
    duracion: number = 0
  ) {
    // Regla 1: Fallen es absorbente. No puedes salir de 'fallen' a menos que revivas.
    if (this.estadoActual === 'fallen' && nuevoEstado !== 'fallen') return;

    // Regla 2: Solo reinicia frame y timestamp si el estado cambia realmente.
    // Evita parpadear si setEstado se llama 60 veces por segundo con el mismo estado.
    if (this.estadoActual !== nuevoEstado) {
        this.estadoActual = nuevoEstado;
        this.frameActual = 0;
        this.ultimaActualizacionFrame = Date.now();
    }

    // Regla 3: Estados temporales (attacking, defending) expiran después de 'duracion' ms.
    if (duracion > 0) {
        this.estadoExpira = Date.now() + duracion;
    } else {
        this.estadoExpira = 0;
    }
  }
}
```

**Qué está pasando aquí**:
- El tipo `'idle' | 'walking' | 'attacking' | 'defending' | 'fallen'` es una **unión de literales** de TypeScript. El compilador rechazará cualquier asignación como `estadoActual = 'jumping'` porque no está en la lista permitida. Es documentación ejecutable.
- `setEstado` es el **único punto de entrada** para cambiar de estado. Cualquier otra parte del código (combate, IA, input del jugador) debe pasar por aquí.
- La expiración temporal se implementa con un timestamp (`estadoExpira`), no con un `setInterval`. Esto es más eficiente porque solo se comprueba en el `actualizarEstado` del game loop.

### 2. Disparar estados desde la lógica del juego

```typescript
// ====== En combate (main.ts) ======
if (ataque > defensa) {
    // El defensor recibe daño y entra en estado 'defending' por 500 ms
    defensor.recibirDano(ataque - defensa, atacante);
    
    // El atacante entra en estado 'attacking' por 300 ms
    atacante.setEstado('attacking', 300);
}

// ====== En la IA de un NPC (EnemigoNPC.ts) ======
if (dF + dC <= 1) {
    // El NPC está al lado del jugador: inicia combate
    game.iniciarCombate(this, objetivoInteres);
    this.setEstado('attacking', 500);
}

// ====== Cuando el jugador se mueve (Jugador.ts / main.ts) ======
// 'estaCaminando' es un flag booleano que se activa al pulsar una tecla de dirección
// y se desactiva al soltarla. La máquina de estados lo convierte en 'walking' automáticamente.
```

**Qué está pasando aquí**:
- El combate no dice "dibuja el escudo"; dice "el defensor está defendiendo". El renderer se encarga del resto.
- Los estados temporales (`attacking`, `defending`) llevan duración. Los estados permanentes (`idle`, `walking`) no llevan duración (o llevan 0).

### 3. Actualizar el estado automáticamente en cada tick (`EntidadRPG.actualizarEstado`)

```typescript
actualizarEstado() {
    const ahora = Date.now();

    // --- Expiración automática de estados temporales ---
    if (this.estadoExpira > 0 && ahora > this.estadoExpira) {
        this.estadoExpira = 0;  // Marca como expirado
    }

    // --- Transición automática a idle/walking ---
    if (this.estaVivo && this.estadoExpira === 0) {
        const estadoDeseado = this.estaCaminando ? 'walking' : 'idle';
        if (this.estadoActual !== estadoDeseado) {
            this.setEstado(estadoDeseado);
        }
    }

    // --- Avance de frames de animación (cada 200 ms) ---
    const msPorFrame = 200;
    if (ahora - this.ultimaActualizacionFrame > msPorFrame) {
        this.ultimaActualizacionFrame = ahora;

        // Preguntar al SpriteManager cuántos frames tiene esta animación
        const prefix = (this as any).tipo !== undefined ? 'npc' : 'player';
        const clase = (this as any).clase || (this as any).tipo?.toLowerCase() || 'guerrero';
        const keyBase = `${prefix}_${clase}_${this.estadoActual}`;
        const maxFrames = spriteManager.obtenerContadorFrames(keyBase) || 1;

        // Para 'fallen', nos quedamos en el último frame (no hacemos loop)
        if (this.estadoActual === 'fallen' && this.frameActual === maxFrames - 1 && maxFrames > 1) {
            // Freeze en último frame
        } else {
            this.frameActual = (this.frameActual + 1) % maxFrames;
        }
    }
}
```

**Qué está pasando aquí**:
- `actualizarEstado` se llama en **cada frame del juego** (a través del game loop de `requestAnimationFrame`), pero solo avanza la animación cada 200 ms. Esto desacopla la frecuencia de renderizado (60 FPS) de la frecuencia de animación (5 FPS).
- La expiración se comprueba simplemente comparando `Date.now() > estadoExpira`. Cuando expira, la siguiente línea fuerza una transición a `idle` o `walking` según `estaCaminando`.
- El estado `fallen` es especial: una vez llega al último frame de la animación, se "congela" para que la entidad permanezca caída.

### 4. El Renderer mapea estado + frame a sprite (`Renderer.ts`)

```typescript
private dibujarEntidad(entidad: IEntidadRPG, offset: CameraOffset, config: GameConfig, mapaLaberinto: Celda[][]) {
    // ... cálculos de posición ...

    const esNPC = entidad.tipo !== undefined;
    const prefix = esNPC ? 'npc' : 'player';
    const clase = entidad.clase || entidad.tipo?.toLowerCase() || 'guerrero';
    
    // Construir la clave de sprite: "player_guerrero_walking_2"
    const keyBase = `${prefix}_${clase}_${entidad.estadoActual}`;
    const spriteKey = `${keyBase}_${entidad.frameActual}`;

    // 1. Intentar dibujar el sprite específico de este frame
    if (entidad.estaVivo && (this.spriteManager.obtenerSprite(spriteKey) || this.spriteManager.obtenerSprite(keyBase))) {
        this.spriteManager.dibujarSprite(this.ctx, spriteKey, x, y, TAMANO_CELDA, TAMANO_CELDA);
    }
    // 2. Fallback si no hay sprites cargados
    else if (!entidad.estaVivo) {
        this.dibujarTumba(x, y, TAMANO_CELDA);
    } else {
        this.dibujarJugadorFallback(entidad, x, y, TAMANO_CELDA);
    }
}
```

**Qué está pasando aquí**:
- El renderer es **pasivo**: no decide qué estado tiene la entidad, solo lee `estadoActual` y `frameActual`.
- La clave del sprite se construye por **convención**: `{prefijo}_{clase}_{estado}_{frame}`. Esta convención es compartida entre el juego y el `Structor` (la herramienta de mapeo de sprites), asegurando consistencia.
- Si no existe `player_guerrero_walking_2`, el `SpriteManager` hace fallback a `player_guerrero_walking_0` (ver `SpriteManager.ts` líneas 100-101).

### 5. Contrato de sprites: qué animaciones existen (`SpriteConfig.ts`)

```typescript
export const GameSpriteContract = {
    categorias: {
        jugadores: {
            clases: ['guerrero', 'explorador', 'mago'],
            acciones: ['idle', 'walking', 'attacking', 'defending', 'fallen']
        },
        npcs: {
            clases: ['esqueleto', 'orco', 'goblin', 'minotauro'],
            acciones: ['idle', 'walking', 'attacking', 'fallen']
        },
        // ...
    }
};
```

Y el `SpriteManager` cuenta automáticamente cuántos frames tiene cada animación:

```typescript
obtenerContadorFrames(nombreBase: string): number {
    let count = 0;
    while (this.sprites.has(`${nombreBase}_${count}`)) {
        count++;
    }
    return count;
}
```

**Qué está pasando aquí**:
- `GameSpriteContract` es el **contrato** entre el artista/mapeador (Structor) y el programador. Si el artista añade `player_mago_defending`, el juego ya sabe cómo usarlo porque `defending` está en la lista de acciones.
- El contador de frames es dinámico: si una animación solo tiene 1 frame (estático), el loop será `0 % 1 = 0`. Si tiene 4 frames, el loop será `0 → 1 → 2 → 3 → 0`.

---

### Tabla de estados: cuándo se activan y qué duran

| Estado | Quién lo activa | Temporal? | Expira a | Restricciones |
|--------|-----------------|-----------|----------|---------------|
| `idle` | `actualizarEstado` automáticamente | No | Nunca | Solo si `!estaCaminando && estaVivo` |
| `walking` | `actualizarEstado` automáticamente | No | Nunca | Solo si `estaCaminando && estaVivo` |
| `attacking` | Combate o IA | Sí | ~300-500 ms | Puede interrumpir `idle`/`walking`/`defending` |
| `defending` | Recibir daño | Sí | 500 ms | No si ya estás `attacking` |
| `fallen` | Morir (`vidaActual <= 0`) | No (absorbente) | Nunca | No puedes salir de él (a menos que revivas) |

## Consejo pro

### 1. Evita la "lógica espagueti" de animación

Un antipatrón común es mezclar flags booleanos (`isAttacking`, `isWalking`, `isDefending`) y luego en el renderer hacer `if (isAttacking) else if (isWalking)`. Esto escala mal: con 5 estados ya tienes 5 flags y 5^2 combinaciones posibles. Una máquina de estados con un único campo `estadoActual` elimina toda esa complejidad combinatoria.

### 2. El frame rate de animación debe ser independiente del frame rate del juego

En nuestro código usamos 200 ms por frame de animación (5 FPS de animación vs 60 FPS de render). Si sincronizaras animación con render, un lag momentáneo haría que los personajes "corrieran" a cámara lenta o se teletransportaran. Separar ambos ritmos es clave para fluidez.

### 3. Añadir direcciones (arriba/abajo/izquierda/derecha)

Si en el futuro quieres que las animaciones dependan de la dirección del movimiento, extiende el estado a tuplas: `estadoActual: 'idle' | 'walking_north' | 'walking_south'...` o añade un campo `direccion` separado. Mantén la máquina de estados simple: cada dirección es un estado más, no un sistema paralelo.

### 4. Estados temporales + callback pattern

La combinación de esta máquina de estados con el `onDamageReceived` callback (ver píldora LEARN 42) es muy potente: cuando `recibirDano` activa `defending`, el callback puede lanzar un efecto visual de partículas. Cuando `estadoExpira` vuelve a `idle`, las partículas desaparecen solas. No hay acoplamiento entre el sistema de daño y el sistema de partículas.

> **Regla de oro**: un campo de estado de unión de literales + un temporizador de expiración + un frame counter es suficiente para el 90% de los juegos 2D. No instales una librería de máquinas de estados hasta que demuestres que necesitas transiciones condicionales complejas (guardas, eventos, estados anidados).
