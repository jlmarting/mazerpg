# LEARN: Patrón Singleton como State Container (`window.game`)

## Concepto

El **patrón Singleton** garantiza que una clase tenga una única instancia en toda la aplicación y proporciona un punto de acceso global a ella. En nuestro juego, la clase `Game` es un Singleton "manual": en su constructor se asigna a `(window as any).game = this`, convirtiendo la instancia única del juego en una propiedad global del navegador accesible desde cualquier parte del código.

Esto convierte a `Game` en un **State Container** (contenedor de estado centralizado): mapa, entidades, configuración, red, UI y cola de acciones viven dentro de esta única instancia. Cualquier capa que necesite conocer el estado del juego puede acceder a `window.game` sin importar dependencias circulares.

## Por qué es importante

- **Simplicidad arquitectónica**: en un juego browser pequeño/mediano, evita la complejidad de un sistema de estado reactivo (Redux, Zustand, RxJS) que sería overkill.
- **Resolución de dependencias circulares**: `EntidadRPG.actualizarEstado` necesita consultar cuántos frames tiene un sprite. En lugar de inyectar `SpriteManager` en cada entidad, la entidad accede a `window.game.renderer.spriteManager`.
- **Debugging inmediato**: abres la consola del navegador y escribes `game.protagonista.vidaActual` para inspeccionar el estado en tiempo real.
- **Inicialización controlada**: el `Game` se crea una vez, configura todo el mundo y luego arranca el loop. No hay race conditions de "quién se inicializa primero".

## Por qué es peligroso (y cómo mitigarlo)

- **Acoplamiento global**: cualquier módulo puede modificar `window.game`, dificultando rastrear quién cambió qué.
- **Testing difícil**: los tests unitarios no pueden crear múltiples instancias de `Game` independientes sin limpiar `window.game` entre test y test.
- **Sin encapsulamiento**: rompe el principio de *information hiding*. Los detalles internos de `Game` son visibles para todo el código.

**Mitigaciones que usamos**:
- `Game` implementa `IGame`, una interfaz que expone solo lo necesario. Los sistemas externos (como `NetworkManager`) dependen de `IGame`, no de `Game` concreto.
- El acceso a `window.game` está **centralizado**: solo `EntidadRPG.actualizarEstado` lo usa para obtener `spriteManager`. El resto del código usa inyección de dependencias explícita.
- No hay setter global: `window.game` se asigna una vez en el constructor y no se reasigna.

## Explicación sencilla

Imagina un **ayuntamiento** en una ciudad pequeña:

- Hay **un único edificio** que contiene todos los registros: quién vive dónde, cuántos impuestos debe cada uno, qué obras están en curso.
- Cualquier oficina (registro de la propiedad, policía, bomberos) puede **consultar** el ayuntamiento sin tener que pasarse papeles entre ellas.
- El problema: si alguien entra al ayuntamiento y cambia un registro incorrectamente, todas las oficinas se enteran tarde o mal. Por eso el ayuntamiento tiene **ventanillas específicas** (`IGame`) y no permite que cualquiera entre al archivo.

## Ejemplo práctico

### 1. Creación del Singleton (`main.ts`)

```typescript
class Game implements IGame {
  public mapaLaberinto: Celda[][] = [];
  public protagonista: Jugador = new Jugador();
  public listaDeEnemigos: EnemigoNPC[] = [];
  public renderer: Renderer;
  public network: NetworkManager = new NetworkManager();
  public config: GameConfig = { /* ... */ };
  public esHost: boolean = false;
  public colaAcciones: any[] = [];

  constructor() {
    // === ASIGNACIÓN AL SINGLETON GLOBAL ===
    (window as any).game = this;

    const canvas = document.getElementById('mazeCanvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.inicializarAssets();
    this.setupEntity(this.protagonista);
    this.initMap();
    this.ajustarDimensiones();
  }
}

// === INICIALIZACIÓN ÚNICA ===
const game = new Game();
```

**Qué está pasando aquí**:
- `(window as any).game = this` es la "ceremonia" del Singleton. Desde este momento, cualquier script en la página puede acceder a `window.game`.
- El constructor de `Game` es privado en implementaciones clásicas de Singleton, pero aquí es público. La unicidad se garantiza por convención: solo se crea una instancia al cargar la página.
- `Game` contiene ~30 propiedades públicas. Es lo que se conoce coloquialmente como un **God Object** (o "contenedor monolítico"). En proyectos pequeños esto es pragmático; en proyectos grandes, considera extraer subsistemas.

### 2. Acceso global para resolver dependencias circulares (`EntidadRPG.ts`)

```typescript
export abstract class EntidadRPG implements IEntidadRPG {
  // ...

  actualizarEstado() {
    // Interpolación visual para suavizado de movimiento
    const suavizado = 0.15;
    this.visualFila += (this.fila - this.visualFila) * suavizado;
    this.visualColumna += (this.columna - this.visualColumna) * suavizado;

    // Actualizar frames de animación
    const msPorFrame = 200;
    if (Date.now() - this.ultimaActualizacionFrame > msPorFrame) {
        this.ultimaActualizacionFrame = Date.now();

        // === ACCESO AL SINGLETON GLOBAL ===
        // EntidadRPG no recibe SpriteManager por constructor.
        // En su lugar, accede al singleton global para contar frames.
        const spriteManager = (window as any).game?.renderer?.spriteManager;
        let maxFrames = 1;

        if (spriteManager) {
            const prefix = (this as any).tipo !== undefined ? 'npc' : 'player';
            const clase = (this as any).clase || (this as any).tipo?.toLowerCase() || 'guerrero';
            const keyBase = `${prefix}_${clase}_${this.estadoActual}`;
            maxFrames = spriteManager.obtenerContadorFrames(keyBase) || 1;
        }

        this.frameActual = (this.frameActual + 1) % maxFrames;
    }
  }
}
```

**Qué está pasando aquí**:
- `EntidadRPG` es una clase base abstracta usada por `Jugador`, `EnemigoNPC` y `JugadorRemoto`. Si tuviéramos que pasar `SpriteManager` a cada constructor de cada subclase, necesitaríamos modificar 3 constructores, más todos los lugares donde se instancian.
- El acceso a `window.game?.renderer?.spriteManager` está **justificado** porque es un caso de "framework vs. entidad": el `SpriteManager` es infraestructura global, no una dependencia de negocio de la entidad.
- Usamos el **optional chaining** (`?.`) para evitar errores si `window.game` aún no está inicializado (por ejemplo, durante tests unitarios).

### 3. Interfaz `IGame`: el contrato que expone el Singleton (`types/index.ts`)

```typescript
export interface IGame {
    mapaLaberinto: Celda[][];
    config: GameConfig;
    protagonista: IEntidadRPG;
    listaDeEnemigos: IEntidadRPG[];
    jugadoresRemotos: Map<string, any>;
    esHost: boolean;
    juegoTerminado: boolean;
    firebase: any;
    network: any;
    ui: any;
    renderer: any;
    registrarEventoLog(mensaje: string): void;
    resolverRondaDeCombate(pA: IEntidadRPG, pB: IEntidadRPG): void;
    iniciarCombate(atacante: IEntidadRPG, objetivo: IEntidadRPG): void;
    // ...
}
```

Y los managers de red dependen de `IGame`, no de `Game`:

```typescript
// NetworkManager.ts
import { IGame } from '../types';

async setupWebRTCHost(guestId: string, game: IGame) {
    // ...
    game.ui.registrarLogConexion(`Iniciando PeerConnection para Invitado: ${guestId}`);
    // ...
}
```

**Qué está pasando aquí**:
- `IGame` es el "contrato público" del Singleton. Si un día dividimos `Game` en `GameState` + `GameLogic` + `GameNetwork`, cualquier código que dependa de `IGame` seguirá funcionando.
- `NetworkManager.setupWebRTCHost` recibe `game: IGame` por parámetro. No accede a `window.game`. Esto permite testear el NetworkManager pasando un mock de `IGame`.

### 4. Debugging en consola: el superpoder del Singleton

```typescript
// En la consola del navegador (F12):
> game.protagonista.vidaActual
< 85

> game.listaDeEnemigos.length
< 12

> game.network.jugadoresRemotos.size
< 1

> game.esHost
< true

> game.mapaLaberinto[0][0].esTransitable
< true
```

**Qué está pasando aquí**:
- Durante desarrollo, poder inspeccionar cualquier parte del estado desde la consola es invaluable. No necesitas breakpoints ni `console.log` estratégicos: el estado completo está al alcance de la mano.
- En producción, `window.game` sigue siendo accesible, pero puedes ofuscarlo o restringirlo en builds de release si te preocupa la seguridad (aunque en un juego cliente-side, el jugador siempre puede modificar el estado).

---

### Tabla: Singleton vs. alternativas de state management

| Característica | Singleton `window.game` | Context API / Redux | Inyección manual |
|----------------|----------------------|---------------------|-------------------|
| Complejidad | Mínima | Media-Alta | Media |
| Dependencias externas | Ninguna | React/Redux/Zustand | Ninguna (pero verboso) |
| Testeabilidad | Baja (estado global) | Alta (stores inyectables) | Alta |
| Debugging en consola | Excelente | Depende de DevTools | Media |
| Escalabilidad | Baja (God Object) | Alta | Alta |
| Adecuado para | Juegos browser pequeños | Apps complejas | Sistemas modulares |

## Consejo pro

### 1. Minimiza el acceso directo a `window.game`

Regla de oro: solo usa `window.game` cuando la alternativa (pasar la referencia por 5 niveles de constructores) sea más costosa que el acoplamiento global. En nuestro código, solo `EntidadRPG.actualizarEstado` lo hace. Todo lo demás (renderer, network, UI) recibe `IGame` por parámetro o inyección.

### 2. No expongas setters globales

```typescript
// MAL: cualquier módulo puede romper el estado
game.protagonista.vidaActual = 9999;

// MEJOR: expón métodos con validación
game.curarProtagonista(cantidad: number) {
    this.protagonista.vidaActual = Math.min(
        this.protagonista.vidaMaxima,
        this.protagonista.vidaActual + cantidad
    );
}
```

### 3. Limpia `window.game` entre tests

```typescript
// En tu suite de tests
afterEach(() => {
    delete (window as any).game;
});

beforeEach(() => {
    const mockGame = crearMockGame();
    (window as any).game = mockGame;
});
```

### 4. Considera extraer subsistemas cuando `Game` supere las 1000 líneas

Nuestro `main.ts` tiene ~2800 líneas. Es funcional, pero difícil de navegar. Una refactorización natural sería extraer:
- `WorldManager`: mapa, generación, serialización
- `CombatManager`: resolución de rondas, iniciativas
- `InputManager`: controles de teclado/táctil
- `EntityManager`: spawns, muertes, cleanup

Cada uno recibiría `IGame` por constructor y expondría su propia interfaz. `Game` pasaría de ser God Object a ser **orquestador**.

> **Regla de oro**: el Singleton es una herramienta pragmática, no una excusa para el caos global. Úsalo para resolver dependencias de infraestructura, pero mantén la lógica de negocio encapsulada e inyectada.
