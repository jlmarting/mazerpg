# LEARN: Sprite Mapping Tool como Dev Tool integrada

## Concepto

El **Structor** es una aplicación web separada (pero en el mismo repositorio) que permite a desarrolladores y artistas mapear coordenadas de un spritesheet a estados lógicos del juego (ej. `player_guerrero_walking`). La clave arquitectónica es un **contrato** (`GameSpriteContract`) que declara qué categorías, clases y acciones espera el motor del juego, asegurando que los assets generados sean consistentes con el código.

El Structor comparte el mismo `Renderer` del juego mediante una entidad dummy (`DummyEntity` que implementa `IEntidadRPG`), permitiendo previsualizar en tiempo real cómo quedarán las animaciones antes de guardar el mapeo.

## Por qué es importante

- **Independencia artista-programador**: el artista puede trabajar en los spritesheets y su mapeo sin tocar código fuente. El mapeo se guarda en un JSON que el juego consume directamente.
- **Prevención de errores silenciosos**: si el artista intenta mapear una acción `"jumping"` pero el contrato solo permite `"idle", "walking", "attacking"`, la herramienta puede advertirlo antes de que el juego falle en runtime.
- **Reutilización del renderer**: al usar el mismo `Renderer` y `SpriteManager` del juego, la previsualización es **fiel** a lo que se verá en producción. No hay sorpresas de "en la herramienta se veía bien".
- **Build multi-entry**: Vite compila tanto el juego (`index.html`) como el Structor (`structor.html`) desde el mismo codebase, compartiendo módulos y tipos.

## Explicación sencilla

Imagina que estás organizando un **festival de música** con varios escenarios:

- El **programador** es el director del festival: sabe cuántos escenarios hay, qué tipos de bandas caben en cada uno (rock, jazz, electrónica), y qué equipamiento necesitan.
- El **artista** es el productor de una banda: tiene las canciones (sprites) pero necesita saber en qué escenario tocar y en qué orden.
- El **Structor** es la **aplicación de planificación del festival**: le dice al artista "tienes estos escenarios disponibles, estos horarios, y este equipamiento". El artista arrastra sus canciones a los slots correspondientes.
- El **contrato** (`GameSpriteContract`) es el **programa oficial del festival**: define los escenarios, los horarios permitidos y las reglas. Si el artista intenta poner una canción en un slot que no existe, la aplicación se lo advierte.

## Ejemplo práctico

### 1. El contrato: qué espera el motor (`core/SpriteConfig.ts`)

```typescript
/**
 * CONTRATO ENTRE JUEGO Y HERRAMIENTA (Schema)
 * Define qué categorías, entidades y acciones espera el motor.
 */
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
        escenario_estatico: {
            clases: ['suelo', 'muro'],
            acciones: ['normal', 'cesped', 'baldosa', 'roca', 'arena', 'agua', 'puente', 'superior', 'inferior', 'izquierdo', 'derecho']
        },
        escenario_dinamico: {
            clases: ['puerta', 'trampa'],
            acciones: ['abierta', 'cerrada', 'activa', 'inactiva']
        },
        vfx: {
            clases: ['bola_fuego', 'hielo', 'flecha', 'remolino'],
            acciones: ['play']
        },
        food: {
            clases: ['manzana', 'plátano', 'kiwi', 'brócoli', 'muslo_de_pollo', 'chuleta', 'pescado'],
            acciones: ['idle']
        },
        items: {
            clases: ['pickaxe', 'portal'],
            acciones: ['idle']
        }
    }
};
```

**Qué está pasando aquí**:
- `GameSpriteContract` es una constante de JavaScript (no un JSON externo) que vive en el código fuente compartido. Tanto el juego como el Structor la importan.
- Cada categoría tiene **clases** (tipos de entidad) y **acciones** (estados animables). El Structor genera su UI a partir de esta estructura.
- Si un programador añade una nueva clase `'arquero'` a `jugadores.clases`, el Structor la mostrará automáticamente en su interfaz sin necesidad de modificar la herramienta.

### 2. La previsualización comparte el renderer del juego (`structor.ts`)

```typescript
import { Renderer } from '../core/Renderer';
import { IEntidadRPG } from '../types';

class DummyEntity implements IEntidadRPG {
    fila: number;
    columna: number;
    visualFila: number;
    visualColumna: number;
    nombre: string = "Tester";
    fuerza: number = 10;
    agilidad: number = 10;
    inteligencia: number = 10;
    vidaActual: number = 100;
    vidaMaxima: number = 100;
    estaVivo: boolean = true;
    estaCaminando: boolean = false;
    enCombateCon: IEntidadRPG | null = null;
    puntosExperiencia: number = 0;
    inmunidadHasta: number = 0;
    bubbleChat: null = null;
    estadoActual: 'idle' | 'walking' | 'attacking' | 'defending' | 'fallen' = 'idle';
    frameActual: number = 0;
    clase: string = 'guerrero';

    constructor(f: number, c: number) {
        this.fila = f;
        this.columna = c;
        this.visualFila = f;
        this.visualColumna = c;
    }

    recibirDano(cantidad: number) { return cantidad; }
    obtenerIniciativa() { return 0; }
    generarAtaque() { return 0; }
    generarDefensa() { return 0; }

    actualizarEstado() {
        const ahora = Date.now();
        if (ahora - this.ultimaActualizacionFrame > 200) {
            this.ultimaActualizacionFrame = ahora;
            // Consultar el mapeo actual del Structor para saber cuántos frames tiene
            const puntos = this.parent.getMapeoActual()?.jugadores?.[this.clase]?.[this.estadoActual]?.puntos || [];
            const maxFrames = puntos.length || 1;
            this.frameActual = (this.frameActual + 1) % maxFrames;
        }
    }
}
```

**Qué está pasando aquí**:
- `DummyEntity` implementa `IEntidadRPG` pero con cuerpos vacíos para todos los métodos de combate. Solo necesita las propiedades de renderizado (`estadoActual`, `frameActual`, `clase`, posición visual).
- El Structor instancia `Renderer` exactamente igual que el juego, y le pasa `DummyEntity` como entidad a dibujar. El `Renderer` no sabe que es un dummy; solo ve un `IEntidadRPG` válido.
- `actualizarEstado()` consulta el **mapeo en memoria** del Structor (no el JSON guardado en disco) para contar cuántos frames tiene la animación actual. Esto permite ver cambios en tiempo real sin guardar.

### 3. El JSON de mapeo: puente entre artista y motor (`config/sprites.json`)

```json
{
  "recursos": {
    "spritesheet_personajes": "/assets/sprites/characters.png",
    "spritesheet_escenario": "/assets/sprites/tiles.png"
  },
  "mapeo": {
    "jugadores": {
      "guerrero": {
        "idle": {
          "imagen": "spritesheet_personajes",
          "puntos": [
            { "x": 0, "y": 0, "w": 32, "h": 32 },
            { "x": 32, "y": 0, "w": 32, "h": 32 }
          ]
        },
        "walking": {
          "imagen": "spritesheet_personajes",
          "puntos": [
            { "x": 64, "y": 0, "w": 32, "h": 32 },
            { "x": 96, "y": 0, "w": 32, "h": 32 },
            { "x": 128, "y": 0, "w": 32, "h": 32 },
            { "x": 96, "y": 0, "w": 32, "h": 32 }
          ]
        }
      }
    },
    "npcs": {
      "esqueleto": {
        "idle": {
          "imagen": "spritesheet_personajes",
          "puntos": [
            { "x": 0, "y": 64, "w": 32, "h": 32 }
          ]
        }
      }
    }
  }
}
```

**Qué está pasando aquí**:
- El JSON separa **recursos** (URLs de imágenes) de **mapeo** (qué rectángulo corresponde a qué estado).
- Cada acción tiene una lista de "puntos" (`x, y, w, h`) que definen los recortes del spritesheet. El orden de la lista define el orden de los frames de animación.
- El juego y el Structor importan este JSON. El juego lo usa en tiempo de ejecución; el Structor lo lee y modifica.

### 4. Carga automática al iniciar el juego (`SpriteConfig.ts`)

```typescript
export function inicializarSpritesheets(sm: SpriteManager) {
    const c = SpriteConfig;

    const procesarMapping = (mapping: any, prefijo: string) => {
        if (!mapping) return;
        for (const [clase, estados] of Object.entries(mapping)) {
            for (const [estado, infoRaw] of Object.entries(estados as any)) {
                const info = infoRaw as any;
                const keyBase = `${prefijo}_${clase}_${estado}`;
                const imagen = info.imagen;

                if (info.puntos && info.puntos.length > 0) {
                    // Registrar cada frame: player_guerrero_idle_0, _1, _2...
                    info.puntos.forEach((p: any, i: number) => {
                        sm.definirSprite(`${keyBase}_${i}`, imagen, p.x, p.y, p.w, p.h);
                    });

                    // Fallback al frame 0 sin índice
                    sm.definirSprite(keyBase, imagen, info.puntos[0].x, info.puntos[0].y, info.puntos[0].w, info.puntos[0].h);

                    // Alias simplificado para el estado por defecto (idle)
                    if (estado === 'idle' || estado === 'normal') {
                        const keySimple = prefijo ? `${prefijo}_${clase}` : clase;
                        sm.definirSprite(keySimple, imagen, info.puntos[0].x, info.puntos[0].y, info.puntos[0].w, info.puntos[0].h);
                    }
                }
            }
        }
    };

    procesarMapping(c.mapeo.jugadores, 'player');
    procesarMapping(c.mapeo.npcs, 'npc');
    procesarMapping(c.mapeo.escenario_estatico, 'static');
    procesarMapping(c.mapeo.escenario_dinamico, 'dynamic');
    procesarMapping((c.mapeo as any).vfx, 'vfx');
    procesarMapping((c.mapeo as any).food, 'food');
    procesarMapping((c.mapeo as any).items, '');
}
```

**Qué está pasando aquí**:
- `inicializarSpritesheets` se ejecuta al arrancar el juego. Lee el JSON centralizado y registra cada frame en el `SpriteManager`.
- Genera automáticamente tres claves por cada entrada del JSON:
  1. `player_guerrero_idle_0`, `_1`... (frames individuales)
  2. `player_guerrero_idle` (fallback al frame 0)
  3. `player_guerrero` (alias para idle, usado cuando no hay estado específico)
- Estas convenciones de nomenclatura son las que usa el `Renderer` para buscar sprites (ver píldora LEARN "State Machine Ligero para Animación").

### 5. Configuración de build multi-entry (`vite.config.ts`)

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: './index.html',        // Juego principal
        structor: './structor.html' // Herramienta de mapeo
      }
    }
  }
});
```

**Qué está pasando aquí**:
- Vite compila dos aplicaciones independientes desde el mismo repo.
- `index.html` apunta a `/src/main.ts` (el juego).
- `structor.html` apunta a `/src/tools/structor.ts` (la herramienta).
- Ambas comparten módulos de `src/core/`, `src/types/`, etc. Sin duplicación de código.

---

### Tabla: quién usa qué parte del sistema

| Componente | Lee `GameSpriteContract` | Lee/Escribe `sprites.json` | Usa `Renderer` | Genera claves de sprite |
|------------|------------------------|---------------------------|---------------|------------------------|
| **Juego** | Sí (para validar en runtime) | Lee (carga al iniciar) | Sí (render del juego) | No (usa claves del JSON) |
| **Structor** | Sí (para generar UI) | Lee y escribe (edita) | Sí (previsualización) | No (usa claves del JSON) |
| **SpriteManager** | No | No (recibe datos procesados) | No (es usado por Renderer) | Sí (`definirSprite`, `obtenerContadorFrames`) |
| **Renderer** | No | No | No (él es el renderizador) | No (consulta SpriteManager) |

## Consejo pro

### 1. Versiona el schema del contrato

Si cambias `GameSpriteContract` (por ejemplo, añades una nueva acción `"casting"`), considera añadir una versión:

```typescript
export const GameSpriteContract = {
    version: '1.2.0',
    categorias: { /* ... */ }
};
```

El Structor puede comparar la versión del contrato con la versión del JSON guardado y advertir si el artista está usando un mapeo obsoleto.

### 2. Valida el JSON en CI

Añade un script de validación que verifique que `sprites.json` cumple con `GameSpriteContract` antes de permitir merge:

```typescript
// validate-sprites.ts
import { SpriteConfig } from './src/core/SpriteConfig';
import { GameSpriteContract } from './src/core/SpriteConfig';

function validate() {
    for (const [cat, mapping] of Object.entries(SpriteConfig.mapeo)) {
        const contractCat = (GameSpriteContract.categorias as any)[cat];
        if (!contractCat) throw new Error(`Categoría no contratada: ${cat}`);
        // ... validar clases y acciones ...
    }
}
```

### 3. Exporta el mapeo como TypeScript para type safety

En lugar de importar `sprites.json` como `any`, genera un archivo `.d.ts` automáticamente a partir del JSON:

```typescript
// types/sprites.d.ts (generado)
declare module '../config/sprites.json' {
    const value: {
        recursos: Record<string, string>;
        mapeo: {
            jugadores: {
                guerrero: {
                    idle: { imagen: string; puntos: { x: number; y: number; w: number; h: number }[] };
                    // ...
                }
            }
        }
    };
    export default value;
}
```

Esto permite que TypeScript autocomplete y valide las claves de sprite en tiempo de compilación.

### 4. No dupliques la lógica de animación

El Structor no implementa su propio sistema de animación. Reutiliza `DummyEntity.actualizarEstado()`, que es casi idéntico a `EntidadRPG.actualizarEstado()`. Si cambias el ritmo de animación en el juego (de 200 ms a 150 ms), deberías poder cambiarlo en un solo lugar. Considera extraer la lógica de avance de frames a una función compartida.

### 5. Usa el Structor como "prueba de humo" de assets

Antes de mergear un PR con nuevos sprites, exige que el artista demuestre que el mapeo funciona en el Structor. Una captura de pantalla del Structor mostrando la animación `walking` sin errores es evidencia suficiente de que el JSON está bien formado y las coordenadas son correctas.

> **Regla de oro**: la herramienta de desarrollo debe ser indistinguible del juego en lo que respecta a renderizado. Si se ve bien en el Structor, se verá bien en producción. El contrato es la ley que une ambos mundos.
