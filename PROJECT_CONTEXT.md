# Mazerpg - Contexto Funcional y Técnico

## Resumen del Proyecto
Mazerpg es un juego de maze (laberinto) multijugador en tiempo real construido con:
- **TypeScript** (compilado a JavaScript)
- **Vite** como bundler y servidor de desarrollo
- **Firebase Firestore** solo para señalización y metadatos de partidas
- **WebRTC (RTCPeerConnection + RTCDataChannel)** para comunicación P2P entre jugadores
- **Canvas 2D** para renderizado

## Estructura de Carpetas (`src/`)
```
src/
├── assets/          # Imágenes, sprites, sonidos (cargados dinámicamente)
├── config/          # Constantes y configuraciones de juego (tamaño de celda, colores, etc.)
├── core/            # Motor de renderizado y gestión de sprites
│   ├── Renderer.ts  # Dibujo en canvas, zoom, capas
│   ├── SpriteManager.ts # Carga y dibujo de spritesheets
│   └── SpriteConfig.ts # Inicialización de spritesheets
├── entities/        # Clases que representan objetos del juego
│   ├── Jugador.ts          # Protagonista local
│   ├── JugadorRemoto.ts    # Representación ligera de jugador remoto (posible extensión)
│   └── EnemigoNPC.ts       # Enemigos controlados por IA
├── network/         # Gestión de señalización y conexión P2P
│   ├── FirebaseManager.ts  # Wrapper de Firestore (crear partida, heartbeat, señalización)
│   └── NetworkManager.ts   # WebRTC, manejo de DataChannel, lógica de host/guest
├── tools/           # Utilidades de depuración y desarrollo (logger, debug overlay)
├── types/           # Interfaces y tipos TypeScript compartidos
│   └── index.ts     # Exporta IGame, GameConfig, IEntidadRPG, etc.
├── ui/              # Gestión de la interfaz de usuario (HUD, menús, logs)
│   └── UIManager.ts # Dibuja HUD, maneja input, muestra logs de conexión
├── utils/           # Funciones auxiliares (generación de IDs, matemáticas, sesión)
│   └── session.ts   # generateSessionName, generateBubbleName
└── world/           # Lógica del mundo: generación de laberintos, definición de celdas, serialización
    ├── Celda.ts     # Clase e interfaz de una celda del laberinto
    ├── constants.ts # Número de filas, columnas, tamaño de celda, radios, etc.
    ├── generation.ts # Algoritmos BSP y eliminación de muros
    └── serialization.ts # Funciones para serializar/deserializar el mapa (para guardar/cargar)
```

## Flujo Principal (`src/main.ts`)
1. **Inicialización**
   - Importa estilos, crea instancia de `Game`.
   - Instancia subsistemas: `Renderer`, `UIManager`, `FirebaseManager`, `NetworkManager`.
   - Carga configuración (`GameConfig`) y constantes del mundo.
2. **Bucle de Juego**
   - En `Game.update()` se:
     - Procesa input del jugador local.
     - Actualiza estado del protagonista, enemigos, lógica de visión (niebla).
     - Envía actualizaciones al resto de jugadores vía `network.enviarMensaje`.
   - En `Game.render()` se:
     - Limpia canvas.
     - Aplica zoom y recorte.
     - Dibuja laberinto (celdas, alimentos, burbujas, trampas, portales).
     - Dibuja entidades (protagonista, enemigos, jugadores remotos).
     - Dibuja UI (HUD, logs, menús).
3. **Red**
   - Los mensajes recibidos del `DataChannel` son delegados a `game.procesarMensajeMultiplayer`.
   - Ese método actualiza entidades remotas (posición, estado) y gestiona eventos de handshake, desconexión, elección de host.

## Detalles de Subsistemas Importantes

### Renderer (`core/Renderer.ts`)
- Responsable de todo el dibujo en `<canvas>`.
- Maneja zoom, recorte para que UI no se afecte, y capas (fondo, entidades, efectos).
- Depende de `SpriteManager` para obtener imágenes.

### SpriteManager (`core/SpriteManager.ts`)
- Carga spritesheets mediante `new Image()` y espera a que estén listas.
- Proporciona métodos `drawSprite(frameName, x, y, width?, height?)` que dibujan un sub‑rectángulo de la hoja.

### FirebaseManager (`network/FirebaseManager.ts`)
- Wrapper sencillo sobre Firestore:
  - `crearPartida(id, hostId, hostNick)` → crea documento en colección `partidas`.
  - `updateHeartbeat(id, numJugadores)` → mantiene activo el lobby.
  - `getPartidasActivas()` → lista partidas con `< 60s` sin heartbeat.
  - `limpiarSignaling(partidaId, guestId)` → borra candidatos ICE y documento de conexión (se usa al cerrar un peer).

### NetworkManager (`network/NetworkManager.ts`)
- Gestiona el ciclo WebRTC:
  - Genera un `idLocal` aleatorio.
  - Mantiene un mapa `jugadoresRemotos` (clave = id del peer, valor = objeto `RemotePlayer` con `RTCPeerConnection`, `RTCDataChannel` y referencias a la entidad del juego).
  - Métodos principales:
    - `setupWebRTCHost(guestId, game)` → crea `RTCPeerConnection`, crea `offer`, guarda offer y escucha answer/ICE en Firestore.
    - `setupWebRTCGuest(partidaId, game)` → se une a una partida, guarda su identificador, espera offer, crea answer, intercambia ICE.
    - `setupDataChannelHandlers(canal, idEmisor, game)` → registra eventos `open`, `message`, `close` y delega mensajes a `game.procesarMensajeMultiplayer`.
    - `enviarMensaje(objeto, exceptId)` → serializa a JSON y envía por todos los `DataChannel` abiertos (excepto el excluido).
- Maneja desconexiones: al cerrar el canal elimina el peer remoto y, si era el host, inicia una elección de nuevo host.

## Convenciones y Patrones
- **Tipado fuerte**: casi todo está tipado con TypeScript; interfaces en `types/`.
- **Inyección de dependencias manual**: en `main.ts` se crean los servicios y se pasan donde se necesitan (por propiedad o mediante métodos).
- **Eventos**: la UI y el log se actualizan mediante llamadas directas a `ui.registrarLog*` o `game.registrarEventoLog`.
- **Estado del juego**: centralizado en la clase `Game` (implementa `IGame`). Contiene:
  - `mapaLaberinto: Celda[][]`
  - `protagonista: Jugador`
  - `listaDeEnemigos: EnemigoNPC[]`
  - `jugadoresRemotos: Map<string, any>`
  - Referencias a subsistemas (`renderer`, `ui`, `firebase`, `network`).

## Cómo Añadir Nuevas Funcionalidades
1. **Nueva entidad (p.ej., trampa, poder)**
   - Crear clase en `entities/` que implemente una interfaz común (`IEntidadRPG` si existe) o simplemente tenga `actualizar(deltaTime)` y `dibujar(ctx)`.
   - Registrar su creación/eliminación en `Game.listaDe...` o en la propia celda (`tipoEscenario`, `estadoEscenario`).
   - Dibujarla en `Renderer.dibujarEntidades` o en una capa específica.
2. **Nuevo tipo de mensaje P2P**
   - Añadir un campo `tipo` al objeto que se envía mediante `network.enviarMensaje`.
   - En `Game.procesarMensajeMultiplayer` añadir un `case` para manejarlo y actualizar el estado local.
3. **Mejoras de renderizado (shaders, capas)**
   - Modificar `Renderer.ts` para agregar nuevas capas (p.ej., capa de iluminación) antes/dibujar entidades.
   - Si se requiere WebGL, considerar migrar a una librería (pixi.js) – pero el actual está basado en Canvas 2D.
4. **Persistencia de partidas**
   - Usar los métodos de serialización existentes (`world/serialization.ts`) para guardar el mapa completo en Firestore o IndexedDB.
   - Llamar a `serializarMapa(game.mapaLaberinto)` al pausar o al salir, y `deserializarMapa` al cargar.

## Comandos Útiles
```bash
# Instalar dependencias (primer vez)
pnpm install

# Ejecutar en desarrollo
pnpm dev

# Build para producción
pnpm build

# Preview del build
pnpm preview

# Lint (si se configura)
pnpm lint   # (ejecutar según script en package.json)

# Test (si existen)
pnpm test
```

## Próximos Pasos Sugeridos
- Añadir un sistema de **log de eventos** más estructurado (posiblemente redux-like) para facilitar el replay.
- Mejorar la **selección de nuevo host** usando un algoritmo de consenso sencillo (el peer con ID más bajo se hace host).
- Implementar **reconexión automática** guardando temporalmente el estado local y intentando volver a unirse a la misma partida.
- Optimizar el **uso de sprites**: empaquetar todas las animaciones en una sola spritesheet y usar coordenadas de frame.

---
*Este documento puede actualizarse a medida que evolucione el proyecto. Sirve como punto de referencia para nuevas sesiones de desarrollo o para incorporar nuevos miembros al equipo.*