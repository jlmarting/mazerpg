# LEARN: Command Queue para Multiplayer Autoritativo

## Concepto

En una arquitectura **host-autoritativa**, solo una máquina (el host) ejecuta la lógica del mundo. Los clientes no pueden modificar directamente el estado del juego; solo pueden enviar **intenciones** ("quiero moverme a la derecha", "quiero atacar al enemigo 3"). Estas intenciones se encapsulan como **comandos** y se añaden a una **cola** (`colaAcciones`). El host, en su tick lógico, vacía la cola y resuelve cada comando de forma secuencial y determinista.

Este patrón tiene tres beneficios clave:
1. **Autoridad única**: el host decide si un movimiento es válido (no hay pared, no hay otro jugador). El cliente no puede "teletransportarse" manipulando su posición local.
2. **Reproducibilidad**: si guardas la cola de acciones de una partida, puedes "rebobinar" y reproducirla paso a paso para debugging o para verificar que no hay trampas.
3. **Desacoplamiento temporal**: un cliente puede enviar una acción mientras el host está ocupado. La acción espera en la cola y se resuelve en el próximo tick.

## Por qué es importante

- **Evita desyncs**: si cada cliente moviera su propio personaje y enviara la posición final, las discrepancias serían inevitables (lag, paquetes perdidos, diferentes framerates). Con el Command Queue, todos los clientes reciben la misma resolución del host.
- **Facilita predicción local**: el invitado puede "predecir" el resultado de su propia acción para feedback visual inmediato (ver `Jugador.intentarMover`), pero el host tiene la última palabra.
- **Simplifica la lógica de red**: en lugar de sincronizar posiciones, velocidades y estados continuamente, solo sincronizas **acciones discretas**. El resto del estado se deriva de esas acciones.
- **Orden determinista**: las acciones se resuelven en el orden en que llegaron a la cola. Dos jugadores que atacan al mismo NPC en el mismo tick: el primero en la cola golpea primero.

## Explicación sencilla

Imagina un **restaurante con un único chef** (el host) y varios camareros (los clientes):

- Los camareros toman nota de los pedidos de los comensales ("una paella", "dos ensaladas") y los dejan en una **fila de tickets** (la cola de acciones).
- El chef no habla directamente con los comensales. Solo mira la fila, coge el primer ticket, cocina el plato, y lo sirve. Luego coge el siguiente.
- Si un comensal cambia de opinión ("en realidad quería pasta"), el camarero no interrumpe al chef; añade un nuevo ticket al final de la fila.
- El chef es la **única fuente de verdad** sobre qué hay en cada plato. Los comensales no pueden saltar a la cocina y echar sal ellos mismos.

## Ejemplo práctico

### 1. La cola de acciones: estructura simple (`main.ts`)

```typescript
export class Game {
  // Cola FIFO de comandos pendientes de resolución por el host
  public colaAcciones: any[] = [];

  // ...
}
```

Cada elemento de la cola es un objeto con dos propiedades:
- `id`: quién realiza la acción (ID del jugador local o remoto).
- `accion`: qué quiere hacer (`{ tipo: 'mover', df: 1, dc: 0 }`, `{ tipo: 'atacar', objetivo: 'Orco_3' }`, etc.).

### 2. El invitado envía una acción (no la ejecuta) (`Jugador.ts`)

```typescript
intentarMover(deltaFila: number, deltaColumna: number, game: IGame): boolean {
    if (!this.estaVivo) return false;

    // Rate limiting: no spamear acciones
    const ahora = Date.now();
    if (ahora - this.ultimaInteraccion < 100) return false;
    this.ultimaInteraccion = ahora;

    if (game.network && game.network.multiplayerActivo) {
        if (game.esHost) {
            // === HOST: encolar para resolver en el próximo tick ===
            (game as any).colaAcciones.push({
                id: game.network.idLocal,
                accion: { tipo: 'mover', df: deltaFila, dc: deltaColumna }
            });
        } else {
            // === INVITADO: enviar intención al host por P2P ===
            game.network.enviarMensaje({
                tipo: 'action',
                accion: { tipo: 'mover', df: deltaFila, dc: deltaColumna }
            });

            // === PREDICCIÓN LOCAL: feedback inmediato ===
            const sigF = this.fila + deltaFila;
            const sigC = this.columna + deltaColumna;

            // Verificar colisiones obvias (muros, NPCs) antes de predecir
            const celdaActual = game.mapaLaberinto[this.fila]?.[this.columna];
            let muroBloquea = false;
            if (deltaFila === -1 && celdaActual?.muros?.superior) muroBloquea = true;
            if (deltaFila === 1 && celdaActual?.muros?.inferior) muroBloquea = true;
            if (deltaColumna === -1 && celdaActual?.muros?.izquierdo) muroBloquea = true;
            if (deltaColumna === 1 && celdaActual?.muros?.derecho) muroBloquea = true;

            const npcEnCasilla = game.listaDeEnemigos.some(
                e => e.estaVivo && e.fila === sigF && e.columna === sigC
            );

            if (!muroBloquea && !npcEnCasilla && game.mapaLaberinto[sigF]?.[sigC]?.esTransitable) {
                this.fila = sigF;
                this.columna = sigC;
            }
        }
        this.estaCaminando = true;
        return true;
    } else {
        // === MODO SOLO: ejecutar inmediatamente ===
        (game as any).resolverAccion(game.network.idLocal, { tipo: 'mover', df: deltaFila, dc: deltaColumna });
        return true;
    }
}
```

**Qué está pasando aquí**:
- El **host** nunca ejecuta una acción inmediatamente. Siempre la **encola**. Esto garantiza que todas las acciones (incluso las del propio host) se resuelvan en el mismo orden determinista durante `procesarTick`.
- El **invitado** envía la acción por el canal P2P (`tipo: 'action'`) y luego **predice** localmente el resultado. La predicción es "optimista": si acierta, el jugador ve movimiento fluido. Si falla (porque el host rechazó el movimiento), el snapshot corregirá la posición más tarde (ver píldora LEARN "Host-Authority con Snapshots").
- El **rate limiting** (`ultimaInteraccion < 100`) evita que un cliente malicioso inunde la red con acciones.

### 3. El host recibe acciones remotas y las encola (`main.ts`)

```typescript
procesarMensajeMultiplayer(msg: any, idEmisor: string) {
    switch (msg.tipo) {
        case 'action':
            // Un invitado quiere hacer algo. El host lo encola para resolverlo
            // en el próximo tick, en orden de llegada.
            this.colaAcciones.push({ id: idEmisor, accion: msg.accion });
            break;

        case 'snapshot':
            // Solo los invitados reciben snapshots del host
            if (!this.esHost) {
                this.aplicarSnapshot(msg);
            }
            break;

        // ... otros casos
    }
}
```

**Qué está pasando aquí**:
- El host no distingue entre acciones locales y remotas. Ambas se encolan con el mismo formato `{ id, accion }`. La cola es **agnóstica** del origen.
- Esto simplifica enormemente la lógica: `procesarTick` solo ve una cola FIFO y la vacía. No necesita saber si la acción vino de Firebase, WebRTC o del input local.

### 4. El host resuelve la cola en cada tick (`main.ts`)

```typescript
procesarTick() {
    if (!this.esHost) return;

    // === VACIAR LA COLA DE ACCIONES ===
    while (this.colaAcciones.length > 0) {
        const item = this.colaAcciones.shift();
        this.resolverAccion(item.id, item.accion);
    }

    // === ACTUALIZAR IA DE NPCs (también determinista) ===
    this.listaDeEnemigos.forEach(e => (e as any).actualizarIA(this));

    // === ENVIAR ESTADO DEL MUNDO A TODOS LOS CLIENTES ===
    this.enviarSnapshot();
}

resolverAccion(idJugador: string, accion: any) {
    // Obtener la entidad del jugador (local o remoto)
    let entidad: IEntidadRPG | null = null;
    if (idJugador === this.network.idLocal) {
        entidad = this.protagonista;
    } else {
        const rem = this.network.jugadoresRemotos.get(idJugador);
        if (rem) entidad = rem.entidad;
    }

    if (!entidad || !entidad.estaVivo) return;

    switch (accion.tipo) {
        case 'mover':
            const sigF = entidad.fila + accion.df;
            const sigC = entidad.columna + accion.dc;

            // === VALIDACIÓN AUTORITATIVA ===
            if (sigF < 0 || sigF >= this.config.NUMERO_FILAS) return;
            if (sigC < 0 || sigC >= this.config.NUMERO_COLUMNAS) return;
            if (!this.mapaLaberinto[sigF][sigC].esTransitable) return;

            // Verificar colisión con otros jugadores
            let colisionJugador = false;
            this.network.jugadoresRemotos.forEach((j: any) => {
                if (j.entidad && j.entidad.estaVivo && j.entidad.fila === sigF && j.entidad.columna === sigC) {
                    colisionJugador = true;
                }
            });
            if (colisionJugador) return;

            // Verificar colisión con NPCs
            const npc = this.listaDeEnemigos.find(
                e => e.estaVivo && e.fila === sigF && e.columna === sigC
            );
            if (npc) {
                this.iniciarCombate(entidad, npc);
                return;
            }

            // Movimiento válido: aplicar
            entidad.fila = sigF;
            entidad.columna = sigC;
            entidad.estaCaminando = true;
            break;

        case 'atacar':
            // ... lógica de ataque validada por el host ...
            break;

        // ... más tipos de acción ...
    }
}
```

**Qué está pasando aquí**:
- `procesarTick` es la **caja fuerte** del juego. Solo se ejecuta en el host, a un ritmo constante (`tickRate`). Vacía la cola de forma secuencial.
- `resolverAccion` es la **puerta de validación**. Antes de aplicar cualquier acción, verifica:
  - ¿La entidad existe y está viva?
  - ¿La casilla destino está dentro del mapa?
  - ¿Es transitable?
  - ¿No hay otro jugador ocupando esa casilla?
  - ¿No hay un NPC (que iniciaría combate)?
- Si cualquier validación falla, la acción se **silencia** (return). El cliente que predijo el movimiento recibirá un snapshot con la posición sin cambiar, provocando un snap-back.

### 5. Flujo completo: invitado pulsa "mover arriba"

```
1. Invitado pulsa tecla "Arriba"
2. Jugador.intentarMover(-1, 0, game)
   ├── Envia por P2P: { tipo: 'action', accion: { tipo: 'mover', df: -1, dc: 0 } }
   └── Predice localmente: fila -= 1 (feedback visual inmediato)

3. Host recibe el mensaje en procesarMensajeMultiplayer
   └── Encola: colaAcciones.push({ id: 'Labc123', accion: {...} })

4. Host ejecuta procesarTick() (cada 16 ms)
   ├── Saca de la cola: { id: 'Labc123', accion: { tipo: 'mover', df: -1, dc: 0 } }
   ├── resolverAccion('Labc123', ...)
   │   ├── Valida: ¿casilla destino transitable? Sí
   │   ├── Valida: ¿otro jugador allí? No
   │   ├── Valida: ¿NPC allí? No
   │   └── Aplica: entidad.fila -= 1
   ├── Actualiza IA de NPCs
   └── enviarSnapshot() → todos los clientes reciben estado actualizado

5. Invitado recibe snapshot
   ├── Compara posición local con posición del snapshot
   ├── Si distancia > 1.1 tiles: snap-back a posición real
   └── Si distancia <= 1.1 tiles: predicción fue correcta, no hace nada
```

**Qué está pasando aquí**:
- El invitado ve el movimiento **inmediatamente** (predicción), pero sabe que es tentativo.
- El host tiene la **última palabra**. Si el invitado predijo mal (por ejemplo, un NPC apareció en esa casilla entre la predicción y el tick), el snapshot lo corrige.
- El snapshot incluye la posición de **todas** las entidades, no solo la del jugador que se movió. Esto mantiene la coherencia global.

---

### Tabla: acciones del host vs. acciones del invitado

| Rol | Envía acciones | Encola acciones | Resuelve acciones | Recibe snapshots | Predice localmente |
|-----|---------------|-----------------|-------------------|------------------|-------------------|
| **Host** | Sí (suyas) | Sí (todas) | **Sí** | No | Opcionalmente |
| **Invitado** | Sí (suyas) | No | No | **Sí** | **Sí** (obligatorio) |

## Consejo pro

### 1. Nunca ejecutes acciones del invitado directamente

Un antipatrón común es que el invitado ejecute la acción localmente y luego envíe la *posición resultante* al host. Esto es incorrecto porque:
- El invitado podría haberse movido a través de una pared por un bug de colisión local.
- Dos invitados podrían ocupar la misma casilla simultáneamente si sus colisiones locales no se sincronizaron.
- Es imposible reproducir la partida porque no tienes las acciones originales, solo los estados finales.

Siempre envía **intenciones**, nunca **resultados**.

### 2. Añade timestamps a los comandos para reconciliación

Para juegos de ritmo más rápido ( shooters, platformers ), añade un `timestamp` o un `tickNumber` a cada comando:

```typescript
colaAcciones.push({
    id: idEmisor,
    accion: msg.accion,
    tick: this.tickActual  // Número de tick en el que se recibió
});
```

Esto permite al host ejecutar la acción en el tick correcto, incluso si el paquete llegó tarde por lag. Los clientes pueden usar *client-side prediction with server reconciliation*.

### 3. Limita el tamaño de la cola

Si un cliente desconectado vuelve tras 30 segundos, no querrás procesar 2000 acciones acumuladas. Implementa un límite:

```typescript
if (this.colaAcciones.length > 100) {
    console.warn("Cola de acciones saturada. Descartando acciones antiguas.");
    this.colaAcciones = this.colaAcciones.slice(-50);  // Mantener solo las 50 más recientes
}
```

### 4. Guarda la cola para debugging y replays

```typescript
// En desarrollo, guardar log de acciones
const replayLog: any[] = [];

procesarTick() {
    while (this.colaAcciones.length > 0) {
        const item = this.colaAcciones.shift();
        replayLog.push({ tick: this.tickNumero, ...item });
        this.resolverAccion(item.id, item.accion);
    }
}

// Exportar replay al terminar la partida
descargarReplay() {
    const blob = new Blob([JSON.stringify(replayLog)], { type: 'application/json' });
    // ... trigger download
}
```

Un replay de acciones es mucho más compacto que un video o una serie de snapshots. Y es exacto: si reproducimos las mismas acciones en el mismo orden, obtenemos el mismo resultado.

> **Regla de oro**: el cliente propone, el host dispone. La cola de comandos es el puente que une la voluntad del jugador con la verdad del servidor, sin permitir que el jugador abuse de esa voluntad.
