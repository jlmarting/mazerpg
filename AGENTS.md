# AGENTS.md - Maze RPG Developer Guide

## Project Overview

Browser-based maze RPG with multiplayer support. Includes a dev tool (`structor`) for sprite mapping.

## Technology Stack

- **Runtime**: Vanilla TypeScript (ES Modules)
- **Build**: Vite (multi-entry: `index.html` + `structor.html`)
- **Backend**: Firebase (Firestore) + external HTTP signaling server on port `8080`
- **Testing**: None configured

## Commands

```bash
pnpm dev           # Vite dev server
pnpm build         # tsc + vite build (type errors fail the build)
pnpm preview       # Preview production build
pnpm tsc --noEmit  # Type check only
```

## Repo-specific Gotchas

### Firebase Config Injection
`index.html` contains placeholder strings like `__FIREBASE_API_KEY__`. The CI workflow (`firebase-hosting-merge.yml`) injects real secrets via `sed` during deploy. For local dev, `window.FIREBASE_CONFIG` must be set manually or Firebase will show "not configured".

### External Signaling Server
HTTP multiplayer mode expects a signaling server at `http://localhost:8080`. The server code is **not in this repo**; it is an external dependency.

### TypeScript Strictness
`tsconfig.json` enables:
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `strict: true`

This means `pnpm build` fails on unused variables or parameters. Do not ignore these errors.

## Code Style

### File Naming
- **Classes**: PascalCase filename matching class name (e.g., `Renderer.ts` → `class Renderer`).
- **Other files**: kebab-case (e.g., `sprite-manager.ts`).
- **One class per file** (filename matches class name).

### Imports
- **Omit extensions**: `import { X } from '../world/Celda'` (Vite `moduleResolution: bundler` + `allowImportingTsExtensions`).
- Avoid bare imports unless side-effect-only.
- Group: external (firebase), then internal modules.

### TypeScript Conventions
- Always use explicit types for function parameters and return types.
- Use `interface` for public APIs, `type` for unions/aliases.
- Use `| null` instead of optional (`?`) for nullable fields that can be null.
- Non-null assertion (`!`) allowed only when guaranteed by logic.
- Avoid `any`; use explicit types or `Record<string, unknown>`.

### Naming Conventions
- **Classes / Interfaces**: PascalCase (e.g., `NetworkManager`, `IGame`).
- **Functions / methods**: camelCase (e.g., `crearPartidaFirestore`).
- **Variables / fields**: camelCase, descriptive (e.g., `networkHttp`, `modoMultijugador`).
- **Constants**: `UPPER_SNAKE_CASE` for true constants, camelCase for config objects.

### Error Handling
- Use try/catch for async operations with meaningful error messages.
- Log errors before throwing: `console.error('Failed to X:', error); throw new Error(...);`.
- Never silently swallow errors.
- Handle null/undefined at boundary: check before accessing, return early.

### UI/DOM Patterns
- Use non-null assertion only for elements guaranteed to exist: `document.getElementById('canvas')!`.
- Add null checks for optional elements.
- Cache DOM references in constructors or lazy-load with getters.

### State Management
- `Game` class is the central state container (singleton via `window.game`).
- Network managers (`NetworkManager`, `NetworkManagerHttp`) handle multiplayer state.
- Keep UI state in sync with game state.

### Performance
- Avoid creating new objects in hot paths (game loop, render loop).
- Use `Map` for O(1) lookups instead of array find.
- Cache computed values that don't change frequently.

## Architecture / Project Structure

```
src/
├── main.ts              # Game class (~2800 lines)
├── core/                # Renderer, SpriteManager, SpriteConfig
├── network/             # NetworkManager, NetworkManagerHttp, SignalingClient, FirebaseManager
├── entities/            # Jugador, JugadorRemoto, EntidadRPG, EnemigoNPC
├── world/               # Celda, generation, serialization, constants
├── ui/                  # UIManager, ChatModels
├── utils/               # pathfinding, session
├── tools/structor.ts    # Sprite mapping dev tool (standalone, not part of game loop)
└── types/index.ts       # Shared interfaces (IGame, IEntidadRPG, GameConfig, etc.)
```

### Documentation Structure

```
docs/
├── README.md                    # Documentation index
├── project-context.md           # Project context and architecture overview
├── proposals/                   # Technical proposals and RFCs
│   ├── README.md               # Proposal template and guidelines
│   └── 2025-06-07-*.md         # Individual proposals
├── learn/                       # LEARN pills (educational content)
│   ├── README.md               # LEARN index
│   ├── webrtc/                 # WebRTC and multiplayer
│   ├── architecture/           # Game architecture patterns
│   ├── rendering/              # Rendering and sprites
│   ├── world/                  # World generation
│   ├── entities/               # Entity patterns
│   └── tooling/                # Build and tooling
├── analisis-refactor.md        # Historical refactoring analysis
├── analisis-sprites.md         # Sprite migration analysis
└── analisis-sprites-avanzado.md # Advanced sprite architecture
```

### Multi-page Build
Vite builds two entry points:
- `index.html` → main game (`/src/main.ts`)
- `structor.html` → sprite mapping tool (`/src/tools/structor.ts`)

## Common Patterns

### Multiplayer Modes
- `modoMultijugador: 'firebase' | 'http' | 'manual'`
- **Firebase**: uses Firestore for signaling, then WebRTC P2P.
- **HTTP**: uses external signaling server on `:8080`, then WebRTC P2P.
- Both modes support Host/Guest architecture. Host is source of truth.

### Signaling Flow (HTTP Mode)
1. Host creates game via HTTP server → receives party ID.
2. Guest lists games → joins by ID.
3. WebRTC connection established for game data sync.

### Game Loop
- Tick-based via `requestAnimationFrame`.
- `Game` class manages entity updates, rendering, and network sync.

### Interval Management
Always clean up intervals when switching modes or ending games:

```typescript
this.detenerIntervalosHttp();  // or detenerIntervalosFirebase()
this.configurarIntervalosHostHttp();
```

## Git Workflow

- Make small, focused commits.
- Commit message format: `[feature|fix|refactor|chore] short description`.
- Run `pnpm build` before committing to ensure type safety.
