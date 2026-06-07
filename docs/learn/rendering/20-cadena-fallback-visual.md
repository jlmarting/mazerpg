# LEARN: Cadena de Fallback Visual (Sprite → Emoji → Geométrico)

## Concepto

Un **sistema de fallback visual** garantiza que el juego siga siendo jugable y comprensible incluso cuando los assets gráficos no están disponibles, no se han cargado todavía, o están incompletos. En lugar de mostrar un espacio en blanco o lanzar un error, el renderer intenta una **cadena de alternativas** progresivamente más simples hasta encontrar algo que pueda dibujar.

En nuestro juego, la cadena es:
1. **Sprite animado** específico (`player_guerrero_walking_2`)
2. **Sprite base** del primer frame (`player_guerrero_walking_0`)
3. **Sprite genérico** de la categoría (`floor`, `wall_top`)
4. **Representación geométrica o emoji** dibujada con Canvas API

## Por qué es importante

- **Resiliencia**: si el CDN de sprites falla, el juego no se bloquea. Sigue siendo jugable con círculos y rectángulos.
- **Desarrollo incremental**: puedes probar la lógica del juego antes de que el artista termine los assets. Los programadores no dependen de los artistas.
- **Tamaño de bundle reducido**: en una versión "lite" del juego, puedes omitir los spritesheets y el juego sigue funcionando.
- **Debugging visual**: los fallback geométricos distinguen claramente tipos de entidad (círculo = Esqueleto, rectángulo = Orco), facilitando depurar colisiones y posiciones sin distracciones gráficas.

## Explicación sencilla

Imagina que vas a dar una charla en un aula y llevas una **presentación con imágenes**. La cadena de fallback es tu plan B:

1. **Proyector funciona** → muestras las diapositivas con fotos y gráficos (sprites).
2. **Proyector roto, pero tienes impresiones** → repartes hojas con los esquemas (sprites genéricos).
3. **No tienes impresiones** → dibujas en la pizarra con tiza figuras simples (fallback geométrico).
4. **Ni siquiera hay tiza** → describes la escena con palabras (aunque aquí el juego se vuelve injugable, por eso nos detenemos en el paso 3).

La clave es que **cada paso solo se ejecuta si el anterior falló**, y cada paso es lo suficientemente informativo como para que el "espectador" (jugador) entienda qué está pasando.

## Ejemplo práctico

### 1. Fallback del suelo (`Renderer.dibujarLaberinto`)

```typescript
// Para cada celda transitable del mapa:
if (celda.esTransitable) {
  // PASO 1: Intentar sprite específico del suelo
  const spriteSuelo = 'static_suelo_cesped';
  if (this.spriteManager.obtenerSprite(spriteSuelo)) {
    this.spriteManager.dibujarSprite(this.ctx, spriteSuelo, x, y, TAMANO_CELDA, TAMANO_CELDA);
  }
  // PASO 2: Fallback a sprite genérico 'floor'
  else if (this.spriteManager.obtenerSprite('floor')) {
    this.spriteManager.dibujarSprite(this.ctx, 'floor', x, y, TAMANO_CELDA, TAMANO_CELDA);
  }
  // PASO 3: Fallback geométrico — rectángulo blanco
  else {
    this.ctx.fillStyle = '#FFF';
    this.ctx.fillRect(x, y, TAMANO_CELDA, TAMANO_CELDA);
  }
}
```

**Qué está pasando aquí**:
- `obtenerSprite(nombre)` devuelve `null` si el sprite no está registrado (porque el JSON de mapeo no lo incluye, o porque la imagen aún no cargó).
- El fallback geométrico es un simple `fillRect` blanco. No es bonito, pero comunica "aquí hay suelo transitables".

### 2. Fallback de muros (cuatro direcciones)

```typescript
// Muro superior
if (celda.muros.superior) {
  const spriteMuro = 'static_muro_superior';
  if (this.spriteManager.obtenerSprite(spriteMuro)) {
    this.spriteManager.dibujarSprite(this.ctx, spriteMuro, x, y, TAMANO_CELDA, 4);
  }
  else if (this.spriteManager.obtenerSprite('static_muro_normal')) {
    this.spriteManager.dibujarSprite(this.ctx, 'static_muro_normal', x, y, TAMANO_CELDA, 4);
  }
  else if (this.spriteManager.obtenerSprite('wall_top')) {
    this.spriteManager.dibujarSprite(this.ctx, 'wall_top', x, y, TAMANO_CELDA, 4);
  }
  // Fallback geométrico: línea púrpura
  else {
    this.ctx.strokeStyle = '#800080';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x + TAMANO_CELDA, y);
    this.ctx.stroke();
  }
}
```

**Qué está pasando aquí**:
- Cada dirección de muro (superior, inferior, izquierdo, derecho) tiene su propia cadena de fallback.
- El fallback geométrico usa `stroke` en lugar de `fillRect` porque un muro es conceptualmente una "línea" que bloquea el paso, no un bloque sólido.
- Los colores son consistentes: `#800080` (púrpura) para todos los muros fallback, creando una estética coherente aunque primitiva.

### 3. Fallback de entidades: jugadores y NPCs (`Renderer.dibujarEntidad`)

```typescript
const esNPC = entidad.tipo !== undefined;
const prefix = esNPC ? 'npc' : 'player';
const clase = entidad.clase || entidad.tipo?.toLowerCase() || 'guerrero';
const keyBase = `${prefix}_${clase}_${entidad.estadoActual}`;
const spriteKey = `${keyBase}_${entidad.frameActual}`;

// PASO 1: Intentar sprite específico del frame actual
if (entidad.estaVivo && (this.spriteManager.obtenerSprite(spriteKey) || this.spriteManager.obtenerSprite(keyBase))) {
  this.spriteManager.dibujarSprite(this.ctx, spriteKey, x, y, TAMANO_CELDA, TAMANO_CELDA);
}
// PASO 2: Si ha caído, dibujar tumba (sprite o fallback)
else if (!entidad.estaVivo) {
  this.dibujarTumba(x, y, TAMANO_CELDA);
}
// PASO 3: Fallback geométrico por tipo de entidad
else {
  if (esNPC) {
    this.dibujarNPCFallback(entidad, x, y, TAMANO_CELDA);
  } else {
    this.dibujarJugadorFallback(entidad, x, y, TAMANO_CELDA);
  }
}
```

**Qué está pasando aquí**:
- `spriteKey` incluye el frame actual (ej. `player_guerrero_walking_2`). Si no existe, se intenta `keyBase` (`player_guerrero_walking`), que el `SpriteManager` mapea automáticamente al frame 0.
- Si la entidad está muerta (`!estaVivo`), se salta completamente la cadena de sprites vivos y va directo a una representación de tumba.
- Los fallbacks geométricos distinguen **cada tipo de NPC** con formas y colores diferentes.

### 4. Fallbacks específicos por tipo de NPC

```typescript
private dibujarNPCFallback(entidad: IEntidadRPG, x: number, y: number, tamanoCelda: number) {
  const escala = tamanoCelda * 0.4;
  const tipo = entidad.tipo;

  this.ctx.strokeStyle = '#000';
  this.ctx.lineWidth = 1;

  if (tipo === "Esqueleto") {
    // Círculo blanco (cráneo)
    this.ctx.fillStyle = '#EEE';
    this.ctx.beginPath();
    this.ctx.arc(x, y - escala/2, escala, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
  }
  else if (tipo === "Orco") {
    // Cuadrado gris oscuro (cuerpo musculoso)
    this.ctx.fillStyle = '#2F4F4F';
    this.ctx.fillRect(x - escala, y - escala, escala * 2, escala * 2);
    this.ctx.strokeRect(x - escala, y - escala, escala * 2, escala * 2);
  }
  else if (tipo === "Goblin") {
    // Elipse verde (pequeño y ágil)
    this.ctx.fillStyle = '#32CD32';
    this.ctx.beginPath();
    this.ctx.ellipse(x, y + 2, escala, escala * 1.2, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
  }
  else {
    // Rectángulo marrón genérico
    this.ctx.fillStyle = '#5C4033';
    this.ctx.fillRect(x - escala, y - escala/2, escala * 2, escala * 1.5);
    this.ctx.strokeRect(x - escala, y - escala/2, escala * 2, escala * 1.5);
  }
}
```

**Qué está pasando aquí**:
- Cada tipo de NPC tiene una **silueta distintiva** que permite identificarlo a primera vista incluso sin sprites:
  - **Esqueleto**: círculo blanco (evoca calavera).
  - **Orco**: cuadrado macizo (evoca cuerpo pesado).
  - **Goblin**: elipse verde pequeña (evoca criatura diminuta).
- Las siluetas se dibujan con Canvas API primitiva (`arc`, `fillRect`, `ellipse`), sin dependencias externas.

### 5. El SpriteManager también hace fallback interno

```typescript
// SpriteManager.ts
obtenerSprite(nombre: string): Sprite | undefined {
    let sprite = this.sprites.get(nombre);

    // Si no existe "player_guerrero_walking_2", intenta "player_guerrero_walking_0"
    if (!sprite) {
        const lastUnderscore = nombre.lastIndexOf('_');
        if (lastUnderscore > 0) {
            const baseNombre = nombre.substring(0, lastUnderscore);
            sprite = this.obtenerSprite(baseNombre) || this.obtenerSprite(`${baseNombre}_0`);
        }
    }

    return sprite;
}
```

**Qué está pasando aquí**:
- El `SpriteManager` añade un **segundo nivel de fallback interno**: si no existe el frame 2 de una animación, busca el frame 0. Esto evita parpadeos cuando una animación tiene menos frames de los esperados.
- Esta lógica es transparente para el `Renderer`: solo pide `spriteKey` y el manager resuelve lo que pueda.

---

### Tabla de fallbacks por elemento del juego

| Elemento | Paso 1 (Sprite) | Paso 2 (Genérico) | Paso 3 (Geométrico) |
|----------|----------------|-------------------|---------------------|
| **Suelo** | `static_suelo_cesped` | `floor` | Rectángulo blanco `#FFF` |
| **Muro sup** | `static_muro_superior` | `static_muro_normal` / `wall_top` | Línea púrpura `#800080` |
| **Muro inf** | `static_muro_inferior` | `wall_bottom` | Línea púrpura `#800080` |
| **Jugador** | `player_{clase}_{estado}_{frame}` | `player_{clase}_{estado}` | Figura stick colorida |
| **Esqueleto** | `npc_esqueleto_{estado}_{frame}` | `npc_esqueleto_{estado}` | Círculo blanco `#EEE` |
| **Orco** | `npc_orco_{estado}_{frame}` | `npc_orco_{estado}` | Cuadrado gris `#2F4F4F` |
| **Goblin** | `npc_goblin_{estado}_{frame}` | `npc_goblin_{estado}` | Elipse verde `#32CD32` |
| **Entidad muerta** | — | — | Cruz o tumba gris |

## Consejo pro

### 1. Diseña los fallbacks antes que los sprites finales

Si defines los fallbacks geométricos primero, puedes jugar y testear el juego desde el día 1. Cuando los sprites lleguen, simplemente se "enchufan" encima sin cambiar lógica. Es el principio de **progressive enhancement** aplicado a videojuegos.

### 2. Mantén los fallbacks temáticamente coherentes

Un fallback no debe ser aleatorio. Si el Esqueleto es un círculo blanco en modo fallback, siempre debe serlo. La consistencia permite que el jugador aprenda a identificar entidades rápidamente, incluso sin arte profesional.

### 3. Usa `config.vistaDebugActivada` para forzar fallbacks

Durante desarrollo, añade un botón "Force Fallback Mode" que ignore todos los sprites y dibuje solo geometría. Esto te permite ver claramente hitboxes, centros de celda y problemas de alineación sin que los sprites te distraigan.

### 4. Instrumenta métricas de fallback

En desarrollo, loguea cuántas veces se activa cada nivel de fallback:

```typescript
if (!this.spriteManager.obtenerSprite(spriteKey)) {
    console.warn(`Fallback activado para: ${spriteKey}`);
    // Enviar a analytics en producción para detectar assets faltantes
}
```

Esto te permite detectar rápidamente qué sprites faltan en tu spritesheet sin depender de reportes manuales de testers.

### 5. El fallback geométrico es tu "prueba de humo" visual

Si el juego es jugable y comprensible con solo círculos, rectángulos y líneas, entonces la lógica del juego es sólida. Si necesitas los sprites para entender qué está pasando, eso indica que tu lógica o UI no son lo suficientemente claras por sí solas.

> **Regla de oro**: un juego bien diseñado debe ser jugable en blanco y negro, con figuras geométricas. Los sprites son el maquillaje, no la estructura.
