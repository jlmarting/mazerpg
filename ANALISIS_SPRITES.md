# Análisis de Viabilidad: Migración a Sprites

## 1. Evaluación del Motor Actual
El motor de juego actual utiliza un **HTML5 Canvas 2D**, lo cual es ideal para una migración a sprites. Actualmente, todo el renderizado se realiza mediante primitivas geométricas (`rect`, `arc`, `lineTo`) y emojis para representar ítems.

### Puntos Fuertes para la Migración:
- **Arquitectura Basada en Grilla**: El mundo ya está dividido en celdas de tamaño uniforme (`TAMANO_CELDA`), lo que facilita enormemente el uso de *tilesets*.
- **Desacoplamiento del Renderizado**: La lógica de dibujo ya está centralizada en la clase `Renderer` y en métodos `dibujar` específicos de cada entidad.
- **Sistema de Cámara y Zoom**: El sistema actual ya maneja offsets de cámara y transformaciones de zoom, que funcionarán de forma transparente con sprites.

### Desafíos Técnicos:
- **Gestión de Carga de Assets**: Actualmente no existe un cargador de recursos asíncrono para imágenes.
- **Animaciones**: Las entidades actuales tienen animaciones procedimentales básicas (ej. movimiento de piernas mediante `sin(Date.now())`). Estas deberán mapearse a frames de una hoja de sprites.
- **Profundidad (Z-Indexing)**: Al usar sprites, la superposición de elementos (jugador detrás de un muro o sobre el suelo) se vuelve más crítica.

## 2. Propuesta de Arquitectura

### SpriteManager (Capa de Recursos)
Se propone la creación de una clase `SpriteManager` que:
- Cargue hojas de sprites (*spritesheets*).
- Permita definir regiones (rectángulos) dentro de esas hojas con nombres clave.
- Gestione la carga asíncrona mediante `Promises` para asegurar que el juego no inicie sin los recursos.

### Refactorización del Renderizado
1.  **Celdas (Tiles)**: En lugar de `fillRect`, se usará `drawImage`. Se pueden definir tiles para:
    - Suelo (distintos tipos: piedra, césped, baldosa).
    - Muros (con variantes para esquinas y conexiones).
    - Elementos especiales (portales, burbujas).
2.  **Entidades**: Cada `EntidadRPG` tendrá una referencia a un sprite. Se soportarán estados (idle, walking, attacking) mapeados a filas/columnas de la hoja de sprites.
3.  **Ítems**: Reemplazar los emojis por sprites pequeños de 16x16 o 32x32.

## 3. Hoja de Ruta Sugerida
1.  **Implementación del SpriteManager**: Soporte para carga de imágenes y recorte de tiles.
2.  **Integración en el Renderer**: Modificar el bucle de dibujo de la grilla.
3.  **Conversión de Entidades**: Actualizar Jugador y NPCs.
4.  **Sistema de Animación**: Implementar un contador de frames basado en el tiempo para ciclos de animación.

## 4. Conclusión
La migración es **altamente viable** y no requiere cambios estructurales en la lógica de juego, solo en la capa de presentación. Esto permitirá una mejora visual significativa y la posibilidad de añadir mayor variedad estética al mundo del laberinto.

## 5. Implementación de Demostración
Se ha implementado una demostración funcional en `src/main.ts` utilizando assets en base64.

### Cómo añadir assets reales:
1. Colocar las imágenes en la carpeta `public/assets/`.
2. En `src/main.ts`, dentro de `inicializarAssets`:
   ```typescript
   await sm.cargarImagen('nombre_hoja', 'assets/mi_imagen.png');
   sm.definirSprite('floor', 'nombre_hoja', x, y, ancho, alto);
   ```
3. El motor automáticamente utilizará el sprite definido en lugar del renderizado geométrico por defecto.
