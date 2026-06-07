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

## 5. Implementación del Sistema de Sprites
Se ha implementado un sistema completo basado en metadatos centralizados y herramientas de diseño.

### Configuración de Assets para Despliegue
Para activar los sprites reales en un entorno de producción, siga estos pasos:

1. **Alojar las Imágenes**: Coloque sus hojas de sprites (spritesheets) en un servidor accesible o dentro de la carpeta `public/` del proyecto.
2. **Configurar `src/config/sprites.json`**:
   - Edite la sección `"recursos"` con las URLs de sus imágenes.
   - Ejemplo: `"hero": "https://mi-cdn.com/hero_sheet.png"`
3. **Mapeo de Animaciones**:
   - Utilice la sección `"mapeo"` para definir qué frames corresponden a cada estado (`idle`, `walking`, etc.).
   - El motor busca automáticamente claves con el formato `{categoria}_{clase}_{estado}_{frame}`.
4. **Modo Fallback**: Si una imagen no carga o un frame no está definido, el motor activará automáticamente el **Modo Geométrico** (monigotes), asegurando que el juego siga siendo funcional.

### Herramienta de Diseño: STRUCTOR
Para facilitar la creación del archivo de configuración, el proyecto incluye **STRUCTOR**, un editor visual de animaciones y simulador de sprites.

1. **Acceso**: Ejecute el proyecto en modo desarrollo y acceda a `/structor.html`.
2. **Carga y Sincronización**:
   - Seleccione una hoja de sprites desde el menú desplegable (recursos del servidor).
   - Edite el JSON directamente en el área de texto para ver cambios instantáneos o use el selector visual para actualizar el JSON.
3. **Diseño y Productividad**:
   - Haga clic para seleccionar frames.
   - Use la **Herramienta de Clonación** para copiar conjuntos completos de animaciones entre clases (ej: de Guerrero a Explorador).
4. **Sala de Simulación Interactiva**:
   - Haga clic en el botón de simulación para probar los sprites en un entorno controlado de 12x10.
   - Use las **teclas de flechas** para mover al personaje y **Espacio** para atacar.
   - Valide colisiones y la fluidez de las animaciones antes de integrarlas al juego principal.
5. **Exportación**: El JSON generado se puede pegar directamente en la sección `mapeo` de `src/config/sprites.json`.

### Verificación de Integración
El `SpriteManager` validará automáticamente que las coordenadas de los sprites estén dentro de los límites de la imagen cargada. Si hay errores, se registrarán en la consola y se utilizarán los fallbacks geométricos.
