# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Coop WebRTC UI**: panel por rol (host/invitado), QR de oferta/respuesta en 3 partes con navegación ANTERIOR/SIGUIENTE, token visible, botones COPIAR OFERTA/RESPUESTA y **OPCIONES → INVITAR (WebRTC)** para reabrir el panel en partida; textos largos colapsados en «VER TEXTO (avanzado)»; helper puro `qrPartes` (`dividirEnPartes`/`reensamblarPartes`) con specs; `manualSdp` acepta respuestas legacy `{type,sdp}` y da errores específicos en vez de «Código inválido».
- **Mundo continuo (F3)**: costuras espaciales entre nodos (`salida`/`entrada`/`escalera` en bordes) con colocación derivada y apertura de bordes, render multi-nodo con cámara de mundo, cruce caminando sin fundido en solo/host y mundo continuo en el invitado MP (activo + hasta 2 vecinos, cámara interpolada); portales y casa siguen siendo teletransporte; botón DEBUG `🧵 COSTURA` para probar el cruce; specs de geometría (`costura.helpers`) y smokes `smoke_costura.mjs` + `smoke_costura_mp.mjs`
- **Salida aleatoria y fin de partida MP** (F4): salida en celda aleatoria a ≥15 del spawn (`esSalida` + sección `|X`, portal verde), espera inmune y reentrable en multijugador, roster congelado al primer jugador que sale, fin cuando todos están fuera (salida/muerte/desconexión), puntuación `oro + XP·2 + bajas·10 + tiempo` y tabla de resultados; `posicion`/`progreso` sincronizan datos de remotos; smoke 1 y 2 clientes (`126f412`…`2e493df`)
- **Balrog y cofre de titanio** (F3): un Balrog por mazmorra con stats fijas (200 HP, 500 XP), escala visual 1,5× y fallback programático llamativo; cofre de titanio 0–1 (100 oro) y llave de titanio persistente que el boss suelta al morir, con autoridad del host también si mata un invitado; smoke 1 y 2 clientes (`b33dab7`…`a0cb1e3`)
- **Cofres, llaves y salas de tesoro** (F2): 1–5 cofres de hierro y 0–3 de acero en salas del BSP, llave reutilizable garantizada por tipo, apertura bump-to-open con mensaje de llave faltante, oro directo al inventario (10/30), persistencia por deltas LWW, secciones de mapa `|C`/`|K` para invitados, render de cofres/llaves y HUD de llaves; smoke 1 y 2 clientes (`9ee3995`…`542b3bf`)
- **Oro**: material apilable con peso (10 g/moneda), drops por tipo de enemigo al morir (Goblin 1–3 … Balrog 25–50), recogida al pisar y contador en HUD + dropdown de estadísticas — F1 de la serie oro/tesoros (`eea1e49`, `e91714f`, `44402a5`)
- **Smoke de multijugador Firebase** (`scripts/smoke_firebase.mjs`): 2 clientes reales con claves inyectadas — sala + conexión + posición sincronizada; `SMOKE_GUEST_URL` permite probar un invitado contra la web desplegada (cross-origin Pages↔local). Veredicto del fallo del mando en Pages: **sala fantasma** en la lista (no bug de código)
- **Badge de versión en el lobby**: «v1.1.0» discreto abajo a la derecha (`position: fixed`, se oculta con el lobby) + `console.log` de arranque; la versione la inyecta Vite desde `package.json` (`define: __VERSION__`) — bump `1.0.0 → 1.1.0` (comercio v1 + UI por dispositivo) para saber qué está desplegado tras cada subida
- **Comercio F2 — UI de trueque**: entrada por OPCIONES → COMERCIAR (selector de jugadores conectados), ventana de invitación (ACEPTAR/RECHAZAR) y ventana de trueque con cestas editables por clic (spinner ± para apilables, clamp por stock), oferta del otro visible en vivo (`trade_offer`/`trade_state`), doble confirmación con estados (`propio/otro-confirmado`), cierre automático por `trade_apply` y limpieza por desconexión; dominio puro `ui/truequeModelo.ts` con tests y ronda UI-real en el smoke (`361e260`, `3ebad61`, `be555cc`, `5835a60`, `6409250`)
- **Comercio F1 — trueque entre jugadores** (propuesta comercio): dominio puro `core/intercambio.ts` (cestas saneadas, disposición verificada, aplicación **atómica** con capacidad) + `core/gestorTrueques.ts` (máquina de estados por par: `propuesta → confirmada_uno → aplicada/cancelada`) + protocolo `trade_*` **host autoritativo** con export fresca al confirmar (`trade_apply` difunde el estado final de ambos) + limpieza al desconectar + smoke 2 clientes reales (`scripts/smoke_trueque.mjs`, TRUEQUE_OK) (`0ec911f`, `01b2564`, `329274c`, `db29001`)
- **Fix duplicados de bulto**: el panel EQUIPO oculta solo la copia equipada (bulto superset) y la ventana de trueque excluye lo equipado de su stock (`6409250`)
- **UI de acciones por dispositivo** (espec `spec-2-ui-dispositivo-v1`): acordeón/dock según pantalla — **dock táctil** translúcido en tablet con colapso a pastilla persistido, **teclas remapeables** en PC (panel ASIGNAR TECLAS con captura; defaults `1-6`/`e`, reservadas WASD/flechas/Enter/F9/Esc, badges de tecla, selector AUTO/TÁCTIL/ACORDEÓN persistente), **acordeón full-width desplegado** en móvil con banda inferior dinámica (`ALTO_UI_BOTTOM` medido) y dominio puro con tests (`keybinds`, `esquemaAcciones`) (`da6f2d5`, `b850a67`, `821012a`, `0f98bcf`, `1f4ee00`, `939aea2`)
- **Movimiento con WASD** además de las flechas (mismos deltas), con parada de caminata al soltar (`821012a`)
- **Smoke headless**: aserciones del esquema UI de acciones (clase `esquema-*` en body, `#actionDock` en el DOM)
- **Inventario y equipamiento**: catálogo de items (`ItemDef`: tipo equipo/consumible/material, ranura, manos, bonos, peso, dano, pieza visual) + dominio puro (7 ranuras, reglas de empuñadura, bonos, stats efectivos = base + equipo, mochila con peso) (`3bd12c8`, `f8a959a`, `7296804`)
- **Panel de equipo y mochila** estilo RPG clásico (muñeco + bulto) con **arrastrar y soltar** (equipar/desequipar, validación por ranura, clic como fallback), stats `base→total` y preview; **usable in-game** (botón 🎒 / tecla E) (`1c2692d`, `73a172e`, `ba173b7`)
- **Loot**: los mobs sueltan botín al suelo que se recoge al pisar (tabla ponderada `config/botin.ts`), **propiedad real** (bulto con kit inicial que se llena al lootear, equipo acumulable) (`f462393`, `4b7bcd7`)
- **Pico** empuñable (habilita cavar, −1 al daño) y **flechas como munición** del arco; **peso máximo según fuerza** con **penalizaciones de sobrecarga** (ataque/defensa/movimiento) (`14734ed`, `a6a8df7`, `5451cfd`)
- **Persistencia** del equipo y la mochila en la sesión guardada (contrato versionado `InventarioGuardado`, migración de IDs legados) (`6f716b4`, `54658f8`, `7512070`)
- Multijugador **SERVIDOR LOCAL**: conexión + **admisión automática** (check cada 10 s), mapa, movimiento y **efectos sincronizados** en host e invitados (`328d239`, `2f22fc7`, `099357f`, `1f5b406`, `b6eb3e0`, `23a6fc9`)
- Piezas de avatar por capas v1: casco, melena, peto y botas componibles sobre el sprite intacto (arte programático `scripts/gen_piezas.py` + registro `piezas.json`), ranuras on/off en el modal, kit unisex con migración de IDs guardados y casco v2 (`1a352cd`, `f8a959a`, `498ef26`, `7296804`)
- Género de punta a punta: sheets femeninos (`players_f`, `hero_custom_f`, `jugadoras`), selector HOMBRE/MUJER en la creación de personaje y base F ligera (dimorfismo resuelto en piezas) (`7d017f7`, `f049919`, `9682ecd`)
- Avatar con tintes por zonas (piel, pelo, torso, piernas): compositor canvas con remapeo de paletas por clase, editor en el modal de personaje con preview, persistencia en sesión/partida y apariencia viajando en el protocolo a remotos (`3d5469b`…`7bec1bd`)
- Mundo persistente (fase 2): persistencia completa fuera de la burbuja — las ediciones válidas (cavar, objetos, decor y escenario) viajan como delta también fuera del radioSim (`4e1a7b2`, `b498d27`, `3aeb7ce`)
- Snapshot por nodo (formato 1): foto de enemigos/escenario/celdas persistida y restauración fiel al travesar entre nodos, con guard anti-race de doble cruce (`e43cd8b`, `bdd98d5`, `6a30dfc`)
- Casa duradera: espejo local del contrato de mundos (deltas + snapshot) como persistencia de la casa cuando no hay Firebase (`5e8584b`)
- Serialización de mapa v2 (secciones dispersas + presupuesto): decor/escenario viajan al invitado — los huéspedes ven el arte de la casa (`8df8d6a`, `59990b7`)
- Reglas de seguridad de Firestore versionadas y despliegue de reglas en CI solo en merge (`212f0d2`, `7fa4f2a`)
- Smoke headless de 1 cliente sobre `dist/` (`scripts/smoke_headless.mjs`): arranque limpio con casa, travesía ida/vuelta por el conector real, recarga con casa duradera (espejo local); CDP con Chromium headless (binario Playwright del sistema)
- Arte de la casa: suelos de madera/baldosa/alfombra, muros de interior (yeso + zócalo) y mobiliario (cama, chimenea, mesa, silla, estante) — `verification/gen_house.py` → `public/sprites/house.png` (grupo `escenario_casa` en `sprites.json`)
- El portal de housing se dibuja como una casita que emite pulsos para llamar la atención
- Debug: botón "🏠 A MI CASA / AL MAPA" para teletransportarse al housing y volver (solo con modo desarrollo)
- Housing contenido (fase 1): generador `planta` v2 crea un plano de vivienda (retícula de habitaciones con puertas, perímetro cerrado, sin exteriores) y la casa usa dimensiones propias
- Aviso "HOUSING ENCONTRADO" en el lobby: permite reutilizar la casa guardada o crear una nueva
- Conectores de vuelta (espejo tipo `entrada`) en el conector de zona y el portal de casa: ida y vuelta reales entre nodos
- Sprite-based rendering engine y STRUCTOR tool v1 (`3a7f572`)
- Integración de metadatos de sprites externos y mejora de lógica de carga (`2bc5c9d`)
- Soporte para hojas de sprites servidor en STRUCTOR (`5a8bbd4`)
- Editor bidireccional de mapeo de sprites en STRUCTOR (`9c598cc`)
- Sincronización bidireccional en tiempo real de metadatos en STRUCTOR (`56437af`)
- Clonación de acciones en STRUCTOR (`d98cc27`)
- Adaptabilidad de UI de STRUCTOR a diferentes tamaños de pantalla (`4d88fbb`)
- Migración completa a sprites con STRUCTOR v1.3 (`d8d7675`)
- JSON drawer y simulación mejorada en STRUCTOR (`5443987`)
- Migración a sprite-based rendering con STRUCTOR v1.4 (`221a262`)
- Refinamiento de STRUCTOR con pestañas y lógica de fotograma anterior (`ec3c2cc`)
- Migración a sprite-based rendering con STRUCTOR v1.5 (`bca032f`)
- Soporte de sprites VFX y redimensionamiento dinámico del mapa (`021667d`)
- Modo multijugador HTTP con servidor de señalización externo (`bab0b3b`)
- Píldoras formativas LEARN sobre WebRTC, signaling híbrido, buffering ICE y host-authority con snapshots (`9f6bc75`, `8dc717a`)
- Píldora LEARN introductoria a WebRTC ampliada con conceptos pormenorizados (`b83f001`)
- Píldoras LEARN de Arquitectura del Juego: separación render/lógica, singleton state container y command queue (`5a757b3`)
- Píldoras LEARN de Entidades y Patrones: herencia + interfaz, state machine ligero y callback pattern (`3e3e350`, `87d5249`)
- Píldoras LEARN de Renderizado y Sprites: fallback visual, fog of war y sprite mapping tool (`d57fa48`)
- Píldoras LEARN de Generación de Mundos: BSP, serialización compacta y garantía de conectividad (`fb0e822`)
- Píldoras LEARN de Tooling y TypeScript: multi-entry build, strict mode e inyección de configuración (`fb0e822`)
- Wizard de lobby modo-primero: flujo modo → personaje → crear/unirse, con multijugador Firebase, cooperativo WebRTC manual, solo local y servidor local (`20d0b3a`)
- Servidor local de signaling (Node sin dependencias, `server/signaling.mjs`) para el modo Servidor Local del lobby; arranque `node server/signaling.mjs` o `pnpm signaling` (`6afdb45`)
- Mundo persistente (fase 1): modelo de mundo jerárquico con `NodoMundo`/`ConectorMundo`/`DeltaMundo`, formato de delta `fmt=1` y resolución last-writer-wins (`e125ae8`)
- Generadores de mundo versionados y deterministas por seed: mazmorra, abierto, planta y natural (`d1f713f`, `35e7c3f`)
- `GestorMundo`: árbol de nodos, nodo activo y conectores entre mapas (`4b79f8c`)
- Burbuja de realidad de doble radio: `radioSim` (simulación y sincronía) vs `radioVis` (render) (`704a1fd`)
- Persistencia retrocompatible del mundo en Firestore: subcolección `partidas/{id}/mundos/{nodoId}` con deltas versionados (`beae01c`)
- Housing local: nodo personal con dueño y portal estricto (visitable solo con el dueño online) (`18227f5`, `2d295e8`)
- Arranque del mundo vía `GestorMundo` con getter de compatibilidad `game.mapaLaberinto` (`ff30371`)
- Runner de tests `pnpm test` para los specs de mundo, generadores y persistencia (`e784b67`)
- Demo desplegada en GitHub Pages (base relativa + workflow) (`2fb27b4`, `2eca656`)

### Changed
- **Escenario ampliado 60×60 → 80×80**: +78 % de superficie (3.600 → 6.400 celdas) y densidad de enemigos reescalada (40 → 70 base) para que la exploración pese; sin cambios de persistencia ni red (ronda 20261025a)
- **Bump `1.1.2 → 1.2.0`** (menor): escenario ampliado 80×80 desplegado
- **Controles uniformes**: se elimina el acordeón inferior y el selector AUTO/TÁCTIL/ACORDEÓN; el dock de acciones se usa en todos los dispositivos (móvil, tablet y PC), visible también en PC, en modo icono (sin texto) y con la misma disposición (`6423eea`, `9a19db1`)
- **Zoom por defecto 1 → 2** (celda 64px, mitad del slider) y toggle de debug de la tecla `D` a **`F9`** (`939aea2`, `821012a`)
- Housing: persistencia bajo clave fija `mazerpg.casa.local` (una sola casa por dispositivo) y limpieza de casas legacy por `idLocal`
- Renderer: dibuja por las dimensiones reales del nodo activo (soporta nodos menores que el mundo, p.ej. la casa contenida)
- Estandarización de configuración de sprites a formato basado en puntos (`e0c31e7`)
- Consolidación de configuración de sprites en un único JSON centralizado (`eaf31f4`)
- Externalización de configuración de sprites y mejora de manejo de errores (`8202c84`)
- Migración del motor del juego a sistema de sprites basado en metadatos con STRUCTOR (`81773c3`)
- Documentación del sistema de sprites con instrucciones de despliegue (`a411b4d`)
- Asignación de sprites a jugadores (`90dcd59`, `38480ef`, `96b3eec`)
- Ajustes varios de configuración de sprites (`03cadbb`, `d867863`, `b4e8044`)
- Migración de npm a pnpm y actualización de AGENTS.md (`6be78ee`)
- Arte del laberinto: autotile, muros con cuerpo y viñeta; sprites de 41 a 0 errores (`54e43e0`)
- Firebase unificado al proyecto `mazerpg-b2aa4` (`.firebaserc`, `projectId` y service account) (`0a354b4`)

### Fixed
- **Coop WebRTC manual: el invitado no entraba en la partida**: el host mantenía al invitado bajo la clave provisional `GUEST_*` y creaba una segunda entrada con el id real y `dc:null`; `handshake_ack` llamaba a `enviarMapaAlInvitado` sobre esa entrada y no enviaba mapa/objetos. Ahora el handshake migra `GUEST_*` al id real, un alias provisional→real enruta los mensajes del DataChannel, oferta/respuesta llevan token visible (multi-invitado), se puede copiar con un botón y **OPCIONES → INVITAR (WebRTC)** reabre el panel en plena partida; smoke `scripts/smoke_coop_webrtc.mjs` (2 invitados, host con 2 remotos reales y ambos dentro). TURN/reconexión queda en `20261010g`.
- **El invitado no veía el tiling de la casa en multijugador**: al cruzar el host a su vivienda, el invitado recibía el arte de la casa pero seguía renderizando suelo/muros de mazmorra, y en HTTP ni siquiera recibía el mapa nuevo. Causa doble: (1) el invitado no tiene nodo propio en su `GestorMundo`, así que `Renderer.setAmbiente()` se quedaba en `dungeon`; ahora el host envía `ambiente` en el mensaje `mapa` y el invitado lo aplica; (2) `reenviarEstadoAInvitados()` comprobaba el transporte Firebase y `conmutarSnapshotEnemigos()` exigía `persistenciaMundo`, de modo que en HTTP el cruce de nodo no reenviaba nada; ahora ambos usan el transporte MP activo y el reenvío sin persistencia va tras el cruce. Regresión cubierta en `scripts/smoke_housing_mp.mjs` (host entra/sale de casa → invitado 9×16 con `casa_suelo_*`, vuelta a 60×60 `dungeon`) (`f6b5dd3`)
- **Bump `1.1.1 → 1.1.2`** (parche): el badge de versión del lobby (`v1.1.2`) distingue el build con el fix de housing en MP de los anteriores
- **El lobby en móvil mostraba los controles de partida**: el dock de acciones (🔥 BOLA FUEGO, 🎒 EQUIPO) se encendía en el menú inicial y tapaba los botones de modo (COOPERATIVO, REANUDAR PARTIDA). Causa: el listener de `resize` aplicaba el esquema de UI de partida, y en móvil `resize` se dispara al moverse la barra de direcciones; además, al volver al lobby desde una partida el dock no se ocultaba. Ahora `resize` solo recalcula dimensiones y `hideCanvas()` oculta también el dock. Regresión cubierta en `scripts/smoke_ui_movil.mjs` (Chrome headless, viewport de smartphone) (`4fb6c2b`)
- **Lobby en móvil: nada queda bajo la barra de direcciones**: `body` y `#lobby` se dimensionan con `dvh` (alto visible real) en vez de `vh` (alto con la barra dentro), con `env(safe-area-inset-bottom)` para el gesto inferior y el notch (`4fb6c2b`)
- **Bump `1.1.0 → 1.1.1`** (parche): el badge de versión del lobby (`v1.1.1`) distingue el build con el fix de UI móvil de los anteriores, para que la comprobación en el móvil sea inequívoca (`9819c44`)
- **Habilidades del invitado en multijugador**: la bola de fuego, el arco, el radar, el torbellino, congelar y parar caminata se descartaban si el invitado estaba fuera de la burbuja del host; ahora el cliente que dispara valida con su propia visión y el host aplica. El arco viaja con `targetId` (el objetivo lo elige la niebla del invitado y el host lo resuelve por id) y `arrow_spawn` usa la posición real del emisor; regresión cubierta en `smoke_cofres.mjs` (flecha del invitado daña al objetivo) (`310c217`)
- **Invitado en multijugador**: solo predecía el movimiento y no ejecutaba la lógica local; ahora resuelve su acción en local (recoge oro, abre cofres, recoge llaves y usa portales) además de enviarla al host. La posición tras portal se sincroniza también en HTTP (antes solo Firebase). Regresión cubierta en `smoke_cofres.mjs` (oro y portal del invitado) (`ea44d33`)
- Modo un jugador: el personaje no se movía (teclado ni tap) — regresión de `b6eb3e0`: `intentarMover` encolaba la acción `mover` con id literal `'local'` sin transporte multijugador activo, pero `resolverAccion` resuelve la entidad por `idLocalActivo` (`network.idLocal`) y la descartaba con «No se encontró entidad»; el id encolado ahora refleja `idLocalActivo` (nuevo smoke de regresión `scripts/smoke_movimiento.mjs`, verificado red→green y validado en Pages) (`dfebd69`)
- Reanudar partida: una sesión legada rol `host` con `roomId` vacío lanzaba `FirebaseError: CollectionReference.doc() cannot be called with an empty path` al crear la persistencia del mundo — ahora valida el `roomId` y cae limpiamente a modo solo (`9240d9b`)
- Modo solo: `onSelectMode('solo')` fija `modoMultijugador='manual'` para que el lado local sea autoritativo incondicionalmente (defensivo) (`a104a94`)
- Multijugador SERVIDOR LOCAL: el invitado no conectaba, se quedaba en el spinner, no recibía el mapa y no sincronizaba movimiento ni efectos — el código estaba cableado al transporte Firebase en vez del activo HTTP (`9711054`, `c3f862b`, `1f5b406`, `b6eb3e0`, `23a6fc9`)
- Errores de Firestore se muestran en el front (banner + log) y el flujo hace fail-fast (no se crea sala si Firebase falla) (`773f159`, `1728f5c`)
- Modal de personaje compacto: caja de 1076px a 667px — GUARDAR visible sin scroll desde 667px de alto; tema mazmorra aplicado a los modales (vars `--oro*` movidas a `:root`) (`75f45f1`)
- Host-authoritative en portales: una entidad remota (invitada) o un NPC que pisa el portal del host ya no conmuta el nodo activo global — el anfitrión cruza y el reenvío lleva a los invitados al nuevo nodo; además, un NPC con coordenadas fuera de la rejilla activa se abstiene y lo delata con `[DIAG]` en vez de tumbar el game loop
- Crash del game loop del invitado al cruzar el host de nodo: el estado completo (mapa v2 + enemigos + objetos) se reenvía tras cada cruce con el nodo ya rehidratado, la foto de enemigos se acota a las dims del destino (`restaurarEnemigos`) y el invitado descarta NPCs con coordenadas fuera de su rejilla
- Arbitraje LWW real: el tick del autor viaja por red y se respeta entre clientes (`67fe781`)
- El plegado LWW por celda ya no pierde efectos ortogonales: la clave de plegado pasa a (celda, tipo, campo) — cavar + objeto/decor/escenario de la misma celda coexisten en el snapshot plegado (la recarga deja la celda transitable y con su objeto)
- Firebase: la historia persistida del nodo destino (casa incluida) se rehidrata al travesar el conector en el lado con persistenciaMundo, antes de enviar el mapa al invitado
- El portal de casa ya no se coloca en la esquina META/salida del mapa: se ubica en una celda céntrica transitable (y el retorno desde la casa aterriza en el centro, no en la salida)
- `teleportarPortalClasico` ya no crashea si la entidad queda fuera del nodo activo (guardas de límites)
- El arranque ya no se tumba si `localStorage` está lleno (`QuotaExceededError`): `guardarCasa` degrada con aviso y la casa sigue viva en memoria
- `sprites.json`: eliminada la entrada `food_apple -> sprites/apple.png` (fichero inexistente) que provocaba el falso aviso "Modo geométrico activo (Sprites faltantes)"
- Enemigos por-nodo: al atravesar un conector se descartan los del nodo anterior (evita accesos fuera de la rejilla del nodo activo)
- Fallos de interacción de invitados y optimización de suavizado de cámara (`7c17fa9`)
- Desincronización multijugador y problemas de sprite fallback en NPCs (`438e7c4`)
- Corrección de estado de respawn (`7c874ca`)
- Escudos-burbuja recogibles: consumen la burbuja, otorgan 30 s de inmunidad, se sincronizan y avisan en el log (`22d1d8a`)
- Lobby: los dados se tiran sobre el protagonista vivo (rescate del refactor de lobby) (`57bfc9b`)
- El invitado HTTP ya no siembra un mundo local (guard de autoridad por modo) (`896cf28`)
