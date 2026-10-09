# Flujo de pantallas: modo primero

- **Estado**: En discusión
- **Fecha**: 2026-10-09
- **Fuente**: directriz humana (chat 2026-10-09) — lobby actual raro: Crear personaje → Reanudar + crear/unirse/unjugador/conexión
- **Dependencias**: ninguna (reutiliza modales de personaje/dificultad/QR y lista actuales)

## Contexto

El lobby actual (`index.html#lobbyInitial`, `src/ui/LobbyManager.ts`) exige personaje antes de mostrar opciones y mezcla en una pantalla: REANUDAR + toggle FIREBASE/SERVIDOR LOCAL + CREAR PARTIDA / UNIRSE A PARTIDA / MODO UN JUGADOR / CONEXIÓN MANUAL. Es confuso: el jugador no elige primero a qué va a jugar.

Objetivo acordado: Paso 1 elegir modo → Paso 2 personaje (recuperar o crear) → Paso 3 crear o unirse (lista + código + espera de aceptación). Nombres: multijugador = Firebase, cooperativo = WebRTC manual (renombra CONEXIÓN MANUAL), un jugador = local sin red. Servidor Local se mantiene visible (decisión batuta 2026-10-09).

## Propuesta

Wizard por pasos en `LobbyManager` (opción A aprobada):

```
modo → personaje → accion → browser | espera → juego
```

- **modo** (`div#lobbyModo`, nuevo): 4 tarjetas UN JUGADOR / MULTIJUGADOR (Firebase) / SERVIDOR LOCAL / COOPERATIVO (manual). Desaparece el toggle Firebase/Local. REANUDAR queda como botón global arriba si hay `localStorage mazeRPG_lastSession`.
- **personaje** (`div#lobbyPersonaje`, nuevo): si hay personaje guardado, tarjeta + CONTINUAR CON [nombre] y CREAR NUEVO (abre modal actual); si no, solo CREAR NUEVO. Al guardar vuelve a `accion`.
- **accion** (`div#lobbyAccion`, nuevo, rellenado por JS según `selectedMode`): solo → EMPEZAR (→ dificultad → `onStartSolo`); multijugador/local → NUEVA PARTIDA (→ dificultad → `onHostGame`) / UNIRSE (→ browser); cooperativo → HOST (→ dificultad → oferta manual) / INVITADO (→ panel guest actual).
- **browser** (`#lobbyFirebase` extendido): lista actual + campo `#joinCodeInput` + `#btnJoinByCode`. Al unirse: overlay `connecting` ("Esperando al host…") + CANCELAR → `onCancelConnect` vuelve al browser con lista recargada.
- **Flujo de datos**: crear reutiliza `crearPartidaFirestore` (`generateSessionName()` tipo `perro-valiente`, `src/utils/session.ts`) o `crearPartidaHttp`; unirse reutiliza `onJoinGame(id, modo)` + `setupWebRTCGuest`; el host admite con ADMITIR JUGADORES como hoy; solo → `guardarSesion('solo')`; reanudar → `reanudarPartida()` por rol guardado.
- **Archivos**: `index.html` (3 divs + campo código + renombre), `src/ui/LobbyManager.ts` (`LobbyView = modo|personaje|accion|manual|browser|connecting`, `selectedMode: solo|firebase|http|cooperativo` — cooperativo mapea al `'manual'` existente del delegate, sin cambiar su firma —, `showModo/showPersonaje/showAccion`, `joinByCode()` que reutiliza `onJoinGame(codigo, modo)`, eliminar `toggleServerMode`), `src/main.ts` (delegate deriva modo del wizard, `onCancelConnect` vuelve a browser), `src/style.css` (tarjetas de modo + fila código, reutilizando `btn-*`).
- **Errores**: Firebase sin configurar → aviso actual + NUEVA/UNIRSE deshabilitados en ese modo; código/sala inválida o caducada (>60 s heartbeat) → error inline + vuelta a lista; P2P sin admitir → CANCELAR siempre visible + timeout blando 60 s; sin personaje no se llega a ACCIÓN; servidor local caído → mensaje actual.
- **Pruebas**: `pnpm tsc --noEmit` + `pnpm build` en verde; manual: solo, nueva multijugador, unirse por lista y por código + CANCELAR, cooperativo host/invitado, reanudar, aviso Firebase. Sin harness nuevo (el repo no tiene tests).

## Consecuencias

- **Positivas**: flujo modo-primero pedido; campo código + espera cubren "introducir código y esperar a ser aceptado"; cooperativo renombrado; servidor local sigue visible; sin cambios de protocolo red.
- **Negativas**: toca 4 archivos (`index.html`, `LobbyManager.ts`, `main.ts`, `style.css`); interfaz `LobbyDelegate` crece (`selectedMode`, `joinByCode`); hay que migrar el estado inicial del lobby.
- **Riesgos**: regresión del lobby si alguna vista vieja (`lobbyInitial`, toggle) queda referenciada; mitigación: `pnpm build` + checklist manual de 6 casos.

## Alternativas consideradas

- **B — Reorden mínimo**: reagrupar botones en `lobbyInitial` sin wizard. Descartada: barata pero no cumple "modo primero", código+espera quedarían como parche.
- **C — Paneles independientes por modo**: un div/flujo por modo. Descartada: duplica personaje/lista, más mantenimiento.

## Referencias

- `index.html` (líneas 115-161 lobby actual, 163-211 manual+browser)
- `src/ui/LobbyManager.ts` (vistas, delegate, `loadGameList`, `showConnecting`)
- `src/main.ts` (`onHostGame`, `onJoinGame`, `onStartSolo`, `reanudarPartida`)
- `src/utils/session.ts` (`generateSessionName`)
- `docs/usuario.md` §2-4 (flujo actual documentado en vault)
