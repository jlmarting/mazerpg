# Servidor local de signaling

Servidor HTTP mínimo para el modo **Servidor Local** del multijugador. Sustituye a
Firebase durante el desarrollo: señaliza WebRTC (offer/answer/ICE) y mantiene el
lobby de partidas en memoria. Sin dependencias npm, sin autenticación, sin
persistencia.

El cliente que lo consume es `src/network/SignalingClient.ts`, que habla con
`http://<host>:8080` mediante `fetch`.

## Arranque

```bash
node server/signaling.mjs
# o, vía script:
pnpm signaling
```

- Escucha en `0.0.0.0`.
- Puerto configurable con la variable de entorno `PORT` (por defecto **8080**).

## Tests

```bash
node server/signaling.spec.mjs
# o, vía script:
pnpm test:server
```

El spec arranca el servidor en un puerto efímero y ejerce la API HTTP real con
`fetch`.

## API

Todas las respuestas son JSON y llevan cabeceras CORS abiertas
(`Access-Control-Allow-Origin: *`). `OPTIONS` responde `204`.

| Método   | Ruta                              | Descripción |
|----------|-----------------------------------|-------------|
| `POST`   | `/partidas`                        | Crea una partida. Cuerpo `{hostId, hostNick, nombre?}`. Devuelve `{id}`. |
| `GET`    | `/partidas`                        | Lista partidas activas. Purga las caducadas (>60 s sin heartbeat). Devuelve `{partidas:[...]}`. |
| `POST`   | `/partidas/:id/hb`                 | Heartbeat. Cuerpo `{numJugadores}`. |
| `POST`   | `/partidas/:id/guests`             | Registra un guest. Cuerpo `{guestId, nick}`. |
| `GET`    | `/partidas/:id/guests`             | Lista guests. Devuelve `{guests:[{guestId,nick}]}`. |
| `DELETE` | `/partidas/:id/guests/:gid`        | Elimina un guest. |
| `POST`   | `/signal/:partida/:from`          | Envía señal dirigida. Cuerpo `{toId, payload:{type,data}}`. |
| `GET`    | `/signal/:partida/:peer`          | Entrega y vacía la bandeja del peer. Devuelve `{senales:[{fromId,type,data}]}`. |

Errores: ruta desconocida o `:id` de partida inexistente → `404`; cuerpo JSON
inválido → `400`; cuerpo vacío se trata como `{}`.

## Ciclo de vida

- Expiración: una partida sin heartbeat durante ~60 s se elimina de forma
  perezosa al llamar a `GET /partidas`.
- El estado vive solo en memoria: al reiniciar el proceso se pierde todo.
