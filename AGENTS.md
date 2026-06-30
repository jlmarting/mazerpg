# AGENTS.md - Guía de desarrollo Maze RPG

## Resumen del proyecto

RPG de laberinto en navegador con soporte multijugador. Incluye una herramienta de desarrollo (`structor`) para mapeo de sprites.

## Stack tecnológico

- **Runtime**: TypeScript vanilla (ES Modules), CSS mediante import de Vite (`src/style.css`)
- **Build**: Vite (multi-entry: `index.html` + `structor.html`), deploy con Firebase Hosting
- **Backend**: Firebase (Firestore) + servidor externo HTTP de signaling en puerto `8080`
- **Testing**: No configurado

## Comandos

```bash
pnpm dev           # Servidor de desarrollo Vite
pnpm build         # tsc + vite build (errores de tipo fallan el build)
pnpm preview       # Previsualizar build de producción
pnpm tsc --noEmit  # Solo verificación de tipos
```

## Peligros específicos del repo

### Inyección de configuración de Firebase
`index.html` contiene strings placeholder como `__FIREBASE_API_KEY__`. Los workflows de CI (`.github/workflows/firebase-hosting-*.yml`) inyectan los secretos reales con `sed` durante el deploy. Tanto el workflow de merge a main como el de PR ejecutan `pnpm build`, por lo que los errores de tipo bloquean CI. Para desarrollo local, reemplaza los placeholders con credenciales reales en `index.html` o configura `window.FIREBASE_CONFIG` desde la consola del navegador.

### Servidor externo de signaling
El modo multijugador HTTP espera un servidor de signaling en la URL almacenada en `window.SIGNALING_SERVER_URL` (por defecto: `http://localhost:8080`). El código del servidor **no está en este repo**; es una dependencia externa. Define `window.SIGNALING_SERVER_URL` globalmente antes de instanciar `Game` para sobrescribir el valor por defecto.

### Rigor de TypeScript
`tsconfig.json` activa `strict`, `noUnusedLocals`, `noUnusedParameters` y `noFallthroughCasesInSwitch`. `pnpm build` ejecuta `tsc && vite build` — los errores de tipo fallan el build. No ignores ni suprimas estos errores.

## Estilo de código

### Nombrado de archivos
- **Clases**: PascalCase, el nombre del archivo coincide con la clase (ej. `Renderer.ts` → `class Renderer`).
- **Otros archivos**: kebab-case (ej. `sprite-manager.ts`).
- **Una clase por archivo** (el nombre del archivo coincide con la clase).

### Imports
- **Sin extensión**: `import { X } from '../world/Celda'` (Vite `moduleResolution: bundler` + `allowImportingTsExtensions`).
- Import de CSS como efecto lateral: `import './style.css'` en `main.ts` es correcto.
- Agrupar: externos (firebase), luego módulos internos.

### Convenciones de TypeScript
- Usar tipos explícitos en parámetros y retornos de funciones.
- Usar `interface` para APIs públicas, `type` para uniones/alias.
- Usar `| null` en lugar de opcional (`?`) para campos que pueden ser null.
- Non-null assertion (`!`) solo cuando esté garantizado por lógica.
- Evitar `any`; usar tipos explícitos o `Record<string, unknown>`.

### Convenciones de nombres
- **Clases / Interfaces**: PascalCase (ej. `NetworkManager`, `IGame`).
- **Funciones / métodos**: camelCase (ej. `crearPartidaFirestore`).
- **Variables / campos**: camelCase, descriptivo (ej. `networkHttp`, `modoMultijugador`).
- **Constantes**: `UPPER_SNAKE_CASE` para verdaderas constantes, camelCase para objetos de configuración.

### Manejo de errores
- Usar try/catch en operaciones asíncronas con mensajes de error significativos.
- Registrar errores antes de lanzar: `console.error('Fallo al X:', error); throw new Error(...);`.
- Nunca tragar errores silenciosamente.
- Verificar null/undefined en los límites: comprobar antes de acceder, retornar temprano.

### Patrones UI/DOM
- Usar non-null assertion solo para elementos garantizados: `document.getElementById('canvas')!`.
- Añadir comprobaciones de null para elementos opcionales.
- Cachear referencias del DOM en el constructor o con getters lazy.

### Gestión de estado
- La clase `Game` es el contenedor central de estado, instanciada al final de `src/main.ts`.
- Los gestores de red (`NetworkManager`, `NetworkManagerHttp`) manejan el estado multijugador.
- Mantener el estado de UI sincronizado con el estado del juego.

### Rendimiento
- Evitar crear objetos nuevos en rutas calientes (game loop, render loop).
- Usar `Map` para búsquedas O(1) en lugar de array find.
- Cachear valores calculados que no cambian con frecuencia.

## Arquitectura / Estructura del proyecto

```
src/
├── main.ts              # Clase Game (~2900 líneas)
├── style.css            # Todos los estilos del juego (importado como efecto lateral en main.ts)
├── core/                # Renderer, SpriteManager, SpriteConfig
├── network/             # NetworkManager, NetworkManagerHttp, SignalingClient, FirebaseManager
├── entities/            # Jugador, JugadorRemoto, EntidadRPG, EnemigoNPC
├── world/               # Celda, generation, serialization, constants
├── ui/                  # UIManager, ChatModels
├── utils/               # pathfinding, session
├── config/              # sprites.json (configuración de mapeo de sprites para la herramienta structor)
├── tools/structor.ts    # Herramienta de mapeo de sprites (entry point independiente)
└── types/index.ts       # Interfaces compartidas (IGame, IEntidadRPG, GameConfig, etc.)
```

### Estructura de documentación

```
docs/
├── README.md                    # Índice de documentación
├── project-context.md           # Contexto y visión general del proyecto
├── proposals/                   # Propuestas técnicas y RFCs
│   ├── README.md               # Plantilla de propuestas
│   └── 2025-06-07-*.md         # Propuestas individuales
├── learn/                       # Píldoras formativas LEARN
│   ├── README.md               # Índice LEARN
│   ├── webrtc/                 # WebRTC y multijugador
│   ├── architecture/           # Patrones de arquitectura del juego
│   ├── rendering/              # Renderizado y sprites
│   ├── world/                  # Generación del mundo
│   ├── entities/               # Patrones de entidades
│   └── tooling/                # Build y herramientas
├── analisis-refactor.md        # Análisis histórico de refactorización
├── analisis-sprites.md         # Análisis de migración de sprites
└── analisis-sprites-avanzado.md # Arquitectura avanzada de sprites
```

### Build multi-página
Vite genera dos puntos de entrada:
- `index.html` → juego principal (`/src/main.ts`)
- `structor.html` → herramienta de mapeo de sprites (`/src/tools/structor.ts`)

## Patrones comunes

### Modos multijugador
- `modoMultijugador: 'firebase' | 'http' | 'manual'`
- **Firebase**: usa Firestore para signaling, luego WebRTC P2P.
- **HTTP**: usa servidor externo de signaling en `:8080`, luego WebRTC P2P.
- Ambos modos usan arquitectura Host/Invitado. El Host es la fuente de verdad.

### Flujo de signaling (modo HTTP)
1. El Host crea partida vía servidor HTTP → recibe un ID de sala.
2. El Invitado lista partidas → se une por ID.
3. Se establece la conexión WebRTC para sincronización de datos del juego.

### Game Loop
- Basado en ticks mediante `requestAnimationFrame`.
- La clase `Game` gestiona actualizaciones de entidades, renderizado y sincronización de red.

### Gestión de intervalos
Limpiar siempre los intervalos al cambiar de modo o terminar partidas:

```typescript
this.detenerIntervalosHttp();  // o detenerIntervalosFirebase()
this.configurarIntervalosHostHttp();
```

## Flujo de trabajo Git

- Commits pequeños y enfocados.
- Formato de mensaje: `[feature|fix|refactor|chore] descripción breve`.
- Ejecutar `pnpm build` antes de commitear para asegurar seguridad de tipos.
