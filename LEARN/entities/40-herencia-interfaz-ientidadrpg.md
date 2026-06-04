# LEARN: Herencia + Interfaz Compartida (`IEntidadRPG`)

## Concepto

En TypeScript (y en la mayoría de lenguajes orientados a objetos) podemos separar **qué sabe hacer una entidad** (la interfaz) de **cómo lo hace** (la implementación). En nuestro juego usamos un patrón de tres capas:

1. **`IEntidadRPG`** — la **interfaz** que declara qué propiedades y métodos debe tener cualquier entidad del juego. Es el "contrato público".
2. **`EntidadRPG`** — la **clase abstracta** que implementa `IEntidadRPG` con la lógica común: stats, combate, animación, interpolación visual. Es la "base reutilizable".
3. **Subclases concretas** (`Jugador`, `EnemigoNPC`, `JugadorRemoto`) — especializan la base añadiendo comportamientos únicos: predicción local de movimiento, inteligencia artificial, o identificación remota.

## Por qué es importante

- **Elimina duplicación**: la lógica de combate, daño, animación y renderizado vive en un único lugar (`EntidadRPG`). Si cambiamos cómo se calcula la vida máxima, lo hacemos una vez y afecta a jugadores y enemigos por igual.
- **Permite polimorfismo**: el `Game` puede tratar a `Jugador`, `EnemigoNPC` y `JugadorRemoto` como `IEntidadRPG` sin importar quién es quién. El motor de combate no necesita `if (esJugador)`.
- **Facilita testing**: puedes crear un `DummyEntity` que implemente `IEntidadRPG` para probar el renderer o el combate sin arrancar todo el juego.
- **Mantiene el contrato visible**: la interfaz actúa como documentación viva. Un nuevo desarrollador puede leer `IEntidadRPG` y saber exactamente qué puede esperar de cualquier entidad.

## Explicación sencilla

Imagina un **restaurante** con varios chefs:

- El **menú** (la interfaz `IEntidadRPG`) dice: "todos nuestros platos llevan proteína, vegetales y salsa, y deben servirse en menos de 20 minutos". Es lo que el cliente espera, sin importar quién cocine.
- La **receta base** (la clase abstracta `EntidadRPG`) dice: "para cualquier plato, primero saltea la proteína, luego blanquea los vegetales, luego mezcla con la salsa". Es el proceso común que ahorra tiempo.
- Cada **chef especializado** (las subclases) añade su toque: el chef de carnes marina la carne 24h, el chef de pescado usa lima en lugar de limón, el chef de pasta hace la salsa al dente. No repiten los pasos base; solo añaden lo que les hace únicos.

Si el dueño del restaurante decide cambiar el tiempo de cocción de los vegetales, lo cambia en la **receta base** y todos los platos mejoran automáticamente.

## Ejemplo práctico

### 1. La interfaz: el contrato público (`types/index.ts`)

```typescript
export interface IEntidadRPG {
    // Posición
    fila: number;
    columna: number;
    visualFila: number;     // Para interpolación suave
    visualColumna: number;
    
    // Stats
    nombre: string;
    fuerza: number;
    agilidad: number;
    inteligencia: number;
    vidaActual: number;
    vidaMaxima: number;
    estaVivo: boolean;
    
    // Estado de combate y animación
    enCombateCon: IEntidadRPG | null;
    estadoActual: 'idle' | 'walking' | 'attacking' | 'defending' | 'fallen';
    frameActual: number;
    
    // Métodos que toda entidad debe implementar
    recibirDano(cantidad: number, atacante?: IEntidadRPG | null): number;
    obtenerIniciativa(): number;
    generarAtaque(): number;
    generarDefensa(): number;
    actualizarEstado(): void;
}
```

**Qué está pasando aquí**:
- La interfaz no contiene lógica, solo **declaraciones**. Dice: "si quieres ser una entidad RPG, debes tener estas propiedades y estos métodos".
- `IEntidadRPG` se usa en todo el juego: el renderer dibuja `IEntidadRPG`, el combate resuelve rondas entre dos `IEntidadRPG`, los snapshots serializan arrays de `IEntidadRPG`.

### 2. La clase abstracta: la lógica compartida (`entities/EntidadRPG.ts`)

```typescript
export abstract class EntidadRPG implements IEntidadRPG {
    fila: number;
    columna: number;
    visualFila: number;
    visualColumna: number;
    nombre: string;
    fuerza: number;
    agilidad: number;
    inteligencia: number;
    vidaMaxima: number;
    vidaActual: number;
    estaVivo: boolean;
    enCombateCon: EntidadRPG | null;
    
    // Sistema de Animación y Estados
    estadoActual = 'idle';
    frameActual = 0;
    
    // Callback opcional para desacoplar efectos visuales del combate
    public onDamageReceived?: (amount: number, entity: EntidadRPG) => void;

    constructor(fila: number, columna: number, nombre: string) {
        this.fila = fila;
        this.columna = columna;
        this.visualFila = fila;
        this.visualColumna = columna;
        this.nombre = nombre;
        
        // Generación aleatoria de stats base
        this.fuerza = Math.floor(Math.random() * 10) + 1;
        this.agilidad = Math.floor(Math.random() * 10) + 1;
        this.inteligencia = Math.floor(Math.random() * 10) + 1;
        
        this.vidaMaxima = Math.floor(10 * ((this.fuerza * 2 + this.agilidad) / 3));
        this.vidaActual = this.vidaMaxima;
        this.estaVivo = true;
        this.enCombateCon = null;
    }

    obtenerIniciativa(): number {
        const dado = Math.floor(Math.random() * 10) + 1;
        return dado + (this.agilidad + (this.inteligencia * 2)) / 3;
    }

    generarAtaque(): number {
        const dado = Math.floor(Math.random() * 10) + 1;
        return dado + this.fuerza;
    }

    generarDefensa(): number {
        const dado = Math.floor(Math.random() * 10) + 1;
        return dado + this.agilidad;
    }

    recibirDano(cantidad: number, _atacante?: EntidadRPG | null): number {
        this.vidaActual = Math.max(0, this.vidaActual - cantidad);
        if (this.vidaActual <= 0) {
            this.estaVivo = false;
            this.setEstado('fallen');
        } else if (cantidad > 0 && this.estadoActual !== 'attacking') {
            this.setEstado('defending', 500);
        }

        // Patrón Callback: notificar a quien esté escuchando
        if (this.onDamageReceived && cantidad > 0) {
            this.onDamageReceived(cantidad, this);
        }
        return cantidad;
    }

    setEstado(nuevoEstado: 'idle' | 'walking' | 'attacking' | 'defending' | 'fallen', duracion: number = 0) {
        if (this.estadoActual === 'fallen' && nuevoEstado !== 'fallen') return;
        this.estadoActual = nuevoEstado;
        this.frameActual = 0;
        if (duracion > 0) this.estadoExpira = Date.now() + duracion;
    }

    actualizarEstado() {
        // Interpolación visual para suavizado de movimiento
        const suavizado = 0.15;
        this.visualFila += (this.fila - this.visualFila) * suavizado;
        this.visualColumna += (this.columna - this.visualColumna) * suavizado;

        // Volver a idle si el estado temporal expiró
        if (this.estaVivo && this.estadoExpira === 0) {
            const estadoDeseado = this.estaCaminando ? 'walking' : 'idle';
            if (this.estadoActual !== estadoDeseado) {
                this.setEstado(estadoDeseado);
            }
        }

        // Actualizar frames de animación (cada 200ms)
        const msPorFrame = 200;
        if (Date.now() - this.ultimaActualizacionFrame > msPorFrame) {
            this.ultimaActualizacionFrame = Date.now();
            this.frameActual = (this.frameActual + 1) % maxFrames;
        }
    }
}
```

**Qué está pasando aquí**:
- `abstract class` significa que **no puedes instanciarla directamente** (`new EntidadRPG()` da error). Solo sirve como base.
- Implementa **toda** la lógica común: generación de stats, fórmulas de combate, sistema de animación por frames, interpolación visual.
- Define `onDamageReceived` como callback opcional. Esto permite que `Game` inyecte lógica de texto flotante o sincronización de red sin que `EntidadRPG` conozca esos sistemas. Ver la píldora LEARN "Callback Pattern para Efectos de Daño".

### 3. Las subclases: especialización sin duplicación

#### `Jugador` — predicción local y cooldowns de habilidades

```typescript
export class Jugador extends EntidadRPG {
  clase: string = 'guerrero';
  color: string = '#007bff';
  ultimaVezHabilidad = { fireball: 0, bow: 0, food: 0, radar: 0, whirlwind: 0, freeze: 0 };

  generarStats(nuevaClase?: string) {
    if (nuevaClase) this.clase = nuevaClase;
    // Stats base + bonus por clase
    if (this.clase === 'guerrero') { this.fuerza += 3; }
    else if (this.clase === 'explorador') { this.agilidad += 4; }
    else if (this.clase === 'mago') { this.inteligencia += 6; }
    // Balanceo automático si el total excede o queda corto...
  }

  recibirDano(cantidad: number, atacante?: EntidadRPG | null): number {
    // Los jugadores tienen período de inmunidad post-daño
    if (Date.now() < this.inmunidadHasta) return 0;
    const result = super.recibirDano(cantidad, atacante);
    if (cantidad > 0) this.pasosDesdeUltimoDano = 0;
    return result;
  }

  intentarMover(deltaFila: number, deltaColumna: number, game: IGame): boolean {
    if (!this.estaVivo) return false;

    if (game.network && game.network.multiplayerActivo && !game.esHost) {
        // El invitado envía la intención al host...
        game.network.enviarMensaje({ tipo: 'action', accion: { tipo: 'mover', df: deltaFila, dc: deltaColumna } });

        // ...pero predice localmente para feedback inmediato
        const sigF = this.fila + deltaFila;
        const sigC = this.columna + deltaColumna;
        if (/* no hay muros ni NPCs */) {
            this.fila = sigF;
            this.columna = sigC;
        }
    }
  }
}
```

#### `EnemigoNPC` — inteligencia artificial y experiencia

```typescript
export class EnemigoNPC extends EntidadRPG {
  id: number;
  tipo: string;
  radioDeVisionIA: number = 5;

  constructor(fila: number, columna: number, nombre: string, tipo: string, id: number) {
    super(fila, columna, nombre);
    this.id = id;
    this.tipo = tipo;
    this.aplicarPenalizadores('dificil');
    this.asignarExperiencia();  // Goblin=10, Orco=20, Minotauro=50
  }

  aplicarPenalizadores(dificultad: string) {
    if (dificultad === 'facil') {
      this.fuerza = Math.max(1, Math.floor(this.fuerza * 0.7));
      // ...
    } else if (dificultad === 'locura') {
      this.fuerza = Math.floor(this.fuerza * 1.75);
      // ...
    }
  }

  actualizarIA(game: IGame) {
    if (!this.estaVivo) return;

    // Si estamos en combate y el objetivo está cerca, resolvemos ronda
    if (this.enCombateCon) {
        game.resolverRondaDeCombate(this, this.enCombateCon);
        return;
    }

    // Perseguir al jugador más cercano (local o remoto) usando A*
    const objetivo = this.encontrarObjetivoMasCercano(game);
    if (this.distanciaA(objetivo) <= this.radioDeVisionIA) {
        const ruta = algoritmoBusquedaAStar(game.mapaLaberinto, this.fila, this.columna, objetivo.fila, objetivo.columna);
        if (ruta && ruta.length > 1) {
            this.ejecutarMovimientoIA(ruta[1].fila - this.fila, ruta[1].columna - this.columna, game);
        }
    } else {
        this.vagarAleatoriamente(game);
    }
  }
}
```

#### `JugadorRemoto` — identificación de red y mínima especialización

```typescript
export class JugadorRemoto extends EntidadRPG {
  public id: string;      // ID de la conexión WebRTC
  public clase: string = 'guerrero';

  constructor(fila: number, columna: number, nombre: string, id: string) {
    super(fila, columna, nombre);
    this.id = id;
  }

  recibirDano(cantidad: number, _atacante?: EntidadRPG | null): number {
    // Para jugadores remotos, el daño se sincroniza desde el host.
    // Mantenemos la llamada a super por si se usa en modo local/debug.
    return super.recibirDano(cantidad, _atacante);
  }
}
```

**Qué está pasando aquí**:
- `Jugador` sobrescribe `recibirDano` para añadir **inmunidad temporal** y sobrescribe la generación de stats para aplicar **bonuses de clase**.
- `EnemigoNPC` añade un método completamente nuevo (`actualizarIA`) que no existe en la clase base, y aplica **penalizadores por dificultad** y **puntos de experiencia** según el tipo de monstruo.
- `JugadorRemoto` es casi idéntico a la base, solo añade un campo `id` para identificar qué conexión P2P le corresponde. Esto demuestra que no siempre necesitas sobrescribir métodos; a veces basta con añadir datos.

### 4. Polimorfismo en acción: el `Game` no distingue tipos

```typescript
// main.ts — el motor de combate trabaja con IEntidadRPG, no con clases concretas
resolverRondaDeCombate(atacante: IEntidadRPG, defensor: IEntidadRPG) {
    const iniA = atacante.obtenerIniciativa();
    const iniB = defensor.obtenerIniciativa();
    
    const ataque = atacante.generarAtaque();
    const defensa = defensor.generarDefensa();
    
    if (ataque > defensa) {
        defensor.recibirDano(ataque - defensa, atacante);
    }
}

// El renderer dibuja cualquier entidad sin saber si es Jugador o NPC
snapshot.entities.forEach((entData: any) => {
    if (entData.isNpc) {
        const npc = this.listaDeEnemigos.find(e => (e as any).id === entData.id);
        npc.fila = entData.f;
        npc.columna = entData.c;
    } else {
        // Puede ser Jugador local o JugadorRemoto
        const jugador = this.obtenerEntidadPorNombre(entData.nick);
        jugador.fila = entData.f;
        jugador.columna = entData.c;
    }
});
```

**Qué está pasando aquí**:
- `resolverRondaDeCombate` acepta dos `IEntidadRPG`. No le importa si `atacante` es un `Jugador` y `defensor` un `EnemigoNPC`, o viceversa. Las mismas fórmulas se aplican a ambos.
- El renderer serializa y deserializa entidades sin distinguir tipo. Solo necesita las propiedades definidas en la interfaz.

---

### Tabla comparativa: qué añade cada capa

| Capa | Rol | Qué define | Qué NO define |
|------|-----|------------|---------------|
| **`IEntidadRPG`** | Contrato público | Propiedades y firmas de métodos obligatorios | Implementación de métodos |
| **`EntidadRPG`** | Base reutilizable | Lógica común: stats, combate, animación, interpolación | Comportamientos específicos de cada tipo |
| **`Jugador`** | Especialización | Clases, predicción local, cooldowns, inmunidad | La fórmula base de daño |
| **`EnemigoNPC`** | Especialización | IA con A*, dificultad, experiencia, tipos de monstruo | La fórmula base de defensa |
| **`JugadorRemoto`** | Especialización mínima | ID de conexión WebRTC | Casi nada; reutiliza todo de la base |

## Consejo pro

### 1. Interfaz + Clase Abstracta: ¿cuándo usar cada una?

- Usa una **interfaz** (`IEntidadRPG`) cuando quieras que objetos de orígenes muy distintos sean tratados igual. En nuestro juego, `DummyEntity` (usado por el `Structor` para previsualizar sprites) implementa `IEntidadRPG` sin heredar de `EntidadRPG` porque no necesita combate ni IA.
- Usa una **clase abstracta** (`EntidadRPG`) cuando haya lógica real que compartan la mayoría de las implementaciones. Evita copiar y pegar `recibirDano` en 5 clases diferentes.

### 2. Cuidado con la "herencia infinita"

Si descubres que `Jugador` sobrescribe 8 de 10 métodos de `EntidadRPG`, quizás no debería heredar de ella. En nuestro caso, las subclases sobrescriben 1-2 métodos y añaden 2-3 nuevos. Ese es el sweet spot.

### 3. El patrón "Template Method" en `actualizarEstado`

`actualizarEstado()` es un "template method": define el esqueleto del algoritmo (interpolar posición, expirar estados, avanzar frames) pero permite que las subclases "enganchen" en puntos específicos si lo necesitaran. Aunque actualmente ninguna subclase lo sobrescribe, el diseño lo permite sin tocar la lógica base.

### 4. Preferir composición sobre herencia para comportamientos cruzados

Nota cómo `EntidadRPG` no tiene una propiedad `ia` ni `inputController`. La IA vive solo en `EnemigoNPC` y la predicción local solo en `Jugador`. Si en el futuro quisieras que los NPCs también tuvieran predicción (modo cooperativo con IA aliada), podrías extraer esos comportamientos a **componentes** reutilizables en lugar de crear una jerarquía de herencia más profunda.

> **Regla de oro**: la interfaz te dice "qué puedes pedirme", la clase abstracta te da "la respuesta por defecto", y las subclases te dan "la respuesta especializada". Mantén la interfaz estable, la base robusta, y las subclases pequeñas.
