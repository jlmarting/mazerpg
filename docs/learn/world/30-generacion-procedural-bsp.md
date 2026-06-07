# LEARN: Generación Procedural con BSP (Binary Space Partitioning)

## Concepto

**Binary Space Partitioning (BSP)** es un algoritmo recursivo que divide un espacio 2D en regiones cada vez más pequeñas mediante cortes horizontales o verticales. En nuestro juego lo usamos para generar laberintos: partiendo del mapa completo como una única región, la dividimos recursivamente en "nodos" hasta que cada uno es lo suficientemente pequeño. Luego, en cada nodo hoja (el que no se puede dividir más), creamos una **sala rectangular** y conectamos las salas de nodos hermanos con **pasillos rectos**.

El resultado es un dungeon orgánico: no es una cuadrícula perfecta de pasillos de 1 celda, sino un conjunto de salas de diferentes tamaños interconectadas por corredores.

## Por qué es importante

- **Variedad infinita**: el mismo algoritmo produce un laberinto diferente en cada partida gracias a la aleatoriedad en las divisiones y en el tamaño de las salas.
- **Control estructural**: puedes ajustar `TAMANO_MINIMO_NODO` para obtener dungeons con muchas salas pequeñas o pocas salas grandes.
- **Conectividad garantizada**: al conectar cada nodo con su hermano de forma recursiva (padre conecta a hijo izquierdo con hijo derecho), se garantiza que todo el dungeon es alcanzable.
- **Eficiencia**: la complejidad es O(n × m) para un mapa de n × m celdas, lo cual es instantáneo incluso para dungeons de 100×100.

## Explicación sencilla

Imagina que tienes un **terreno rectangular** y quieres construir un pueblo:

1. Tomas el terreno entero y lo **cortas por la mitad** (horizontal o vertical, al azar). Ahora tienes dos parcelas.
2. Cada parcela que sea lo suficientemente grande la **vuelves a cortar por la mitad**.
3. Repites hasta que todas las parcelas son pequeñas.
4. En cada parcela final construyes una **casa** (sala) de tamaño aleatorio pero dentro de los límites de la parcela.
5. Para que el pueblo sea funcional, conectas cada par de casas vecinas con un **camino** recto: primero horizontal, luego vertical (o viceversa).

Al final tienes un pueblo donde puedes caminar de cualquier casa a cualquier otra, pero las casas no son todas iguales y los caminos no son una cuadrícula perfecta.

## Ejemplo práctico

### 1. El nodo espacial: la unidad de división (`world/generation.ts`)

```typescript
class NodoEspacial {
  fila: number;      // Esquina superior-izquierda del nodo
  columna: number;
  alto: number;      // Alto en celdas
  ancho: number;     // Ancho en celdas
  hijoIzquierdo: NodoEspacial | null = null;
  hijoDerecho: NodoEspacial | null = null;
  sala: { fila: number; columna: number; alto: number; ancho: number } | null = null;
  mapaLaberinto: Celda[][];

  constructor(fila: number, columna: number, alto: number, ancho: number, mapaLaberinto: Celda[][]) {
    this.fila = fila;
    this.columna = columna;
    this.alto = alto;
    this.ancho = ancho;
    this.mapaLaberinto = mapaLaberinto;
  }
}
```

**Qué está pasando aquí**:
- Cada nodo sabe qué porción del mapa le corresponde (coordenadas y dimensiones).
- Los nodos hojas (sin hijos) albergarán una sala. Los nodos internos solo dividen espacio.
- El mapa se pasa por referencia, por lo que todas las operaciones de sala y pasillo modifican la misma matriz de celdas.

### 2. La división recursiva (`NodoEspacial.dividir`)

```typescript
dividir(): boolean {
    // Si ya tiene hijos, no dividir de nuevo
    if (this.hijoIzquierdo || this.hijoDerecho) return false;

    // Decidir orientación del corte (horizontal o vertical)
    let dividirHorizontalmente = Math.random() > 0.5;

    // Si la región es muy alargada, forzar el corte en la dirección larga
    if (this.ancho > this.alto && this.ancho / this.alto >= 1.25) {
        dividirHorizontalmente = false;  // Cortar verticalmente (reducir ancho)
    } else if (this.alto > this.ancho && this.alto / this.ancho >= 1.25) {
        dividirHorizontalmente = true;   // Cortar horizontalmente (reducir alto)
    }

    // ¿Hay espacio suficiente para dividir?
    const maximoEspacio = (dividirHorizontalmente ? this.alto : this.ancho) - TAMANO_MINIMO_NODO;
    if (maximoEspacio < TAMANO_MINIMO_NODO) return false;

    // Punto de corte aleatorio, respetando el tamaño mínimo en ambos lados
    const puntoDeCorte = Math.floor(
        Math.random() * (maximoEspacio - TAMANO_MINIMO_NODO)
    ) + TAMANO_MINIMO_NODO;

    if (dividirHorizontalmente) {
        // Cortar en filas: hijo arriba, hijo abajo
        this.hijoIzquierdo = new NodoEspacial(
            this.fila, this.columna, puntoDeCorte, this.ancho, this.mapaLaberinto
        );
        this.hijoDerecho = new NodoEspacial(
            this.fila + puntoDeCorte, this.columna,
            this.alto - puntoDeCorte, this.ancho, this.mapaLaberinto
        );
    } else {
        // Cortar en columnas: hijo izquierda, hijo derecha
        this.hijoIzquierdo = new NodoEspacial(
            this.fila, this.columna, this.alto, puntoDeCorte, this.mapaLaberinto
        );
        this.hijoDerecho = new NodoEspacial(
            this.fila, this.columna + puntoDeCorte,
            this.alto, this.ancho - puntoDeCorte, this.mapaLaberinto
        );
    }
    return true;
}
```

**Qué está pasando aquí**:
- `dividirHorizontalmente` se decide al azar, pero con una **heurística de corrección**: si la región es mucho más ancha que alta, se fuerza un corte vertical para evitar salas demasiado alargadas.
- `TAMANO_MINIMO_NODO = 6` es el umbral: no se divide si el resultado sería menor de 6 celdas en alguna dimensión.
- El `puntoDeCorte` se elige aleatoriamente entre `TAMANO_MINIMO_NODO` y `maximoEspacio - TAMANO_MINIMO_NODO`, asegurando que ambos hijos tienen espacio suficiente.

### 3. Crear salas en las hojas (`NodoEspacial.crearSalasYPasillos`)

```typescript
crearSalasYPasillos() {
    if (this.hijoIzquierdo || this.hijoDerecho) {
        // Nodo interno: primero procesar hijos recursivamente
        if (this.hijoIzquierdo) this.hijoIzquierdo.crearSalasYPasillos();
        if (this.hijoDerecho) this.hijoDerecho.crearSalasYPasillos();

        // Luego conectar las salas de ambos hijos
        const salaIzq = this.hijoIzquierdo?.obtenerSala();
        const salaDer = this.hijoDerecho?.obtenerSala();

        if (salaIzq && salaDer) {
            this.crearPasilloEntre(salaIzq, salaDer);
        }
    } else {
        // === NODO HOJA: crear una sala ===
        const altoSala = Math.floor(Math.random() * (this.alto - 4)) + 3;
        const anchoSala = Math.floor(Math.random() * (this.ancho - 4)) + 3;
        const filaSala = this.fila + Math.floor(Math.random() * (this.alto - altoSala - 2)) + 1;
        const colSala = this.columna + Math.floor(Math.random() * (this.ancho - anchoSala - 2)) + 1;

        this.sala = { fila: filaSala, columna: colSala, alto: altoSala, ancho: anchoSala };

        // Marcar celdas de la sala como transitables y quitar muros internos
        for (let f = filaSala; f < filaSala + altoSala; f++) {
            for (let c = colSala; c < colSala + anchoSala; c++) {
                this.mapaLaberinto[f][c].esTransitable = true;
                if (f + 1 < filaSala + altoSala) {
                    eliminarMurosEntre(this.mapaLaberinto[f][c], this.mapaLaberinto[f + 1][c]);
                }
                if (c + 1 < colSala + anchoSala) {
                    eliminarMurosEntre(this.mapaLaberinto[f][c], this.mapaLaberinto[f][c + 1]);
                }
            }
        }
    }
}
```

**Qué está pasando aquí**:
- Es un recorrido **post-order**: primero las hojas crean salas, luego los nodos internos conectan las salas de sus hijos.
- `obtenerSala()` elige aleatoriamente entre la sala del hijo izquierdo y la del derecho. Esto crea variedad en qué salas se conectan.
- La sala se crea con **márgenes** (deja al menos 1 celda de borde respecto al nodo) para evitar que toque los límites de la región.
- `eliminarMurosEntre` quita los muros compartidos entre celdas adyacentes dentro de la sala, haciéndola espaciosa.

### 4. Conectar salas con pasillos (`NodoEspacial.crearPasilloEntre`)

```typescript
crearPasilloEntre(
    salaA: { fila: number; columna: number; alto: number; ancho: number },
    salaB: { fila: number; columna: number; alto: number; ancho: number }
) {
    // Centro de cada sala
    const puntoA = {
        f: salaA.fila + Math.floor(salaA.alto / 2),
        c: salaA.columna + Math.floor(salaA.ancho / 2)
    };
    const puntoB = {
        f: salaB.fila + Math.floor(salaB.alto / 2),
        c: salaB.columna + Math.floor(salaB.ancho / 2)
    };

    // Pasillo en L: primero horizontal, luego vertical
    let fActual = puntoA.f;
    let cActual = puntoA.c;

    while (cActual !== puntoB.c) {
        const siguienteC = cActual < puntoB.c ? cActual + 1 : cActual - 1;
        this.mapaLaberinto[fActual][cActual].esTransitable = true;
        this.mapaLaberinto[fActual][siguienteC].esTransitable = true;
        eliminarMurosEntre(this.mapaLaberinto[fActual][cActual], this.mapaLaberinto[fActual][siguienteC]);
        cActual = siguienteC;
    }

    while (fActual !== puntoB.f) {
        const siguienteF = fActual < puntoB.f ? fActual + 1 : fActual - 1;
        this.mapaLaberinto[fActual][cActual].esTransitable = true;
        this.mapaLaberinto[siguienteF][cActual].esTransitable = true;
        eliminarMurosEntre(this.mapaLaberinto[fActual][cActual], this.mapaLaberinto[siguienteF][cActual]);
        fActual = siguienteF;
    }
}
```

**Qué está pasando aquí**:
- Los pasillos conectan los **centros** de las salas, no las esquinas. Esto da pasillos más naturales.
- Es un pasillo en **forma de L**: primero horizontal hasta alinear columnas, luego vertical hasta alinear filas.
- Se marcan como transitables tanto la celda actual como la siguiente, asegurando que el pasillo tenga grosor de 1 celda mínimo.
- `eliminarMurosEntre` quita el muro compartido entre cada par de celdas del pasillo.

### 5. Orquestación: dividir hasta que no se pueda más (`generarLaberintoBSP`)

```typescript
export function generarLaberintoBSP(mapaLaberinto: Celda[][]) {
    const raiz = new NodoEspacial(0, 0, NUMERO_FILAS, NUMERO_COLUMNAS, mapaLaberinto);
    const todosLosNodos = [raiz];
    let huboDivision = true;
    let seguridadBSP = 0;

    // Fase 1: Dividir recursivamente hasta que ningún nodo pueda dividirse más
    while (huboDivision && seguridadBSP < 500) {
        seguridadBSP++;
        huboDivision = false;
        for (let i = 0; i < todosLosNodos.length; i++) {
            if (!todosLosNodos[i].hijoIzquierdo && !todosLosNodos[i].hijoDerecho) {
                if (todosLosNodos[i].dividir()) {
                    todosLosNodos.push(todosLosNodos[i].hijoIzquierdo!);
                    todosLosNodos.push(todosLosNodos[i].hijoDerecho!);
                    huboDivision = true;
                }
            }
        }
    }

    // Fase 2: Crear salas y pasillos
    raiz.crearSalasYPasillos();

    // ... post-procesamiento (ver píldora LEARN 32) ...
}
```

**Qué está pasando aquí**:
- Usamos un **bucle por niveles** (level-order) en lugar de recursión directa. En cada iteración intentamos dividir todos los nodos hoja actuales. Esto evita el riesgo de stack overflow en mapas grandes.
- `seguridadBSP < 500` es un límite de seguridad para evitar bucles infinitos si hay un bug en la lógica de división.
- Después de la división, un solo llamado a `raiz.crearSalasYPasillos()` recorre todo el árbol y crea tanto salas como pasillos.

---

### Visualización del proceso BSP

```
Paso 1: Mapa completo (raíz)
+------------------+
|                  |
|                  |
|                  |
+------------------+

Paso 2: Primer corte vertical
+--------+---------+
|        |         |
|   A    |    B    |
|        |         |
+--------+---------+

Paso 3: A se corta horizontalmente
+--------+---------+
|   A1   |         |
|--------|    B    |
|   A2   |         |
+--------+---------+

Paso 4: B se corta verticalmente
+--------+--+------+
|   A1   |B1|  B2  |
|--------|--|------|
|   A2   |  |      |
+--------+--+------+

Paso 5: Crear salas en hojas
+--------+--+------+
| [A1]   |  | [B2] |
|        |  |      |
|--------|B1|------|
| [A2]   |  |      |
+--------+--+------+

Paso 6: Conectar con pasillos
+--------+--+------+
| [A1]---|  | [B2] |
|   |    |  |      |
| [A2]   |  |      |
+--------+--+------+
```

## Consejo pro

### 1. Ajusta `TAMANO_MINIMO_NODO` para controlar la densidad

- `TAMANO_MINIMO_NODO = 4`: muchas salas pequeñas, dungeon laberíntico y denso.
- `TAMANO_MINIMO_NODO = 10`: pocas salas grandes, dungeon tipo "boss room".
- `TAMANO_MINIMO_NODO = 6` (nuestro valor): equilibrio entre variedad y jugabilidad.

### 2. Añade prefabricados (prefabs) en nodos específicos

Si quieres que cierta sala sea siempre una "sala del tesoro" o una "arena de boss", puedes modificar `crearSalasYPasillos` para que, si el nodo cumple ciertas condiciones (ej. "es el nodo más alejado del spawn"), genere un layout predefinido en lugar de aleatorio.

### 3. Usa la estructura del árbol para pathfinding optimizado

El árbol BSP divide el espacio en regiones disjuntas. Para pathfinding a larga distancia, puedes usar el árbol para descartar rápidamente regiones enteras: "si la sala A está en el subárbol izquierdo y la sala B en el derecho, el pasillo debe cruzar por el nodo padre". Esto acelera A* en mapas enormes.

### 4. Seed para reproducibilidad

Actualmente usamos `Math.random()` sin semilla. Para debugging o modo "speedrun", considera aceptar una seed:

```typescript
function seededRandom(seed: number) {
    // Generador congruencial lineal simple
    return () => {
        seed = (seed * 16807 + 0) % 2147483647;
        return (seed - 1) / 2147483646;
    };
}

// generarLaberintoBSP(mapa, seed)
```

Esto permite que jugadores compartan "el mismo dungeon" simplemente compartiendo una seed numérica.

### 5. BSP no es el único algoritmo

BSP genera dungeons tipo "salas y pasillos". Si quieres dungeons tipo caverna (orgánicos, sin salas rectangulares), considera:
- **Cellular Automata**: simula "células" que nacen y mueren según vecinos.
- **Random Walk (Drunkard's Walk)**: un "borracho" camina aleatoriamente excavando.
- **Wave Function Collapse**: genera mapas coherentes a partir de patrones locales.

> **Regla de oro**: BSP es el "pan y mantequilla" de la generación de dungeons. Es rápido, predecible y da resultados visualmente agradables. Domínalo antes de experimentar con algoritmos más exóticos.
