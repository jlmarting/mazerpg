# LEARN: Multi-Entry Build con Vite

## Concepto

En un proyecto típico de Vite, hay un único punto de entrada (`index.html`) que se compila a un bundle. Pero a veces un mismo repositorio contiene **múltiples aplicaciones independientes**. En nuestro caso: el **juego principal** (`index.html` → `src/main.ts`) y la **herramienta de desarrollo Structor** (`structor.html` → `src/tools/structor.ts`).

Vite permite configurar múltiples puntos de entrada mediante `rollupOptions.input`, generando bundles separados que comparten módulos comunes (como `Renderer`, `SpriteManager`, tipos TypeScript) pero producen HTML independientes.

## Por qué es importante

- **Sin duplicación de código**: `Renderer.ts`, `SpriteManager.ts` y `SpriteConfig.ts` se importan tanto en el juego como en el Structor, pero solo se incluyen una vez en el bundle compartido gracias al **code splitting** de Rollup.
- **Consistencia de tipos**: ambas aplicaciones usan la misma interfaz `IEntidadRPG` y el mismo `GameSpriteContract`. Un cambio en el contrato afecta a ambas inmediatamente.
- **Build único**: un solo comando `pnpm build` compila todo. No hay que mantener dos Vite configs ni dos procesos de CI.
- **Despliegue separable**: puedes desplegar solo el juego (`dist/main/`) o solo el Structor (`dist/structor/`), o ambos en subrutas distintas del mismo dominio.

## Explicación sencilla

Imagina que tienes un **restaurante** que por la mañana funciona como cafetería y por la noche como restaurante de lujo:

- **Dos experiencias** distintas: desayunos rápidos vs. cenas de varios platos.
- **Una sola cocina**: el mismo chef, los mismo hornos, la misma nevera. No necesitas dos edificios.
- **Menús separados**: cada cliente recibe su carta apropiada, pero los ingredientes vienen del mismo almacén.

En nuestro caso, Vite es la cocina, `rollupOptions.input` define los dos menús, y los módulos compartidos (`src/core/*`) son los ingredientes comunes.

## Ejemplo práctico

### 1. Configuración de Vite multi-entry (`vite.config.ts`)

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',                    // Raíz del proyecto (donde están los HTML)
  build: {
    outDir: 'dist',             // Todo se compila a dist/
    rollupOptions: {
      input: {
        main: './index.html',        // Juego principal
        structor: './structor.html'  // Herramienta de mapeo de sprites
      }
    }
  }
});
```

**Qué está pasando aquí**:
- `input` es un objeto donde cada clave (`main`, `structor`) genera un **chunk** independiente con su propio HTML.
- Vite procesa cada HTML, encuentra su `<script type="module">`, resuelve las importaciones de TypeScript, y genera el bundle.
- Rollup (el bundler interno de Vite) automáticamente **deduplica** módulos compartidos. Si tanto `main.ts` como `structor.ts` importan `Renderer.ts`, ese módulo va a un chunk compartido y se carga una sola vez.

### 2. Los dos archivos HTML de entrada

```html
<!-- index.html — Juego principal -->
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>MazeRPG</title>
    <script>
        window.FIREBASE_CONFIG = {
            apiKey: "__FIREBASE_API_KEY__",
            // ...
        };
    </script>
</head>
<body>
    <canvas id="mazeCanvas"></canvas>
    <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

```html
<!-- structor.html — Herramienta de desarrollo -->
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Structor - Sprite Mapper</title>
</head>
<body>
    <div id="app">
        <canvas id="gridCanvas"></canvas>
        <canvas id="previewCanvas"></canvas>
        <!-- ... -->
    </div>
    <script type="module" src="/src/tools/structor.ts"></script>
</body>
</html>
```

**Qué está pasando aquí**:
- Ambos HTML están en la raíz del proyecto. Vite los procesa independientemente.
- `structor.html` no incluye el `FIREBASE_CONFIG` ni ningún elemento de UI del juego. Es una aplicación completamente separada.
- Al compilar, Vite genera `dist/index.html` y `dist/structor.html`, cada uno con sus assets (JS, CSS) correctamente referenciados.

### 3. Compartir módulos entre aplicaciones

```typescript
// src/main.ts — El juego importa Renderer
import { Game } from './main';
import { Renderer } from './core/Renderer';

const game = new Game();
```

```typescript
// src/tools/structor.ts — El Structor también importa Renderer
import { Renderer } from '../core/Renderer';
import { GameSpriteContract } from '../core/SpriteConfig';
import { IEntidadRPG } from '../types';

class Structor {
    private renderer: Renderer;
    // ...
}
```

**Qué está pasando aquí**:
- `src/core/Renderer.ts` se importa desde dos puntos distintos del árbol (`src/main.ts` y `src/tools/structor.ts`).
- Vite/Rollup detecta que es el **mismo archivo** y lo incluye una sola vez en el output. Si el navegador carga primero el juego y luego el Structor (o viceversa), el módulo compartido ya está cacheado.
- Esto es posible gracias a `moduleResolution: "bundler"` en `tsconfig.json` (ver píldora LEARN 51).

### 4. Estructura de salida tras `pnpm build`

```
dist/
├── index.html          # Juego principal
├── structor.html       # Herramienta Structor
├── assets/
│   ├── main-[hash].js      # Bundle del juego
│   ├── structor-[hash].js  # Bundle del Structor
│   ├── shared-[hash].js    # Módulos compartidos (Renderer, etc.)
│   ├── index-[hash].css    # Estilos del juego
│   └── structor-[hash].css # Estilos del Structor
└── sprites/
    └── ...                 # Assets estáticos
```

**Qué está pasando aquí**:
- Los `[hash]` en los nombres de archivo permiten **cache busting**. Cuando cambia el código, cambia el hash, y los navegadores descargan la nueva versión.
- El chunk `shared` contiene todo lo que ambas apps importan. Si solo cambia `structor.ts`, solo se recompila `structor-[hash].js`; `shared-[hash].js` mantiene su hash anterior.

### 5. Desplegar solo una aplicación

```bash
# Desplegar solo el juego (ej. en Firebase Hosting)
firebase deploy --only hosting --public dist

# O copiar solo el Structor a un servidor de staging
cp dist/structor.html staging/
cp -r dist/assets staging/
```

**Qué está pasando aquí**:
- Puedes desplegar ambas apps juntas (mismo dominio, diferentes rutas) o por separado.
- El Structor no necesita backend de Firebase ni WebRTC, por lo que puede vivir en un hosting estático más simple.

---

### Tabla comparativa: single-entry vs multi-entry

| Característica | Single-entry | Multi-entry |
|----------------|-------------|-------------|
| HTML outputs | 1 | N (uno por entrada) |
| Módulos compartidos | Todos en un bundle | Code splitting automático |
| Build time | Menor (menos análisis) | Similar (Rollup es eficiente) |
| Cache independiente | No | Sí (cada entry tiene su hash) |
| Adecuado para | Apps simples, SPAs | Monorepos, juego + tools |

## Consejo pro

### 1. Usa `shared` manual para forzar chunks comunes

Si Vite no deduplica todo lo que esperas, puedes forzarlo:

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: './index.html', structor: './structor.html' },
      output: {
        manualChunks: {
          'sprite-core': ['./src/core/Renderer.ts', './src/core/SpriteManager.ts', './src/core/SpriteConfig.ts']
        }
      }
    }
  }
});
```

Esto garantiza que esos tres módulos siempre vayan juntos en un chunk separado, independientemente de quién los importe.

### 2. Diferencia de configs por entrada con `define`

Si necesitas variables de entorno distintas para cada app:

```typescript
export default defineConfig(({ mode }) => ({
  define: {
    __APP_TYPE__: JSON.stringify(mode === 'structor' ? 'tool' : 'game')
  }
}));
```

O mejor aún, usa archivos `.env` separados: `.env.game`, `.env.structor`.

### 3. Añade un tercer entry para documentación

Si en el futuro quieres una página de "cómo jugar" o un manual de sprite mapping, solo necesitas:

```typescript
input: {
  main: './index.html',
  structor: './structor.html',
  docs: './docs.html'
}
```

Sin tocar la configuración de build existente.

### 4. Preview con entrada específica

```bash
# Preview del juego
pnpm preview

# Preview del Structor (abre directamente structor.html)
# Necesitas ajustar la URL manualmente o usar un plugin
```

Vite's dev server sirve ambos archivos. Puedes acceder a `http://localhost:5173/structor.html` directamente.

### 5. Cuidado con CSS global

Si ambas apps importan CSS, Vite los incluirá en el HTML correspondiente. Pero si usas `* { margin: 0 }` en el CSS del juego, eso afectará al Structor si comparten el mismo documento (no lo hacen, son HTML separados). Aun así, usa **CSS modules** o **scoped styles** para evitar colisiones.

> **Regla de oro**: si tienes más de una "cosa" que se compila desde tu repo, no crees múltiples configs ni múltiples repos. Vite soporta multi-entry nativamente; aprovéchalo.
