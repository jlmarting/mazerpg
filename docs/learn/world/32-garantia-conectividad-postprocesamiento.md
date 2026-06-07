# LEARN: Garantía de Conectividad vía Post-procesamiento

## Concepto

Los algoritmos de generación procedural (como BSP) son estocásticos: dependen de `Math.random()` y, aunque la estructura del árbol BSP garantiza que las salas están conectadas entre sí, no garantiza que las **esquinas específicas del mapa** (donde queremos que aparezcan el jugador y el objetivo final) sean transitables. Es posible que `(0,0)` quede dentro de una pared o que `(N-1, M-1)` quede en una sala sin pasillo de salida.

La solución es un **post-procesamiento determinista**: tras generar el dungeon, verificamos explícitamente que las esquinas críticas sean transitables. Si no lo son, forzamos una **ruta directa** desde la esquina hasta la celda transitable más cercana, garantizando así que el jugador siempre puede empezar y siempre puede llegar al final.

## Por qué es importante

- **Jugabilidad**: un juego donde el jugador aparece dentro de una pared es injugable. No puedes dejar esto al azar.
- **Debugging simplificado**: si el mapa falla, sabes que el problema está en el post-procesamiento, no en el algoritmo BSP en sí. Separas "generación" de "garantías".
- **Flexibilidad**: puedes añadir nuevas garantías (ej. "siempre hay al menos 3 enemigos", "siempre hay un pico cerca del spawn") sin tocar el generador principal.
- **Reproducibilidad**: el post-procesamiento es determinista dado un mapa. Si el BSP genera el mismo mapa, el post-procesamiento produce el mismo resultado.

## Explicación sencilla

Imagina que un **arquitecto** diseña un edificio complejo con muchas habitaciones y pasillos (BSP). El diseño es funcional: puedes ir de cualquier habitación a cualquier otra. Pero el arquitecto olvidó verificar dónde están las **puertas de emergencia**.

Resulta que la puerta de emergencia principal quedó dando a una pared, y la salida de evacuación trasera quedó dentro de un armario. El **inspector de seguridad** (post-procesamiento) revisa el plano, detecta los problemas y dice: "necesitamos un pasillo recto desde la puerta principal hasta el pasillo más cercano, y otro desde la salida trasera hasta el exterior".

El arquitecto no cambia su diseño original; solo añade esos dos pasillos de emergencia obligatorios.

## Ejemplo práctico

### 1. Verificación y corrección de la esquina (0,0) (`world/generation.ts`)

```typescript
export function generarLaberintoBSP(mapaLaberinto: Celda[][]) {
    // ... fase BSP (dividir, crear salas, pasillos) ...

    // === POST-PROCESAMIENTO: Asegurar que (0,0) sea transitable ===
    if (!mapaLaberinto[0][0].esTransitable) {
        // Buscar la celda transitable más cercana
        for (let f = 0; f < NUMERO_FILAS; f++) {
            for (let c = 0; c < NUMERO_COLUMNAS; c++) {
                if (mapaLaberinto[f][c].esTransitable) {
                    // Trazar un pasillo recto desde (0,0) hasta (f,c)
                    trazarRutaDirecta(mapaLaberinto, 0, 0, f, c);
                    break;  // Salir del bucle interno
                }
            }
            if (mapaLaberinto[0][0].esTransitable) break;  // Salir del bucle externo
        }
    }
}
```

**Qué está pasando aquí**:
- Después de que el BSP ha terminado, verificamos `mapaLaberinto[0][0].esTransitable`.
- Si es `false`, recorremos el mapa en orden de filas y columnas (de arriba a abajo, de izquierda a derecha) buscando la primera celda transitable.
- Esa celda puede estar a 5 celdas de distancia o a 50. Da igual: `trazarRutaDirecta` crea un corredor forzado.

### 2. Verificación y corrección de la esquina opuesta (N-1, M-1)

```typescript
    // === POST-PROCESAMIENTO: Asegurar que (N-1, M-1) sea transitable ===
    if (!mapaLaberinto[NUMERO_FILAS - 1][NUMERO_COLUMNAS - 1].esTransitable) {
        // Buscar desde la esquina inferior-derecha hacia el centro
        for (let f = NUMERO_FILAS - 1; f >= 0; f--) {
            for (let c = NUMERO_COLUMNAS - 1; c >= 0; c--) {
                if (mapaLaberinto[f][c].esTransitable) {
                    trazarRutaDirecta(
                        mapaLaberinto,
                        NUMERO_FILAS - 1, NUMERO_COLUMNAS - 1,
                        f, c
                    );
                    break;
                }
            }
            if (mapaLaberinto[NUMERO_FILAS - 1][NUMERO_COLUMNAS - 1].esTransitable) break;
        }
    }
```

**Qué está pasando aquí**:
- Misma lógica que para `(0,0)`, pero buscando desde la esquina opuesta hacia el centro.
- El orden de búsqueda (fila descendente, columna descendente) prioriza celdas cercanas a la esquina objetivo, minimizando la longitud del pasillo forzado.

### 3. Trazar ruta directa: pasillo en L (`trazarRutaDirecta`)

```typescript
function trazarRutaDirecta(
    mapa: Celda[][],
    f1: number, c1: number,   // Origen (esquina a corregir)
    f2: number, c2: number      // Destino (celda transitable más cercana)
) {
    let fActual = f1, cActual = c1;

    // Fase 1: mover horizontalmente hasta alinear columnas
    while (cActual !== c2) {
        const sigC = cActual < c2 ? cActual + 1 : cActual - 1;

        // Marcar ambas celdas como transitables
        mapa[fActual][cActual].esTransitable = true;
        mapa[fActual][sigC].esTransitable = true;

        // Quitar el muro entre ellas
        eliminarMurosEntre(mapa[fActual][cActual], mapa[fActual][sigC]);

        cActual = sigC;
    }

    // Fase 2: mover verticalmente hasta alinear filas
    while (fActual !== f2) {
        const sigF = fActual < f2 ? fActual + 1 : fActual - 1;

        mapa[fActual][cActual].esTransitable = true;
        mapa[sigF][cActual].esTransitable = true;
        eliminarMurosEntre(mapa[fActual][cActual], mapa[sigF][cActual]);

        fActual = sigF;
    }
}
```

**Qué está pasando aquí**:
- Es un algoritmo de **línea recta en L**: primero horizontal, luego vertical (o viceversa; el orden no importa para la corrección).
- `eliminarMurosEntre` quita los muros compartidos entre cada par de celdas adyacentes, asegurando que el pasillo sea realmente transitables.
- Marcamos como transitables **ambas celdas** (actual y siguiente) por seguridad. Si una de ellas ya era transitable, no pasa nada; si no, ahora lo es.

### 4. Post-procesamiento adicional: limpiar muros inconsistentes

```typescript
    // === POST-PROCESAMIENTO: celdas transitables adyacentes no deben tener muros ===
    for (let f = 0; f < NUMERO_FILAS; f++) {
        for (let c = 0; c < NUMERO_COLUMNAS; c++) {
            if (mapaLaberinto[f][c].esTransitable) {
                // Si la celda de abajo también es transitable, quitar muro inferior/superior
                if (f + 1 < NUMERO_FILAS && mapaLaberinto[f + 1][c].esTransitable) {
                    eliminarMurosEntre(mapaLaberinto[f][c], mapaLaberinto[f + 1][c]);
                }
                // Si la celda de la derecha también es transitable, quitar muro derecho/izquierdo
                if (c + 1 < NUMERO_COLUMNAS && mapaLaberinto[f][c + 1].esTransitable) {
                    eliminarMurosEntre(mapaLaberinto[f][c], mapaLaberinto[f][c + 1]);
                }
            }
        }
    }
```

**Qué está pasando aquí**:
- Esta pasada final corrige inconsistencias que podrían quedar del BSP o de las rutas forzadas.
- Dos celdas transitables adyacentes nunca deberían tener un muro entre ellas (sería una contradicción lógica).
- Es una "reparación de integridad" que garantiza que el mapa sea válido para pathfinding (A*).

---

### Diagrama del post-procesamiento

```
Paso 1: BSP genera el dungeon
+----+----+----+----+
| ## | ## | ## | ## |
| ## |    |    | ## |
| ## |    |    | ## |
| ## | ## | ## | ## |
+----+----+----+----+

Paso 2: Verificar (0,0) — no es transitable
+----+----+----+----+
| ?? | ## | ## | ## |  ← (0,0) está en pared
| ## |    |    | ## |
| ## |    |    | ## |
| ## | ## | ## | ## |
+----+----+----+----+

Paso 3: Buscar celda transitable más cercana → (1,1)

Paso 4: Trazar ruta directa (0,0) → (1,1)
+----+----+----+----+
|    |    | ## | ## |  ← Pasillo forzado
|    |    |    | ## |
| ## |    |    | ## |
| ## | ## | ## | ## |
+----+----+----+----+

Paso 5: Verificar (3,3) — no es transitable (mismo proceso)
+----+----+----+----+
|    |    | ## | ## |
|    |    |    | ## |
| ## |    |    |    |  ← Pasillo forzado a esquina
| ## | ## | ## |    |
+----+----+----+----+
```

## Consejo pro

### 1. Separa generación de garantías

Mantén el post-procesamiento en una función separada del BSP:

```typescript
function generarLaberintoBSP(mapa: Celda[][]) {
    // Fase 1: BSP
    const raiz = new NodoEspacial(0, 0, filas, columnas, mapa);
    // ... dividir y crear salas ...

    // Fase 2: Garantías
    garantizarEsquinasTransitables(mapa);
    garantizarMurosConsistentes(mapa);
    garantizarMinimoEnemigos(mapa, 5);
    garantizarMinimoItems(mapa, 3);
}
```

Esto permite desactivar garantías para testear el BSP puro, o añadir nuevas sin tocar el generador.

### 2. Usa un validador de conectividad completo

Para dungeons grandes, considera usar **Flood Fill** para verificar que **todas** las celdas transitables están conectas entre sí:

```typescript
function verificarConectividad(mapa: Celda[][]): boolean {
    // Encontrar primera celda transitable
    let inicio: [number, number] | null = null;
    for (let f = 0; f < filas && !inicio; f++) {
        for (let c = 0; c < columnas && !inicio; c++) {
            if (mapa[f][c].esTransitable) inicio = [f, c];
        }
    }
    if (!inicio) return false;

    // Flood fill desde inicio
    const visitado = new Set<string>();
    const cola = [inicio];
    while (cola.length > 0) {
        const [f, c] = cola.shift()!;
        const key = `${f},${c}`;
        if (visitado.has(key)) continue;
        visitado.add(key);

        // Vecinos transitables sin muros
        if (f > 0 && !mapa[f][c].muros.superior) cola.push([f - 1, c]);
        if (f < filas - 1 && !mapa[f][c].muros.inferior) cola.push([f + 1, c]);
        if (c > 0 && !mapa[f][c].muros.izquierdo) cola.push([f, c - 1]);
        if (c < columnas - 1 && !mapa[f][c].muros.derecho) cola.push([f, c + 1]);
    }

    // Contar celdas transitables totales
    let transitables = 0;
    for (let f = 0; f < filas; f++) {
        for (let c = 0; c < columnas; c++) {
            if (mapa[f][c].esTransitable) transitables++;
        }
    }

    return visitado.size === transitables;
}
```

### 3. Haz el post-procesamiento configurable por dificultad

En dificultad "fácil", garantiza que el spawn tenga un pico y comida cerca. En "locura", solo garantiza que el spawn y el final sean alcanzables. Las garantías pueden ser un vector de dificultad.

### 4. Loguea las garantías aplicadas

En desarrollo, registra cuántas celdas se modificaron por post-procesamiento:

```typescript
let celdasCorregidas = 0;
function trazarRutaDirecta(mapa, f1, c1, f2, c2) {
    // ...
    if (!mapa[f][c].esTransitable) {
        mapa[f][c].esTransitable = true;
        celdasCorregidas++;
    }
    // ...
}
console.log(`Post-procesamiento: ${celdasCorregidas} celdas corregidas`);
```

Si ves que siempre corrige 200+ celdas, el BSP tiene un problema de diseño que deberías arreglar en el generador, no en el post-procesamiento.

### 5. Considera usar BFS para encontrar la celda transitable más cercana

En lugar de buscar en orden de filas (que puede encontrar una celda lejana en la misma fila), usa BFS desde la esquina para encontrar la celda transitable con menor distancia de Manhattan:

```typescript
function encontrarTransitableMasCercano(mapa, f0, c0): [number, number] | null {
    const visitado = new Set<string>();
    const cola = [[f0, c0, 0]];  // [fila, columna, distancia]

    while (cola.length > 0) {
        const [f, c, dist] = cola.shift()!;
        if (f < 0 || f >= filas || c < 0 || c >= columnas) continue;
        if (visitado.has(`${f},${c}`)) continue;
        visitado.add(`${f},${c}`);

        if (mapa[f][c].esTransitable) return [f, c];

        cola.push([f - 1, c, dist + 1]);
        cola.push([f + 1, c, dist + 1]);
        cola.push([f, c - 1, dist + 1]);
        cola.push([f, c + 1, dist + 1]);
    }
    return null;
}
```

Esto minimiza la longitud de los pasillos forzados y preserva más la estética original del BSP.

> **Regla de oro**: el generador procedural crea belleza y variedad; el post-procesamiento garantiza que esa belleza sea jugable. Nunca confíes ciegamente en la aleatoriedad cuando hay posiciones críticas involucradas.
