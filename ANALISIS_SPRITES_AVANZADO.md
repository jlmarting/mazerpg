
# Arquitectura Avanzada de Sprites: Hojas y Metadatos

Este documento detalla el planteamiento técnico para la migración a un sistema basado en **hojas de sprites (spritesheets)** y **configuración por metadatos**, facilitando el flujo de trabajo entre diseño y desarrollo.

## 1. Organización de Hojas de Sprites

Se ha implementado una estructura categorizada que permite separar los recursos según su naturaleza y frecuencia de actualización:

- **Hojas de Jugadores (`sheet_players`):** Contiene todas las animaciones de los personajes controlables (Guerrero, Mago, Explorador). Organizado por filas de acción.
- **Hojas de NPCs (`sheet_npcs`):** Contiene las matrices de enemigos. Cada tipo de enemigo ocupa un bloque de filas predefinido.
- **Escenario Estático (`sheet_static`):** Tiles inamovibles como suelos (césped, piedra, arena) y muros.
- **Escenario Dinámico (`sheet_dynamic`):** Elementos con estados, como puertas (abierta/cerrada) o trampas (activa/inactiva).

## 2. Configuración por Metadatos (`SpriteConfig.ts`)

Para evitar el "hardcoding" de coordenadas, se utiliza un sistema de mapeo centralizado. Esto permite que Diseño ajuste la disposición de la hoja sin tocar la lógica de los personajes.

### Ejemplo de Configuración:
```typescript
jugadores: {
    guerrero: {
        walking: { fila: 1, frames: 3 },
        attacking: { fila: 2, frames: 3 },
    }
}
```

## 3. Herramienta de Diseño: STRUCTOR

Se ha implementado una aplicación independiente para facilitar el mapeo de sprites: **STRUCTOR** (disponible en `structor.html`).

### Funcionalidades:
- **Carga Visual:** Permite cargar cualquier imagen local como hoja de sprites.
- **Selección Libre:** Cursor interactivo para seleccionar regiones (por defecto 32x32, pero totalmente redimensionable para Bosses o elementos grandes).
- **Control Preciso:** Uso de teclado (flechas) para mover la selección píxel a píxel (con Shift) o por rejilla (sin Shift).
- **Asignación Lógica:** Permite definir la Categoría, Clase y Estado del juego al que corresponde la selección.
- **Exportación Directa:** Genera el bloque de metadatos JSON listo para ser copiado a `SpriteConfig.ts`.

### Flujo de Trabajo:
1. Abrir `structor.html` en el navegador.
2. Cargar la hoja de sprites deseada.
3. **Selección Visual:** El cursor por defecto es 32x32. Arrastre desde dentro para posicionar o desde fuera para redimensionar. Shift + Flechas para ajuste de precisión.
4. **Simulación:** Use el panel de animación para ver cómo se comportan los frames asignados a una acción. Ajuste la velocidad en ms para validar la fluidez.
5. **Asignación Lógica:** El selector utiliza el **Contrato Juego-Herramienta** para asegurar que los nombres de clase y acción coincidan con lo que el motor espera.
6. **Exportación:** Copie el JSON del bloque de metadatos (que incluye el nombre del archivo original) a `SpriteConfig.ts`.

## 4. El Contrato de Sprites (`GameSpriteContract`)

Para que la herramienta sea consciente de las necesidades del motor, existe un objeto de contrato que define:
- **Categorías:** Jugadores, NPCs, Escenario Estático/Dinámico, VFX, Items.
- **Entidades:** Tipos específicos como Guerrero, Mago, Orco, Puerta.
- **Acciones/Estados:** Idle, Walking, Attacking, Open, Closed.

Este contrato asegura que no haya errores de tipografía al mapear recursos.

## 5. Motor de Animación Dinámico

## 4. Flujo de Renderizado

1. **Inicialización:** El `SpriteManager` carga las hojas y, mediante `inicializarSpritesheets()`, genera las claves únicas (ej. `player_mago_walking_0`).
2. **Lógica de Estado:** La entidad actualiza su `estadoActual` y `frameActual` basándose en el tiempo y las acciones del juego.
3. **Dibujado:** El `Renderer` solicita al `SpriteManager` el sprite por su clave compuesta. Si Diseño añade un nuevo movimiento, solo hay que añadir la fila en la configuración.

## 5. Escalabilidad

Este sistema permite:
- **Personalización:** Añadir capas de "equipo" o "skins" simplemente cargando una hoja de armadura y superponiéndola en el renderizado usando el mismo sistema de índices.
- **Ambientes:** Cambiar todo el aspecto visual del laberinto (ej. de bosque a mazmorra) cambiando solo la hoja `sheet_static` y `sheet_dynamic`.
