# LEARN: Introducción a WebRTC para juegos multijugador

## Concepto

WebRTC (Web Real-Time Communication) es una suite de protocolos y APIs del navegador que permite la comunicación directa entre dos o más pares (*peers*) sin depender de un servidor central para retransmitir datos. Aunque se hizo famosa por videollamadas, su verdadero potencial para los juegos reside en **`RTCDataChannel`**: un canal de datos binario/texto sobre SCTP (Stream Control Transmission Protocol) que ofrece una semántica similar a UDP pero con la fiabilidad opcional de TCP, todo encapsulado dentro de una conexión cifrada por DTLS.

Para que dos navegadores hablen directamente, WebRTC debe resolver tres problemas fundamentales:

1. **Descubrimiento de rutas (ICE)**: Los navegadores están típicamente detrás de NATs y firewalls. Necesitan averiguar qué rutas de red son viables para alcanzar al otro par.
2. **Negociación de capacidades (SDP)**: Ambos lados deben ponerse de acuerdo en qué protocolos, códecs y parámetros de red usarán.
3. **Intercambio inicial de mensajes (Signaling)**: Los dos puntos anteriores requieren intercambiar información antes de que la conexión P2P exista. Ese intercambio se hace por un canal auxiliar: el *signaling*.

Una vez resueltos estos tres problemas, los datos fluyen directamente entre navegadores sin pasar por servidores intermedios.

## Por qué es importante

- **Baja latencia**: una vez establecida la conexión, los paquetes viajan por la ruta más corta posible entre dos jugadores. No hay "viaje de ida y vuelta" a un datacenter central.
- **Reduce costes de infraestructura**: no necesitas un servidor dedicado retransmitiendo el estado del juego a todos los clientes. El host puede enviar snapshots directamente por el canal P2P a cada invitado.
- **Resiliencia a cortes del backend de señalización**: si el servidor de signaling (Firebase, HTTP, etc.) cae *después* de que la conexión P2P se ha establecido, la partida continúa. El signaling solo se necesita para el handshake inicial.
- **Funciona en el navegador**: sin plugins, sin descargas, sin dependencias externas para el jugador. Es una API nativa de JavaScript.
- **Seguridad por defecto**: todos los datos del `RTCDataChannel` viajan cifrados mediante DTLS (Datagram Transport Layer Security). No necesitas implementar TLS a mano.

## Explicación sencilla

Imagina que dos amigos, Ana y Bruno, viven en edificios distintos y quieren pasarse notas directamente sin usar el servicio postal (el servidor). El problema es que ambos edificios tienen **porteros automáticos** (NATs) que no dejan entrar a extraños, y además no se conocen las direcciones exactas de sus balcones.

### Paso 1: Averiguar dónde viven (STUN)

Ana y Bruno contactan con un **servidor de referencia** (STUN) que les dice: "tú, desde fuera de tu edificio, eres visible en la Calle Mayor, número 42, piso 3" (su IP pública y puerto). Ahora cada uno sabe cómo encontrar al otro desde fuera.

### Paso 2: Intercambiar los planos (SDP Offer/Answer)

Ana dibuja un **plano** (SDP Offer) que dice: "yo te puedo recibir en mi balcón 3B, uso sobres tamaño A4, y hablo en español". Se lo manda a Bruno a través de un **mensajero** (signaling). Bruno responde con otro plano (SDP Answer): "vale, yo te recibo en el balcón 5A, uso sobres A4, y también hablo español".

### Paso 3: Probar rutas alternativas (ICE Candidates)

Resulta que el edificio de Bruno tiene una **valla de obra** (firewall corporativo) y no se puede acceder directamente por la Calle Mayor. Bruno prueba otras entradas: la puerta trasera, el garaje, el patio interior... cada una es un **candidato ICE**. Le va enviando a Ana, y ella prueba cuál funciona.

### Paso 4: La conexión directa (P2P)

Cuando encuentran una ruta que funciona, el mensajero se va a casa. Ana y Bruno ya pueden pasarse notas directamente por el balcón. Nadie más interviene.

---

## Ejemplo práctico

Veamos, paso a paso, cómo se materializa esto en código real. Usaremos fragmentos inspirados en nuestro proyecto (`NetworkManager.ts` y `NetworkManagerHttp.ts`).

### 1. Crear la conexión

```typescript
// Configuración mínima: un servidor STUN público para descubrir nuestra IP externa
const config: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

const pc = new RTCPeerConnection(config);
```

**Qué está pasando aquí**:
- `RTCPeerConnection` es el objeto central. Gestiona todo el ciclo de vida: recolección de candidatos ICE, negociación SDP, establecimiento del túnel DTLS y, finalmente, la transmisión de datos.
- `iceServers` le dice al navegador: "pregunta a este servidor STUN cuál es mi IP pública". Sin esto, dos navegadores detrás de routers domésticos nunca se encontrarían.

### 2. Abrir un canal de datos

```typescript
// El host (quien inicia la conexión) crea el canal de datos
const dc = pc.createDataChannel("mazeRPG", {
  ordered: true,        // Garantiza que los mensajes lleguen en orden
  maxRetransmits: 3     // Reintenta 3 veces antes de declarar un mensaje perdido
});
```

**Qué está pasando aquí**:
- `createDataChannel` abre un canal bidireccional etiquetado con un nombre ("mazeRPG"). Puedes tener múltiples canales en la misma conexión.
- `ordered: true` es útil para mensajes de juego donde el orden importa (movimientos, ataques). Si necesitas mínima latencia y no te importa el orden (posiciones periódicas), usa `ordered: false`.
- `maxRetransmits` limita cuántas veces SCTP reintentará un paquete. Para datos críticos (vida, muerte) puedes dejar el valor por defecto. Para datos frecuentes (posición), puedes bajarlo o desactivarlo.

### 3. El invitado recibe el canal

```typescript
// El invitado no crea el canal; lo recibe cuando el host lo abre
pc.ondatachannel = (event) => {
  const dc = event.channel;

  dc.onopen = () => {
    console.log("Canal de datos abierto. Conexión P2P lista.");
  };

  dc.onmessage = (evento) => {
    const mensaje = JSON.parse(evento.data);
    console.log("Recibido:", mensaje);
    // Aquí procesarías el mensaje del juego
  };

  dc.onclose = () => {
    console.log("Canal cerrado. El peer se ha desconectado.");
  };
};
```

**Qué está pasando aquí**:
- En WebRTC, el canal de datos tiene un creador (host) y un receptor (invitado). Solo el creador llama `createDataChannel`; el otro lo recibe vía el evento `ondatachannel`.
- `onopen` se dispara cuando el handshake SCTP ha completado. **A partir de este momento, no necesitas más signaling.**
- `onmessage` recibe datos como `string`, `Blob`, `ArrayBuffer` o `ArrayBufferView`.

### 4. Negociar la conexión: Oferta y Respuesta

```typescript
// ======= HOST =======
async function crearOferta(pc: RTCPeerConnection) {
  // El host genera una descripción de sesión (SDP) con sus capacidades
  const offer = await pc.createOffer();

  // El host "fija" su descripción local. A partir de aquí, el navegador
  // empieza a buscar candidatos ICE (rutas posibles hacia el host).
  await pc.setLocalDescription(offer);

  // La oferta (un string SDP con ~20 líneas de texto) se envía al invitado
  // a través del canal de signaling (Firebase, HTTP, WebSocket...)
  enviarPorSignaling({ type: 'offer', sdp: offer.sdp });
}

// ======= INVITADO =======
async function recibirOfertaYResponder(pc: RTCPeerConnection, offerSdp: string) {
  // El invitado recibe la oferta y la establece como su descripción REMOTA
  await pc.setRemoteDescription(new RTCSessionDescription({
    type: 'offer',
    sdp: offerSdp
  }));

  // El invitado genera su respuesta y la fija como descripción local
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  // La respuesta vuelve al host por signaling
  enviarPorSignaling({ type: 'answer', sdp: answer.sdp });
}

// ======= HOST (recibe respuesta) =======
async function recibirRespuesta(pc: RTCPeerConnection, answerSdp: string) {
  await pc.setRemoteDescription(new RTCSessionDescription({
    type: 'answer',
    sdp: answerSdp
  }));
  // Ahora ambos navegadores tienen una descripción local y una remota.
  // El motor ICE empieza a probar candidatos para encontrar la mejor ruta.
}
```

**Qué está pasando aquí**:
- `createOffer()` genera un SDP (Session Description Protocol): un documento de texto que describe qué protocolos de transporte, qué códecs (en caso de media) y qué parámetros de red soporta el navegador.
- `setLocalDescription()` le dice al navegador: "este es mi plano". Inmediatamente después, el agente ICE empieza a contactar con los `iceServers` para descubrir candidatos.
- `setRemoteDescription()` le dice al navegador: "este es el plano del otro". Hasta que no recibe esto, no puede empezar a emparejar candidatos.
- **Orden crítico**: primero `setLocalDescription(offer)`, luego enviar la oferta por signaling, luego el invitado hace `setRemoteDescription(offer)` → `createAnswer()` → `setLocalDescription(answer)`, luego envía la answer, y finalmente el host hace `setRemoteDescription(answer)`.

### 5. Intercambio de candidatos ICE

```typescript
// Ambos lados (host e invitado) generan candidatos ICE
pc.onicecandidate = (event) => {
  if (event.candidate) {
    // Cada candidato es un objeto JSON con: candidate, sdpMid, sdpMLineIndex
    // Lo enviamos al otro peer por el canal de signaling
    enviarPorSignaling({
      type: 'ice',
      candidate: event.candidate.toJSON()
    });
  } else {
    // event.candidate === null significa: "ya no hay más candidatos"
    console.log("Recolección de candidatos ICE completada");
  }
};

// ======= En el receptor del candidato =======
function recibirCandidatoIce(pc: RTCPeerConnection, candidateJson: any) {
  // ¡Importante! No podemos añadir candidatos hasta tener la descripción remota
  if (pc.remoteDescription) {
    pc.addIceCandidate(new RTCIceCandidate(candidateJson));
  } else {
    // Si llegan antes de setRemoteDescription, los guardamos en un buffer
    // temporal. Ver la píldora LEARN "Buffering de candidatos ICE".
    iceBuffer.push(candidateJson);
  }
}
```

**Qué está pasando aquí**:
- Los candidatos ICE son objetos que describen una ruta posible de red: `{ candidate: "candidate:...", sdpMid: "0", sdpMLineIndex: 0 }`.
- Un candidato puede ser de tipo **host** (IP local), **srflx** (IP pública descubierta por STUN) o **relay** (IP de un servidor TURN, usado cuando el P2P directo es imposible).
- `onicecandidate = null` (o dejar de escuchar) cuando el canal de datos se abre evita enviar candidatos innecesarios y ahorra ancho de banda del signaling.

### 6. Enviar y recibir datos del juego

```typescript
// Una vez dc.readyState === "open", ya no hay intermediarios
dc.addEventListener('open', () => {
  console.log("Canal listo. Enviando handshake del juego...");

  const nick = (document.getElementById('nickInput') as HTMLInputElement).value || "Héroe";
  const stats = { fue: 10, agi: 8, int: 5 };

  dc.send(JSON.stringify({
    tipo: 'handshake',
    nick,
    id: idLocal,
    clase: 'guerrero',
    stats
  }));
});

// Recibir mensajes del otro jugador
dc.onmessage = (evento) => {
  try {
    const mensaje = JSON.parse(evento.data);
    // En nuestro juego, delegamos al Game:
    // game.procesarMensajeMultiplayer(mensaje, idEmisor);
    console.log("Mensaje P2P recibido:", mensaje);
  } catch (e) {
    console.error("Error al procesar mensaje P2P:", e);
  }
};
```

**Qué está pasando aquí**:
- `dc.send()` acepta `string`, `Blob`, `ArrayBuffer` o `ArrayBufferView`. Para juegos, `JSON.stringify()` es la opción más sencilla.
- El tamaño máximo de un mensaje SCTP es ~256 KiB en la mayoría de navegadores. Si necesitas enviar más (un mapa completo, por ejemplo), fragmenta en trozos o usa un esquema de referencia (el host dice "tengo el mapa X", y el invitado lo solicita por HTTP si es necesario).

---

### Los tres tipos de candidatos ICE (tabla de referencia)

| Tipo | Cómo se obtiene | Cuándo funciona | Ejemplo real |
|------|-----------------|-----------------|--------------|
| **host** | La IP y puerto local del dispositivo | Cuando ambos peers están en la misma red (LAN) | `192.168.1.45:54321` |
| **srflx** (server reflexive) | El servidor STUN responde "he visto tu paquete salir por esta IP/puerto" | Cuando el router hace NAT pero permite conexiones entrantes | `203.0.113.7:54321` |
| **relay** | Un servidor TURN asigna un puerto propio y retransmite todo | Cuando ambos están en NATs simétricos o firewalls estrictos | `turn.example.com:3478` |

> **Nota**: nuestro juego solo configura un servidor STUN. Para conexiones en redes estrictas (empresas, universidades), necesitarías añadir un servidor TURN. Sin TURN, el ~15% de las conexiones entre usuarios aleatorios fallarán.

---

## Consejo pro

### 1. No confundas signaling con datos

El signaling es el **acuerdo previo** y necesita un transporte cualquiera (Firebase, HTTP, WebSocket, un QR code escaneado con el móvil...). Los datos son el **juego en sí** y viajan por el `RTCDataChannel` sin intermediarios. Por eso en nuestro juego los dos backends de signaling (Firebase y HTTP) acaban creando exactamente el mismo `RTCPeerConnection`: porque el signaling es solo el mensajero que trae el plano del balcón. Una vez construido, el mensajero se va a casa.

### 2. Monitorea el estado de la conexión

```typescript
pc.onconnectionstatechange = () => {
  console.log("Estado de conexión:", pc.connectionState);
  // 'new' -> 'connecting' -> 'connected' -> 'disconnected' -> 'failed' -> 'closed'
};

pc.oniceconnectionstatechange = () => {
  console.log("Estado ICE:", pc.iceConnectionState);
};
```

El estado `connectionState` te dice si el túnel P2P está realmente operativo. `disconnected` suele ser temporal (cambio de red), pero `failed` requiere un `pc.restartIce()` o recrear la conexión.

### 3. Cierra limpiamente al desconectar

```typescript
function desconectar() {
  // 1. Cerrar el canal de datos
  dc.close();
  // 2. Cerrar la conexión peer
  pc.close();
  // 3. Limpiar listeners de signaling
  unsubscribes.forEach(unsub => unsub());
}
```

Si no cierras explícitamente, los recursos del navegador (sockets UDP, hilos de red) pueden quedar colgados. En móviles esto drena batería.

### 4. Trunca el payload de snapshots

Como vimos en la píldora "Host-Authority con Snapshots", cada snapshot envía posición, vida, estado y frame de cada entidad. En un juego con 50 enemigos y 4 jugadores, un snapshot JSON puede pesar 5-10 KB. A 20 ticks/segundo, eso son ~200 KB/s por jugador. Si tienes muchos peers, considera:

- Enviar solo **deltas** (qué cambió desde el último snapshot).
- Usar **ArrayBuffer** en lugar de JSON strings para tipos numéricos fijos.
- Reducir la frecuencia de snapshots a 10 Hz y hacer interpolación/extrapolación en el cliente.

> **Regla de oro**: WebRTC no es magia. Es un acuerdo de dos navegadores para hablar directamente. Todo lo demás (signaling, reintentos, sincronización de estado, gestión de desconexiones) es responsabilidad tuya.
