# Especificación de diseño — Mundo persistente: Fase 2

**Fecha:** 2026-10-10 · **Autoría:** agent- (batuta: JL, en chat) · **Estado:** DISEÑO COMPLETO — secciones 1–6 aprobadas (2026-10-10); pendiente: revisión del mando + plan de implementación.

**Origen:** propuesta [[20261009-human-mundo-persistente-burbuja-realidad]] · píldora 64 (burbuja de realidad) · fase 1 integrada en `896cf28` · housing con arte en `cec411f`/`82cdfb5`. Brainstorming D4 (chat, sesión 20261004a-pendientes-lobby-firebase-limpieza).

## Alcance de fase 2 (fijado con batuta)

1. **I2 — arbitraje LWW real**: los deltas remotos llevan el tick del autor y ya no se re-sellan al recibir; `ArbitroDeltas` rechaza de verdad lo tardío.
2. **Persistencia completa**: cambios de objeto/escenario **fuera de `radioSim`** y el escenario dinámico se persisten (la burbuja gobierna la *sim*, no la persistencia).
3. **Durabilidad de la casa** entre sesiones (solo): casa guardada = base + replay de deltas; se guarda el estado editado, no la planta regenerada.
4. **Enemigos por-nodo**: snapshot de enemigos al salir del nodo; se restauran al volver.
5. **Arte para huéspedes**: `serializarMapa` v2 (fmt + `sueloDecor`/`mueble` opcionales por celda) para que los invitados rendericen como el local.
6. **Hardening reglas Firestore**: `firestore.rules` versionado en repo + despliegue en CI + instrucciones de restricción de API key web en consola.

**Fuera de fase 2** (decidido): encuadre de cámara en la casa (pulido) · validación dedicada de HTTP/Manual (best-effort, heredan del host) · cualquier canal en vivo de Firestore para deltas.

**Modos objetivo de demo:** Firebase + Solo. **Restricción cuota** (batuta 2026-10-10): Firestore = depositario asíncrono; el runtime de deltas corre por WebRTC; **jamás un listener en vivo sobre `deltas`**.

---

## Sección 1 — Arquitectura de datos: `gen + deltas + snapshot` (APROBADA 2026-10-10)

### El modelo en tres capas

El mundo en cualquier instante es la fusión de tres capas, de la más barata a la más cara:

```
   ┌──────────────────────────────────────────────────────┐
   │  GEN (semilla determinista)                          │  lo que el nodo
   │  { nombre, version, seed, params }                   │  "tiene de serie"
   ├──────────────────────────────────────────────────────┤
   │  DELTAS (libro de cambios, append-only)              │  lo que los jugadores
   │  { nodoId, fila, columna, autoria, tick, cambio }             │  LE HICIERON
   ├──────────────────────────────────────────────────────┤
   │  SNAPSHOT (fotografía consolidada)                   │  estado de sesión
   │  { enemigos por nodo, escenario, celdas plegadas }   │  que no es "edición"
   └──────────────────────────────────────────────────────┘
```

- **Gen** es gratis: `generadores.ts` regenera el nodo idéntico desde la semilla — lo «de fábrica» no se almacena nunca. La casa 9×16 con su mobiliario nace aquí.
- **Deltas** son el historial de *ediciones*: cavar un pasillo, recoger comida, cambiar una puerta. Cada registro lleva el **tick del autor**, la **autoria** y el cambio. Es la única unidad que pasa por el árbitro LWW (por celda).
- **Snapshot** es el estado que NO es edición: enemigos vivos del nodo con sus posiciones al salir, estado del escenario. Estado de sesión con la misma regla temporal (el último que escribe gana), pero **por nodo**, no por celda.

### Contrato de datos (Firestore)

Sin colecciones nuevas; el doc de nodo de fase 1 ya tiene los huecos (`snapshot`, `ultimaCompactacionTick`):

```
partidas/{id}/mundos/{nodoId}
  gen: GenSpec               — semilla del nodo
  ownerId: string | null     — dueño (housing: `personal`)
  formato: 1                 — CAMPO NUEVO versionado (ausencia = 1 → lectura igual que hoy)
  deltas/{autoId}: { fmt: 1, nodoId, fila, columna, autoria, tick, cambio }
  snapshot: { formato: 1, enemigos?: [...], escenario?: {...}, celdas?: [...] }
  ultimaCompactacionTick: number
```

> Nomenclatura versiones: los **deltas** conservan `fmt` (como fase 1 — cambiarlo rompería datos existentes); los docs de nodo y snapshot usan `formato`. Ambos son el marcador de versión del formato.

### Ciclo de vida de un cambio

1. **Nace**: alguien edita `(f,c)`. El cliente construye `DeltaMundo` con su tick propio — tras la corrección I2 el tick viaja con el mensaje y nadie lo re-sella.
2. **Se arbitra**: el host (autoridad) consulta `ArbitroDeltas`: si el tick entrante ≥ del último aplicado en esa celda ⇒ aceptable; en caso contrario, rechazado (jamás se aplica ni persiste).
3. **Se aplica y difunde**: muta las celdas del nodo; el mundo se broadcast **por WebRTC** (0 cuota); el `Renderer` invalida caché.
4. **Se persiste**: **solo el host** escribe en Firestore. Los invitados *nunca* tocan `mundos` (servidor tonto: el host deposita).
5. **Se reconstruye** (cargar partida o entrar al nodo): gen → replay de deltas ordenados por tick → superposición del snapshot. Determinista: los clientes llegan al mismo mundo sin nadie más conectado.
6. **Se compacta**: al superarse umbral de deltas por nodo, se doblan en `snapshot`, se registra `ultimaCompactacionTick` y se borran los plegados. El árbol no crece de forma indefinida.

### Por qué híbrido (y no solo-delta o solo-snapshot)

- **Solo deltas**: los enemigos son churn de simulación (se mueven cada tick) → bloat + cuota gratis quemada por IA + contradictorio con burbuja. Rechazado.
- **Solo snapshots**: dos jugadores editando el mismo nodo → *el último-nodo-entero-gana* machaca ediciones ajenas: se pierde el grano LWW por celda que fija la propuesta. Rechazado.
- **Híbrido**: a cada estado su representación — edición interactiva (rara, pequeña, conflictiva) en deltas; sesión por nodo (frecuente, efímera) en snapshots.

### La casa en Solo: mismo contrato, espejo local

La casa es un nodo personal (`ownerId`) bajo el mismo contrato, espejado al `localStorage` con clave fija (`mazerpg.mundo.{nodoId}`; misma higiene de `housing.ts`: `try/catch` de cuota, evicción de claves legacy). El espejo NO sustituye a `mazerpg.casa.local` (que sigue guardando la planta base `NodoMundo` de la casa): el mirror añade el historial de deltas + snapshot del nodo casa SOBRE esa base:

- Al reanudar: adoptar casa guardada como **base** → aplicar sus deltas → el resultado *es* la casa editada.
- Al guardar: lo persistido es el estado editado — ya no se regenera por encima de lo que el jugador hizo.
- La durabilidad deja de ser una decisión del usuario: la casa *es* su bitácora.

### Invariantes

1. **Retrocompatibilidad**: `formato` versionado; doc sin `formato` = formato 1 (fase 1). Los clientes viejos ignoran campos nuevos; los datos de fase 1 no se migran.
2. **Cuota**: Firestore = depositario asíncrono (lobby, signaling, entrada-nodo, deltas del host). Sin listeners en vivo de deltas. Con <10 usuarios el uso queda en ~2–5 % del free tier diario (50 mil lecturas / 20 mil escrituras / 1 GiB).
3. **Determinismo**: el mismo gen + los mismos deltas (en el mismo orden) + el mismo snapshot ⇒ el mismo mundo en cualquier cliente.
4. **Autoridad**: host aplica, arbitra y persiste; los invitados nunca leen `mundos` en Firestore — dependen del host para el mundo.

(Secciones 2-6: ver abajo.)
---

## Sección 2 — Arbitraje LWW real (I2) (APROBADA 2026-10-10)

**Diagnóstico verificado**: `ArbitroDeltas`/`resolverLWW` son correctos; el defecto está en los receptores de `main.ts` (`object_spawned`, `food_consumed`, `pick_collected`, `shield_collected`, `dig_completed`…): reconstruyen el delta con `construirDelta(...)` → `siguienteTickMundo()` (reloj local) y el tick del autor se pierde → el árbitro nunca rechaza.

**Cambio (sin tocar el contrato de deltas, solo el transporte):**
1. El tick del autor **viaja** en los mensajes que materializan una edición (se adjunta al emitir; el emisor ya lo tiene en el delta con el que aplicó).
2. El receptor aplica el delta con `tick: msg.tick` si existe; mensajes sin tick (cliente viejo) → fallback hoy (re-sello local). Sin ruptura al mezclar versiones.
3. `ArbitroDeltas`/`resolverLWW` intactos — lo único que cambia es qué tick entra.
4. El host persiste el delta con el tick de su autor original: replay en Firestore ≡ lo que vieron los clientes.
5. Skew de relojes aceptado y documentado (mitiga autoridad de host + floor `Date.now()`); reloj lógico global descartado (exigiría un handshake entre clientes); se revalora si se observan pérdidas reales.
6. TDD: `arbitroDeltas.helpers.spec.ts` ampliado (antiguo tras nuevo → rechazado; tick de mensaje → aceptado; mensaje sin tick → comportamiento de fase 1).

**Impacto en cuota: cero.** Es el canal WebRTC (gratis) el que difunde el runtime; Firestore sigue siendo depositario asíncrono con las mismas escrituras que fase 1 (1 por edición aceptada, host only) — presupuesto: 1 escritura por delta aceptado · 1 snapshot por salida de nodo · compaction por lote.

---

## Sección 3 — Persistencia completa + casa duradera (APROBADA 2026-10-10)

**(a) La burbuja gobierna la sim, no la persistencia.** `enBurbujaSim` sigue validando SIM (IA de enemigos, decisiones de entidades); las **ediciones interactivas** (cavar, recoger, crear comida, escenario) pasan en cualquier celda del nodo por el único recorrido: `construirDelta` → `aplicarDeltaAutorizado` → árbitro → WebRTC → (host) Firestore.

**(b) Tipo `escenario` cableado.** El cambio `{ tipo:'escenario', tipoEscenario, estado }` existe en `mundo.ts`/`aplicarDelta` pero nadie lo produce. Regla: toda mutación de `tipoEscenario/estadoEscenario` pasa por delta (prohibida la mutación directa de la celda). Wiring: productores → `aplicarDeltaAutorizado` (arbitraje + difusión + persistencia gratis).

**(c) Casa duradera (solo).** La casa es un nodo personal bajo el contrato `mundos` espejado a `localStorage` (`mazerpg.mundo.<nodoIdCasa>`; higiene `housing.ts`: clave fija, try/catch de cuota, evicción legacy):
- Reanudar (UTILIZAR CASA): base `casaPrevia` → replay de sus deltas persistidos → overlay snapshot ⇒ el estado editado *es* la casa.
- Guardar: en cada aplicación (debounce) y al salir/cerrar se persiste el estado resultado; **con estado persistido el nodo NO se regenera** (regen solo al CREAR UNA NUEVA, que resetea el doc).
- Firebase: la casa se persiste en `mundos` de la partida del dueño-host; invitados la reciben por WebRTC; dueño fuera de línea ⇒ puerta inactiva (fase 1 estricta, sin cambios). **Política LWW adicional**: en nodos personales solo se aceptan deltas con `autoria == ownerId` (visita no escribe; protege semántica y cuota).

**(d) Presupuesto**: inalterado — 1 escritura por edición aceptada + 1 snapshot por salida de nodo + compaction por lote; el espejo local de casa es 0 cuota Firebase.

---

## Sección 4 — Enemigos por-nodo + arte para huéspedes (APROBADA 2026-10-10)

**(a) Enemigos: snapshot, no deltas.** Al SALIR del nodo el host fotografia `{ id, fila, columna, estaVivo, vidaActual, ... }` en `snapshot.enemigos` (formato versionado) — 1 escritura por cruce, nunca por tick. Al volver: se restaura la foto (muertos siguen muertos, posiciones congeladas fuera de la burbuja); nodo sin foto ⇒ siembra por `gen` como hoy. LWW de enemigos es por nodo y host-only (un nodo jamás tiene dos escritores).

**(b) `serializarMapa` v2.** Se conserva el bloque base36 de muros/transitable y se añaden (append) secciones opcionales con marcador de formato: secciones dispersas (sparse) de triples `(f,c,val)` base36 — `S`=`sueloDecor`, `D`=`mueble`, `E`=`tipoEscenario/estadoEscenario`. Receptor viejo ignora secciones (retrocompat); receptor nuevo rehidrata (los setters ya existen en `Celda.rehidratar`). Casa 9×16 ⇒ decenas de bytes.

**(c) Presupuestos de rendimiento (batuta 2026-10-10) — medibles con tests**, no sensaciones:
- La serialización NO está en el bucle de juego: solo eventos (cruce de nodo, delta ~50–100 B, snapshot de cruce ~1–3 KB).
- Mapa 60×60 ≈ 3,6 KB base36; encode/decode = O(3600) ≈ 2–4 ms peor caso — una vez por cruce (el repintado del Renderer que el cruce ya dispara cuesta más).
- **Microbenchmarks con aserción** en el runner: decode 60×60 v2 ≤ 5 ms · encode nodo + snapshot enemigos ≤ 10 ms. Una serialización futura que engorde rompe el test antes que el framerate.

**(d) Hueco que cierra el esquema**: hoy NO existe tipo de delta para mueble/decor (la casa se edita pero su edición no tiene delta). Se añade `DeltaCambio '{ tipo:'decor'; campo:'sueloDecor' | 'mueble'; valor: string }'` — la casa duradera de S3 depende de esto (la sección 3c lo presupone).

---

## Sección 5 — Hardening de reglas Firestore (APROBADA 2026-10-10)

**(a) Límite honesto**: sin Auth no hay identidad → las reglas no autentican; limitan daño automatizado (forma y tamaño de campos) y CIERRAN el resto del árbol. Hoy el repo no tiene `firestore.rules` y CI no las despliega: corre el proyecto con reglas laxas de consola y `projectId` público ⇒ riesgo real de quemado de cuota y lectura/escritura de partidas por terceros. El remedio contra abuso sofisticado (App Check) queda anotado para fase 3.

**(b) Ruleset en repo** (`firestore.rules`): solo el árbol `partidas/{pid}` con `pid.matches('^[a-zA-Z0-9_-]{4,40}$')`; validación de campos de partida (hostId/hostNick string acotado, numJugadores entero, estado) y tamaño (`request.resource.data.size() < 1024` en partida, < 4 KiB en subdocs de conexión/delta); `match /{document=**} { allow read, write: if false; }` para todo lo demás. Antes de escribirlo se verificarán las formas REALES que `FirebaseManager` escribe (las reglas calcan lo existente).

**(c) Despliegue**: paso `firebase deploy --only firestore:rules` en ambos workflows con la SA de deploy; si la SA carece de permisos de despliegue de reglas, gestionar el rol correspondiente en consola IAM o desplegar manualmente puntual por batuta (verificar en el plan el rol mínimo necesario). Tras desplegar, validación del mando en navegador es parte del criterio de aceptación; fricción ⇒ batuta relaja la regla concreta.

**(d) API key web (secundario)**: restricción por dominio (`…web.app`, `…firebaseapp.com`, dominio Pages) como represivo documentado — la valla real son las reglas.

## Sección 6 — Pruebas y verificación (APROBADA 2026-10-10)

TDD como fase 1 (specs junto al módulo, runner `pnpm test`):
- **LWW real**: antiguo-tras-nuevo → rechazado · tick de mensaje → aceptado · mensaje sin tick → comportamiento fase 1.
- **`escenario` y `decor`**: producidos → aplicados → persistidos (nada muta la celda directa).
- **Replay determinista**: gen + deltas (orden por tick) + snapshot ⇒ mundo idéntico.
- **Casa espejo**: editar → guardar → reanudar → estado intacto; cuota llena → degrada sin crash.
- **Enemigos por-nodo**: salir → foto; volver → restauración (muertos siguen muertos); gen cuando no hay foto.
- **`serializarMapa` v2**: round-trip + receptor v1 sin crash con secciones nuevas.
- **Microbenchmarks con aserción**: decode 60×60 v2 ≤ 5 ms · encode nodo+snapshot ≤ 10 ms.
- **Smoke headless 2 clientes**: host edita fuera de burbuja → invitado lo ve; arte/escenario de casa idénticos; misma celda desde ambos → gana el nuevo; recarga → mundo y casa duraderos.
- **Muro de calidad**: `tsc` 0 · `pnpm test` verde · `build` OK · `verify_sprites` 71/0 · CI verde.
- **Aceptación del mando en navegador**: casa duradera solo · LWW visible a 2 jugadores · invitado pinta arte/escenario · reglas desplegadas sin fricción · uso diario ~2–5 % en consola.

**Estado**: secciones 1–6 TODAS aprobadas (2026-10-10). Siguiente paso del artefacto: autorrevisión + revisión del mando + plan de implementación (`docs/superpowers/plans/`).
