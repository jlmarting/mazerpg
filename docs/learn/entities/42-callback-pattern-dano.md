# LEARN: Callback Pattern para Efectos de Daño

## Concepto

El **patrón Callback** (también llamado *Observer* o *Hook* en algunos contextos) consiste en pasar una función como parámetro a otra clase, para que esta la invoque cuando ocurra un evento específico, sin necesidad de conocer los detalles de quién la recibe ni qué hace.

En nuestro juego, la entidad base (`EntidadRPG`) declara un callback opcional `onDamageReceived?: (amount, entity) => void`. Cuando el método `recibirDano` calcula y aplica el daño, simplemente llama a esa función si existe. Ni la entidad ni la clase base saben nada de textos flotantes, partículas, sincronización de red o logs de combate. Esa responsabilidad recae en quien **configura** el callback: la clase `Game`.

## Por qué es importante

- **Desacopla la lógica de combate de la lógica visual/red**: `EntidadRPG` solo calcula números y cambia estados. El `Game` decide si eso merece un texto flotante, un sonido, un paquete de red o las tres cosas.
- **Evita que la entidad conozca sistemas ajenos**: `EntidadRPG` no importa `UIManager`, `NetworkManager` ni `Renderer`. Si mañana cambiamos el sistema de UI por uno basado en DOM en lugar de Canvas, `EntidadRPG` ni se entera.
- **Permite personalización por entidad**: cada entidad puede tener su propio callback. El protagonista muestra texto rojo; los NPCs muestran texto verde; los jefes finales podrían lanzar un efecto de pantalla temblorosa. Todo sin tocar la clase base.
- **Facilita testing unitario**: puedes testear `recibirDano` pasando un callback mock que verifique que se invoca con los parámetros correctos, sin arrancar todo el juego.

## Explicación sencilla

Imagina un **chef en un restaurante** que prepara una hamburguesa. La receta dice: "cuando la carne esté lista, avisa". El chef no sabe si el aviso significa:
- Llevarla a una mesa (texto flotante),
- Grabar un vídeo para TikTok (log de eventos),
- Mandar un WhatsApp al repartidor (sincronización de red).

El chef solo ejecuta `"onCarneLista?.()"`. El **maître** (`Game`) es quien decide qué hacer con esa notificación en cada mesa (entidad) del restaurante.

## Ejemplo práctico

### 1. La entidad declara el hook, pero no lo implementa (`EntidadRPG.ts`)

```typescript
export abstract class EntidadRPG implements IEntidadRPG {
  // ... stats, posición, estado ...

  /**
   * Callback opcional que se invoca cada vez que esta entidad recibe daño.
   * Permite a capas externas (UI, red, analytics) reaccionar sin acoplamiento.
   */
  public onDamageReceived?: (amount: number, entity: EntidadRPG) => void;

  recibirDano(cantidad: number, _atacante?: EntidadRPG | null): number {
    // Lógica pura de combate: reducir vida, marcar como muerto si toca
    this.vidaActual = Math.max(0, this.vidaActual - cantidad);
    if (this.vidaActual <= 0) {
      this.estaVivo = false;
      this.setEstado('fallen');
    } else if (cantidad > 0 && this.estadoActual !== 'attacking') {
      this.setEstado('defending', 500);
    }

    // === HOOK: Notificar a quien esté escuchando ===
    if (this.onDamageReceived && cantidad > 0) {
      this.onDamageReceived(cantidad, this);
    }

    return cantidad;
  }
}
```

**Qué está pasando aquí**:
- `onDamageReceived` es un campo **opcional** (`?:`) de tipo función. Si nadie lo ha asignado, la entidad funciona perfectamente: sigue recibiendo daño, muriendo y cambiando de estado. Es **transparente**.
- La entidad no verifica `if (this instanceof Jugador)` ni `if (modoMultijugador)`. Esa lógica de "quién es quién" y "qué modo estamos jugando" pertenece a `Game`, no a `EntidadRPG`.

### 2. El Game configura el callback al crear cada entidad (`main.ts`)

```typescript
export class Game {
  setupEntity(entity: any) {
    entity.onDamageReceived = (amount: number, e: any) => {
      // === CAPA VISUAL: Texto flotante ===
      const color = (e instanceof EnemigoNPC) ? "#00ff00" : "#ff0000";
      this.ui.crearTextoFlotanteEnCelda(e.fila, e.columna, `-${amount}`, color, this);

      // === CAPA DE RED: Sincronizar estado del NPC ===
      if (e instanceof EnemigoNPC && this.network && this.network.multiplayerActivo) {
        if (this.esHost) {
          // El host notifica a todos los invitados que este NPC cambió
          this.network.enviarMensaje({
            tipo: 'npc_update',
            id: e.id,
            f: e.fila,
            c: e.columna,
            v: e.vidaActual
          });
        } else {
          // El invitado notifica al host que dañó a un NPC
          this.network.enviarMensaje({
            tipo: 'npc_damaged_by_guest',
            id: e.id,
            dano: amount
          });
        }
      }

      // === CAPA DE RED: Sincronizar daño a jugadores remotos ===
      if (e instanceof JugadorRemoto && this.esHost && this.network && this.network.multiplayerActivo) {
        this.network.enviarMensaje({
          tipo: 'hp_loss',
          id: e.id,
          amount: amount
        });
      }
    };
  }
}
```

**Qué está pasando aquí**:
- `setupEntity` es el **único lugar** del proyecto donde se sabe que `EnemigoNPC` debe sincronizarse por red con `npc_update`, y que `JugadorRemoto` usa `hp_loss`. Si cambiamos el protocolo de red, solo tocamos aquí.
- El callback usa **instancia de** (`instanceof`) para decidir el color del texto y el tipo de mensaje de red. Esto es aceptable porque `Game` es la capa de orquestación y sí necesita conocer los tipos concretos. `EntidadRPG` nunca hace `instanceof`.
- El callback se configura **después** de la creación de la entidad, no en su constructor. Esto permite crear entidades en contextos donde aún no existe `Game` (por ejemplo, en tests unitarios o en el `Structor`).

### 3. Dónde y cuándo se configura el callback

```typescript
// Al iniciar el juego local
this.setupEntity(this.protagonista);

// Al generar enemigos tras crear el mapa
this.listaDeEnemigos.forEach((e) => {
  this.setupEntity(e);
});

// Al recibir un snapshot multijugador con un jugador remoto nuevo
if (!rem.entidad) {
  rem.entidad = new JugadorRemoto(entData.f, entData.c, entData.nick, entData.id);
  this.setupEntity(rem.entidad);  // Le conectamos el callback
}
```

**Qué está pasando aquí**:
- Cada entidad que entra al mundo recibe su "conexión" con los sistemas externos mediante `setupEntity`. Es un patrón de **inyección de dependencias** manual pero efectivo.
- Si en el futuro quisieras que solo algunos NPCs tuvieran texto flotante (por ejemplo, los jefes), podrías crear un `setupEntityBoss` con un callback diferente. Sin cambiar `EntidadRPG`.

### 4. El callback en acción: flujo completo de un golpe

```
1. Jugador pulsa 'Atacar'
2. Game.resolverRondaDeCombate(atacante, defensor)
3. defensor.recibirDano(12, atacante)
   ├── Calcula: vidaActual = max(0, 100 - 12) = 88
   ├── defensor.estaVivo = true (no ha muerto)
   ├── defensor.setEstado('defending', 500)  // Estado temporal
   └── INVOCA: defensor.onDamageReceived(12, defensor)
       ├── Game muestra texto flotante: "-12" en rojo/verde
       ├── Si es NPC y multiplayer → envía 'npc_update' por WebRTC
       └── Si es JugadorRemoto y host → envía 'hp_loss' por WebRTC
4. Renderer dibuja el frame siguiente con estado 'defending'
```

**Qué está pasando aquí**:
- El flujo es **unidireccional**: combate → callback → UI/red. La UI y la red nunca llaman de vuelta al combate. No hay ciclos ni acoplamiento circular.
- Si el callback fallara (por ejemplo, `this.ui` es null), el combate seguiría funcionando. El daño se aplica, la vida baja, el estado cambia. Solo faltaría el efecto visual. Esto es una característica, no un bug: la lógica de juego es más importante que los efectos.

---

### Tabla comparativa: ¿Qué saben las capas?

| Capa | Sabe de daño | Sabe de UI | Sabe de red | Sabe de tipos concretos |
|------|--------------|------------|-------------|------------------------|
| `EntidadRPG` | Sí (calcula) | **No** | **No** | No (solo sabe que es `EntidadRPG`) |
| `EnemigoNPC` | Hereda | **No** | **No** | Sí (su propio tipo) |
| `Jugador` | Hereda | **No** | **No** | Sí (su propio tipo) |
| `Game.setupEntity` | No calcula | **Sí** | **Sí** | **Sí** (usa `instanceof`) |
| `UIManager` | No | Solo dibuja | **No** | No (recibe fila, columna, texto) |
| `NetworkManager` | No | **No** | Solo envía | No (recibe objetos genéricos) |

## Consejo pro

### 1. Callbacks opcionales vs eventos globales

Una alternativa al callback por entidad sería un **EventEmitter global**:

```typescript
// Alternativa: EventEmitter (más acoplamiento)
eventBus.emit('damage', { amount: 12, entity: defensor });
```

El problema del EventEmitter es que **todos los listeners reciben TODOS los eventos** y deben filtrar. Con el callback por entidad, solo `Game` decide qué entidad recibe qué efecto. Para juegos pequeños o medianos, el callback es más simple y eficiente.

### 2. No abuses de `instanceof` dentro del callback

En nuestro código usamos `instanceof EnemigoNPC` y `instanceof JugadorRemoto` para decidir el color y el mensaje de red. Esto es aceptable porque `Game` es la capa orquestadora. Pero si empiezas a tener 10 `instanceof` seguidos, considera mover esa lógica a un **strategy pattern** o a métodos virtuales en las subclases:

```typescript
// Mejor alternativa para escalabilidad
abstract class EntidadRPG {
  abstract getDamageColor(): string;
  abstract getNetworkSyncType(): string;
}
```

### 3. Desuscribe los callbacks al destruir entidades

Si tu juego crea y destruye muchas entidades (por ejemplo, oleadas de enemigos), asegúrate de limpiar el callback para evitar fugas de memoria:

```typescript
// Al matar un NPC
npc.onDamageReceived = undefined;  // O: delete npc.onDamageReceived;
this.listaDeEnemigos = this.listaDeEnemigos.filter(e => e !== npc);
```

En JavaScript, una referencia a una función (como el callback) puede impedir que el garbage collector libere la entidad si alguien más la retiene.

### 4. Callbacks encadenados

Puedes componer varios callbacks si una entidad necesita reacciones de sistemas distintos:

```typescript
entity.onDamageReceived = (amount, e) => {
  uiCallback(amount, e);
  networkCallback(amount, e);
  analyticsCallback(amount, e);
};
```

O mejor aún, extrae una función helper:

```typescript
function composeCallbacks(...fns: Function[]) {
  return (...args: any[]) => fns.forEach(fn => fn(...args));
}

entity.onDamageReceived = composeCallbacks(
  (a, e) => this.ui.crearTextoFlotante(...),
  (a, e) => this.syncNetwork(...),
  (a, e) => this.analytics.track('damage', a)
);
```

> **Regla de oro**: la entidad debe ser egoísta. Solo le importa su propia vida y su propio estado. Todo lo demás (efectos, sonidos, red, logs) es problema de quien la orquesta. El callback es el puente que permite esa separación sin romper la cohesión.
