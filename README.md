# MazeRPG

Un **RPG de laberinto multijugador** en tiempo real que se ejecuta directamente en el navegador. Explora mazas generados proceduralmente, enfréntate a enemigos, sube de nivel y aventúrate solo o con amigos vía conexión P2P.

![Demo](demo.png)

## Características

- **Laberintos procedurales**: Generación automática de mazas usando BSP con garantía de conectividad.
- **Multijugador P2P**: Sincronización en tiempo real mediante WebRTC (sin servidor de juego central).
- **3 modos de conexión**:
  - **Firebase**: Señalización por Firestore + P2P vía WebRTC.
  - **Servidor local HTTP**: Señalización por servidor externo en `:8080` + WebRTC.
  - **Manual**: Intercambio de ofertas/respuestas (incluye soporte de QR) para redes restrictivas.
- **Creación de personajes**: Elige nombre, color y clase (Guerrero, Explorador o Mago) con atributos aleatorios.
- **Sistema de combate**: Acciones con cooldown como Bola de Fuego, Golpe de Giro, Congelar, Arco, etc.
- **Dificultad escalable**: Fácil, Normal, Difícil y Locura.
- **Herramienta de desarrollo `structor`**: Editor visual para mapear spritesheets (segunda entrada de Vite).
- **Documentación técnica**: `docs/` contiene píldoras formativas LEARN, propuestas y análisis del proyecto.

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Lenguaje | TypeScript (ES Modules) |
| Bundler / Dev server | Vite |
| Renderizado | Canvas 2D |
| Base de datos (signaling) | Firebase Firestore |
| Comunicación P2P | WebRTC (`RTCPeerConnection` + `RTCDataChannel`) |
| Gestor de paquetes | pnpm |

## Estructura del proyecto

```
src/
├── main.ts                 # Punto de entrada del juego y clase Game
├── core/                   # Motor de renderizado y sprites
│   ├── Renderer.ts
│   ├── SpriteManager.ts
│   └── SpriteConfig.ts
├── entities/               # Jugador, enemigos y entidades del mundo
│   ├── Jugador.ts
│   ├── JugadorRemoto.ts
│   ├── EnemigoNPC.ts
│   └── EntidadRPG.ts
├── network/                # Señalización y sincronización P2P
│   ├── NetworkManager.ts         # WebRTC vía Firebase
│   ├── NetworkManagerHttp.ts     # WebRTC vía servidor HTTP
│   ├── SignalingClient.ts        # Cliente HTTP de señalización
│   └── FirebaseManager.ts        # Wrapper de Firestore
├── world/                  # Laberinto: celdas, generación y serialización
│   ├── Celda.ts
│   ├── generation.ts
│   ├── serialization.ts
│   └── constants.ts
├── ui/                     # Interfaz de usuario (HUD, chat, logs)
│   ├── UIManager.ts
│   └── ChatModels.ts
├── utils/                  # Auxiliares (pathfinding, sesión)
│   ├── pathfinding.ts
│   └── session.ts
├── types/index.ts          # Interfaces compartidas (IGame, IEntidadRPG, etc.)
└── tools/structor.ts       # Herramienta de mapeo de sprites (entry point aparte)
```

## Puesta en marcha

### 1. Requisitos previos

- [Node.js](https://nodejs.org/) v18 o superior
- [pnpm](https://pnpm.io/) (gestor de paquetes)

### 2. Clonar e instalar dependencias

```bash
git clone <url-del-repo>
cd mazerpg
pnpm install
```

### 3. Arrancar el servidor de desarrollo

```bash
pnpm dev
```

- Juego principal: http://localhost:5173
- Herramienta de sprites (structor): http://localhost:5173/structor.html

### 4. Configurar Firebase (solo si usas modo multijugador Firebase)

Los placeholders en `index.html` (`__FIREBASE_API_KEY__`, etc.) deben reemplazarse con credenciales reales de un proyecto Firebase. Edita el bloque `window.FIREBASE_CONFIG` en `index.html`:

```js
window.FIREBASE_CONFIG = {
    apiKey: "TU_API_KEY",
    authDomain: "TU_AUTH_DOMAIN",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_STORAGE_BUCKET",
    messagingSenderId: "TU_SENDER_ID",
    appId: "TU_APP_ID"
};
```

Si no necesitas multijugador Firebase, el juego funciona en modo un jugador sin esta configuración.

### 5. Servidor de signaling (solo si usas modo multijugador HTTP)

El modo HTTP requiere un servidor de signaling externo escuchando en `http://localhost:8080`. El código de este servidor **no está incluido** en el repo. Si el servidor corre en otra URL, defínela antes de abrir el juego:

```js
window.SIGNALING_SERVER_URL = 'http://localhost:8080';
```

### 6. Verificar tipos y construir para producción

```bash
pnpm tsc --noEmit   # Solo verificación de tipos (sin emitir archivos)
pnpm build           # tsc + vite build (errores de tipo fallan el build)
pnpm preview         # Previsualizar el build de producción en local
```

El build genera dos páginas en `dist/`:
- `dist/index.html` → Juego principal
- `dist/structor.html` → Herramienta de mapeo de sprites

## Modos de juego

| Modo | Descripción |
|------|-------------|
| **Un jugador** | Explora el laberinto solo contra enemigos NPC. |
| **Crear partida** | Eres el host. Generas una sala y admites invitados. El host es la fuente de autoridad (*host-authoritative*). |
| **Unirse a partida** | Buscas salas activas y te unes como invitado. |
| **Conexión manual** | Intercambias ofertas/respuestas WebRTC manualmente (útil si los servidores de signaling no están disponibles). |

## Arquitectura de red

```
┌─────────────┐      signaling (Firestore / HTTP :8080)      ┌─────────────┐
│   Host      │ ◄────────────────────────────────────────────► │   Guest     │
│ (WebRTC)    │                                               │ (WebRTC)    │
└──────┬──────┘                                               └──────┬──────┘
       │                                                             │
       └───────────────────  RTCDataChannel (P2P)  ───────────────────┘
```

1. El **signaling** (intercambio de ofertas, respuestas y candidatos ICE) se realiza a través de **Firebase Firestore** o un **servidor HTTP externo**.
2. Una vez establecida la conexión WebRTC, todo el estado del juego (posiciones, ataques, eventos) fluye directamente entre peers mediante **RTCDataChannel**.
3. El **host** mantiene la autoridad: sincroniza el mapa, los enemigos y valida el estado de la partida.

## Scripts disponibles

| Script | Descripción |
|--------|-------------|
| `pnpm dev` | Servidor de desarrollo Vite |
| `pnpm build` | Compila TypeScript y genera el bundle de producción |
| `pnpm preview` | Previsualiza el build de producción |
| `pnpm tsc --noEmit` | Verificación de tipos sin emitir archivos |

## Convenciones del proyecto

- **TypeScript stricto**: `strict`, `noUnusedLocals` y `noUnusedParameters` activados. El build falla si hay variables o parámetros sin usar.
- **Nombres de archivo**: `PascalCase` para clases (`Renderer.ts`), `kebab-case` para el resto.
- **Importaciones sin extensión**: `import { X } from '../world/Celda'` (gracias a `moduleResolution: bundler`).
- **Una clase por archivo**: el nombre del archivo coincide exactamente con el de la clase.

## Documentación

Toda la documentación del proyecto está centralizada en `docs/`:

| Sección | Descripción |
|---------|-------------|
| [docs/](docs/) | Índice general de documentación |
| [docs/proposals/](docs/proposals/) | Propuestas técnicas y mejoras |
| [docs/learn/](docs/learn/) | Píldoras formativas sobre tecnologías del proyecto |
| [docs/project-context.md](docs/project-context.md) | Contexto funcional y técnico |

### Píldoras formativas (LEARN)

| Área | Temas |
|------|-------|
| `webrtc/` | Introducción a WebRTC, signaling híbrido, buffering de candidatos ICE, host-authority con snapshots |
| `world/` | Generación procedural con BSP, serialización compacta con bitmasking, garantía de conectividad |
| `rendering/` | Sprite mapping tool, cadena de fallback visual, *fog of war* con decaimiento |
| `entities/` | State machine de animación, herencia vs interfaz (`IEntidadRPG`), callback pattern de daño |
| `architecture/` | Separación de render y lógica, singleton state container, command queue multiplayer |
| `tooling/` | Multi-entry build con Vite, TypeScript strict como gate de calidad, inyección de configuración build/runtime |

## Verificación

La carpeta `verification/` contiene scripts de verificación paraSprites y comparaciones:

```bash
# Ejecutar verificaciones (requiere Python)
python verification/verify_comparison.py
python verification/verify_refined_structor.py
```

## Licencia

Este proyecto es de código abierto para fines educativos y de portfolio.
