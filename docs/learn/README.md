# Índice de píldoras LEARN

Colección de píldoras formativas extraídas del desarrollo real de este proyecto.

---

## WebRTC y Multiplayer

Píldoras dedicadas a la arquitectura de red P2P, señalización y sincronización de estado.

| # | Título | Estado | Descripción |
|---|--------|--------|-------------|
| 00 | [Introducción a WebRTC](webrtc/00-webrtc-intro.md) | ✅ | Conceptos básicos: `RTCPeerConnection`, `RTCDataChannel`, STUN/ICE y el handshake |
| 02 | [Signaling híbrido](webrtc/02-signaling-hibrido.md) | ✅ | Cómo usar Firebase y HTTP como transportes de signaling sobre la misma base P2P |
| 03 | [Buffering de candidatos ICE](webrtc/03-buffering-candidatos-ice.md) | ✅ | Patrón para manejar la condición de carrera entre ICE candidates y `setRemoteDescription` |
| 04 | [Host-Authority con Snapshots](webrtc/04-host-authority-snapshots.md) | ✅ | Arquitectura host-autoritativa: snapshots periódicos, predicción local y snap-back con umbral |

---

## Arquitectura del Juego

Game loop, state management y patrones de sincronización entre render y lógica.

| # | Título | Estado | Descripción |
|---|--------|--------|-------------|
| 10 | [Separar Render de Lógica con `requestAnimationFrame`](architecture/10-separar-render-logica.md) | ✅ | Desacoplar framerate visual del tick rate del mundo mediante un loop de render independiente |
| 11 | [Patrón Singleton como State Container (`window.game`)](architecture/11-singleton-state-container.md) | ✅ | Ventajas y riesgos de centralizar todo el estado en un singleton global expuesto al navegador |
| 12 | [Command Queue para Multiplayer Autoritativo](architecture/12-command-queue-multiplayer.md) | ✅ | Encolar acciones de clientes en el host para resolverlas de forma determinista en cada tick |
| 13 | [Callbacks huérfanos en señalización](architecture/13-callbacks-huerfanos-signaling.md) | ✅ | Por qué un `onSignal` sin `unsub()` al abrir el canal P2P causa fugas de memoria progresivas |
| 14 | [El bucle que nunca duerme](architecture/14-requestanimationframe-sin-stop.md) | ✅ | `requestAnimationFrame` perpetuo sin `cancelAnimationFrame`: el juego renderiza a 60fps aunque esté en pausa |
| 15 | [Timers zombie al sobrescribir servicios](architecture/15-timers-zombies-sobrescritura.md) | ✅ | Crear un nuevo `SignalingClient` sin destruir el anterior deja múltiples timers activos en segundo plano |
| 16 | [Medidas de contingencia para game loops](architecture/16-medidas-contingencia-game-loop.md) | ✅ | Auto-pause en background (solo solitario), monitor de FPS, hotkey de emergencia, botón del pánico para touch y FPS display en modo debug |

---

## Renderizado y Sprites

Sistema de dibujo, fallback visual y herramientas de desarrollo para assets.

| # | Título | Estado | Descripción |
|---|--------|--------|-------------|
| 20 | [Cadena de Fallback Visual (Sprite → Emoji → Geométrico)](rendering/20-cadena-fallback-visual.md) | ✅ | Cómo garantizar que el juego sea jugable incluso sin assets gráficos cargados |
| 21 | [Fog of War con Decaimiento Temporal](rendering/21-fog-of-war-decaimiento.md) | ✅ | Niebla de guerra basada en timestamps: cálculo de opacidad progresiva y clipping de viewport |
| 22 | [Sprite Mapping Tool como Dev Tool integrada](rendering/22-sprite-mapping-tool.md) | ✅ | El contrato `GameSpriteContract` y cómo mantener consistencia entre assets y código |

---

## Generación de Mundos

Procedural generation, serialización compacta y post-procesamiento de mapas.

| # | Título | Estado | Descripción |
|---|--------|--------|-------------|
| 30 | [Generación Procedural con BSP](world/30-generacion-procedural-bsp.md) | ✅ | Binary Space Partitioning: dividir recursivamente, crear salas en hojas y conectar con pasillos |
| 31 | [Serialización Compacta con Bitmasking + Base36](world/31-serializacion-compacta-bitmasking.md) | ✅ | Comprimir cada celda a un dígito base36 usando bits para muros y transitabilidad |
| 32 | [Garantía de Conectividad vía Post-procesamiento](world/32-garantia-conectividad-postprocesamiento.md) | ✅ | Forzar rutas manuales tras la generación para asegurar que inicio y fin sean alcanzables |

---

## Entidades y Patrones de Diseño

Jerarquías de clases, máquinas de estados y desacoplamiento mediante callbacks.

| # | Título | Estado | Descripción |
|---|--------|--------|-------------|
| 40 | [Herencia + Interfaz Compartida (`IEntidadRPG`)](entities/40-herencia-interfaz-ientidadrpg.md) | ✅ | Jerarquía de entidades con lógica común en clase base y especialización en subclases |
| 41 | [State Machine Ligero para Animación](entities/41-state-machine-animacion.md) | ✅ | Estados (`idle`, `walking`, `attacking`) con expiración automática y mapeo a sprites |
| 42 | [Callback Pattern para Efectos de Daño](entities/42-callback-pattern-dano.md) | ✅ | Desacoplar la lógica de combate (`recibirDano`) de la lógica visual/red mediante callbacks |

---

## Tooling y TypeScript

Configuración de build, convenciones de calidad y gestión de entornos.

| # | Título | Estado | Descripción |
|---|--------|--------|-------------|
| 50 | [Multi-Entry Build con Vite](tooling/50-multi-entry-build-vite.md) | ✅ | Compilar dos aplicaciones independientes (juego + structor) desde el mismo repo |
| 51 | [TypeScript Strict como Gate de Calidad](tooling/51-typescript-strict-gate-calidad.md) | ✅ | Cómo `noUnusedLocals` + `noUnusedParameters` fuerzan limpieza constante del código |
| 52 | [Inyección de Configuración: Build vs Runtime](tooling/52-inyeccion-configuracion-build-runtime.md) | ✅ | Placeholders en HTML reemplazados por CI vs `window.FIREBASE_CONFIG` en desarrollo local |

---

> **Convención de numeración**: cada área temática tiene un rango reservado (`00-09` WebRTC, `10-19` Arquitectura, `20-29` Renderizado, etc.). Los huecos dentro de un rango permiten insertar píldoras nuevas sin renumerar todo.
