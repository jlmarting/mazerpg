# LEARN: Serialización Compacta con Bitmasking + Base36

## Concepto

Cuando el host genera un laberinto y necesita enviarlo a los invitados por WebRTC, el tamaño del mensaje importa. Los canales `RTCDataChannel` tienen límites prácticos (~256 KiB por mensaje SCTP) y paquetes grandes aumentan la latencia de sincronización inicial. La solución: **comprimir cada celda del mapa en un único dígito base36**, donde cada bit de ese dígito representa una propiedad booleana de la celda (muros, transitabilidad).

El resultado es una cadena de texto extremadamente compacta: un mapa de 50×50 celdas (2500 celdas) ocupa solo **2506 caracteres** (6 para dimensiones + 2500 para datos), frente a los ~50,000+ caracteres que ocuparía un JSON estándar con propiedades nombradas.

## Por qué es importante

- **Eficiencia de red**: un mapa completo cabe en un solo mensaje WebRTC sin fragmentación.
- **Velocidad de parseo**: no hay que parsear JSON anidado. Es una iteración lineal sobre caracteres con operaciones bitwise.
- **Determinismo**: la serialización y deserialización son puras funciones matemáticas. Mismo mapa = misma cadena, siempre.
- **Independencia del formato**: no depende de `JSON.stringify`, que podría cambiar de orden de claves entre navegadores o versiones.

## Explicación sencilla

Imagina que necesitas enviar por carta la descripción de una **cuadrícula de casillas** a un amigo, pero el correo cobra por carácter. En lugar de escribir:

> "La casilla (0,0) tiene muro arriba: sí, muro derecha: no, muro abajo: sí, muro izquierda: no, transitable: sí. La casilla (0,1) tiene..."

Usas un **código numérico** de una sola cifra por casilla, donde:
- Primer bit = muro arriba
- Segundo bit = muro derecha
- Tercer bit = muro abajo
- Cuarto bit = muro izquierda
- Quinto bit = ¿es transitable?

Cada casilla se convierte en un número del 0 al 31. Luego escribes esos números en **base36** (0-9, a-z), que es la base más alta que JavaScript puede parsear nativamente sin librerías.

Un mapa de 100 casillas se convierte en 100 caracteres. Tu amigo recibe la carta, lee carácter por carácter, y reconstruye la cuadrícula perfectamente.

## Ejemplo práctico

### 1. Cómo funciona el bitmasking (`world/serialization.ts`)

```typescript
export function serializarMapa(mapaLaberinto: Celda[][]): string {
    let resultado = "";
    const filas = mapaLaberinto.length;
    const columnas = filas > 0 ? mapaLaberinto[0].length : 0;

    // === CABECERA: dimensiones en base36 (3 dígitos cada una, zero-padded) ===
    resultado += filas.toString(36).padStart(3, '0');    // ej. "02y" para 101 filas
    resultado += columnas.toString(36).padStart(3, '0'); // ej. "02y" para 101 columnas

    for (let f = 0; f < filas; f++) {
        for (let c = 0; c < columnas; c++) {
            const celda = mapaLaberinto[f][c];
            let valor = 0;

            // === BITMASKING: cada propiedad booleana es un bit ===
            if (celda.muros.superior)   valor |= 1;   // bit 0: 00001
            if (celda.muros.derecho)    valor |= 2;   // bit 1: 00010
            if (celda.muros.inferior)   valor |= 4;   // bit 2: 00100
            if (celda.muros.izquierdo)  valor |= 8;   // bit 3: 01000
            if (celda.esTransitable)    valor |= 16;  // bit 4: 10000

            // Convertir a un solo carácter base36 (0-9, a-z)
            resultado += valor.toString(36);
        }
    }
    return resultado;
}
```

**Qué está pasando aquí**:
- `valor |= 1`, `valor |= 2`, etc. son operaciones **bitwise OR**. Encienden bits individuales en un número entero.
- Con 5 propiedades booleanas, el valor máximo es `11111` en binario = `31` en decimal. Eso cabe en un solo dígito base36 (`31.toString(36) = 'v'`).
- Las dimensiones se codifican en 3 caracteres base36 cada una. `999.toString(36) = 'rr'`, así que 3 dígitos permiten mapas de hasta `36³ - 1 = 46655` celdas de lado. Suficiente para cualquier juego 2D.

### 2. Ejemplo concreto de una celda

```typescript
// Celda con: muro arriba=SÍ, derecha=NO, abajo=SÍ, izquierda=NO, transitable=SÍ
// Bits: superior(1) | derecho(0) | inferior(1) | izquierdo(0) | transitable(1)
// = 1 + 0 + 4 + 0 + 16 = 21 en decimal
// 21.toString(36) = 'l'

// Celda completamente cerrada y no transitable:
// Bits: 1 | 2 | 4 | 8 | 0 = 15 en decimal
// 15.toString(36) = 'f'

// Celda abierta por todos lados y transitable:
// Bits: 0 | 0 | 0 | 0 | 16 = 16 en decimal
// 16.toString(36) = 'g'
```

### 3. Deserialización: reconstruir el mapa desde la cadena

```typescript
export function deserializarMapa(
    mapaLaberinto: Celda[][],
    datos: string
): { filas: number, columnas: number } {
    let i = 0;

    // === LEER CABECERA ===
    const filas = parseInt(datos.substring(i, i + 3), 36); i += 3;
    const columnas = parseInt(datos.substring(i, i + 3), 36); i += 3;

    // Redimensionar la matriz si es necesario
    if (mapaLaberinto.length !== filas) {
        mapaLaberinto.length = filas;
    }

    for (let f = 0; f < filas; f++) {
        for (let c = 0; c < columnas; c++) {
            // Leer un carácter y convertir de base36 a entero
            const valor = parseInt(datos[i++], 36);

            if (!mapaLaberinto[f]) mapaLaberinto[f] = [];
            if (!mapaLaberinto[f][c]) mapaLaberinto[f][c] = new Celda(f, c);

            const celda = mapaLaberinto[f][c];

            // === BITMASKING INVERSO: extraer cada bit ===
            celda.muros.superior  = !!(valor & 1);   // bit 0
            celda.muros.derecho     = !!(valor & 2);   // bit 1
            celda.muros.inferior    = !!(valor & 4);   // bit 2
            celda.muros.izquierdo   = !!(valor & 8);   // bit 3
            celda.esTransitable     = !!(valor & 16);  // bit 4
        }
    }
    return { filas, columnas };
}
```

**Qué está pasando aquí**:
- `parseInt(datos[i++], 36)` convierte un carácter base36 a entero. `'g'` → 16, `'l'` → 21, etc.
- `!!(valor & 1)` usa **bitwise AND** para extraer un bit específico. `21 & 1 = 1` → `true`. `21 & 2 = 0` → `false`.
- La matriz se redimensiona dinámicamente. Si el receptor ya tiene un mapa de 20×20 y recibe uno de 30×30, se expande sin perder referencias.

### 4. Comparativa de tamaños

| Formato | Mapa 20×20 | Mapa 50×50 | Mapa 100×100 |
|---------|-----------|-----------|-------------|
| JSON completo (con nombres) | ~8,000 chars | ~50,000 chars | ~200,000 chars |
| JSON minificado | ~3,000 chars | ~18,750 chars | ~75,000 chars |
| **Base36 + bitmask** | **406 chars** | **2,506 chars** | **10,006 chars** |

**Factor de compresión**: ~20× respecto a JSON completo, ~7× respecto a JSON minificado.

### 5. Uso en el flujo multijugador (`main.ts`)

```typescript
// Host genera y envía el mapa al invitado
async iniciarPartida() {
    this.initMap();  // Genera el laberinto
    const mapaSerializado = serializarMapa(this.mapaLaberinto);

    // Enviar por WebRTC (RTCDataChannel)
    this.network.enviarMensaje({
        tipo: 'mapa',
        datos: mapaSerializado
    });
}

// Invitado recibe y deserializa
procesarMensajeMultiplayer(msg: any) {
    if (msg.tipo === 'mapa') {
        deserializarMapa(this.mapaLaberinto, msg.datos);
        console.log(`Mapa recibido: ${msg.datos.length} caracteres`);
    }
}
```

**Qué está pasando aquí**:
- Un mapa de 50×50 se envía en ~2.5 KB. En una conexión WebRTC con throughput de ~100 KB/s, la transferencia tarda ~25 ms. Imperceptible.
- Si usáramos JSON, el mismo mapa tardaría ~500 ms en transferirse, provocando una pantalla de carga visible.

---

### Tabla de asignación de bits

| Bit (máscara) | Propiedad | Valor decimal | Descripción |
|---------------|-----------|---------------|-------------|
| `& 1` (2⁰) | `muros.superior` | 1 | Muro en el borde superior de la celda |
| `& 2` (2¹) | `muros.derecho` | 2 | Muro en el borde derecho de la celda |
| `& 4` (2²) | `muros.inferior` | 4 | Muro en el borde inferior de la celda |
| `& 8` (2³) | `muros.izquierdo` | 8 | Muro en el borde izquierdo de la celda |
| `& 16` (2⁴) | `esTransitable` | 16 | La celda se puede pisar (suelo) |

**Valor máximo**: `1 + 2 + 4 + 8 + 16 = 31` → `'v'` en base36.

## Consejo pro

### 1. Añade más bits para propiedades futuras

Todavía quedan 4 bits libres en un dígito base36 (valores 32–35). Si en el futuro necesitas guardar:
- `tieneTrampa` (bit 5, valor 32)
- `tienePortal` (bit 6, valor 64 → ya no cabe en un dígito)

Para valores > 31 necesitas dos dígitos por celda (base36 puede representar hasta 1295 en 2 dígitos). El cambio es trivial: `valor.toString(36).padStart(2, '0')`.

### 2. Comprime aún más con Run-Length Encoding (RLE)

Si tu mapa tiene grandes zonas de "muro completo" o "suelo vacío", añade RLE sobre el base36:

```typescript
// En lugar de: "fffffffff" (9 muros)
// Envía: "9f" (9 veces 'f')

function serializarConRLE(mapa: Celda[][]): string {
    const base = serializarMapa(mapa);
    let rle = "";
    let count = 1;
    for (let i = 1; i < base.length; i++) {
        if (base[i] === base[i - 1] && count < 35) {
            count++;
        } else {
            rle += (count > 1 ? count.toString(36) : '') + base[i - 1];
            count = 1;
        }
    }
    rle += (count > 1 ? count.toString(36) : '') + base[base.length - 1];
    return rle;
}
```

En mapas con muchos muros (como los generados por BSP), esto puede reducir el tamaño adicionalmente un 30-50%.

### 3. Valida la integridad con checksum

Para evitar corrupción de datos en transit, añade un checksum simple al final:

```typescript
function serializarMapaConChecksum(mapa: Celda[][]): string {
    const payload = serializarMapa(mapa);
    let checksum = 0;
    for (const char of payload) {
        checksum += char.charCodeAt(0);
    }
    return payload + checksum.toString(36).padStart(4, '0');
}
```

### 4. No intentes comprimir con gzip en el cliente

WebRTC ya comprime los datos del `RTCDataChannel` internamente con SCTP. Añadir gzip manual en JavaScript solo consume CPU sin beneficio real. El bitmasking + base36 es suficiente.

### 5. Documenta la asignación de bits

Si cambias la asignación de bits (por ejemplo, añades `tienePico` como bit 5), **todas** las versiones del juego deben estar sincronizadas. Considera añadir un campo `version` a la cabecera:

```typescript
resultado += "01"; // Versión del formato de serialización
```

> **Regla de oro**: cuando envíes datos por red, cada byte cuenta. El bitmasking te permite empacar 5 booleanos en 5 bits (0.625 bytes). Base36 te permite representar esos 5 bits en un solo carácter legible. Es la compresión más simple y efectiva para estados de celdas.
