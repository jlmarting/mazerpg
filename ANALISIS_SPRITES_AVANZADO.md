
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

## 3. Propuesta de Herramienta para Diseño

Para facilitar la relación entre acciones y gráficos, se propone la creación de un **Sprite Mapping Tool** (Web-based):

1. **Carga de Imagen:** El diseñador carga la hoja de sprites.
2. **Definición de Rejilla:** Se define el tamaño del tile (ej. 32x32).
3. **Mapeo Visual:** El diseñador hace clic en las filas/celdas y selecciona a qué acción corresponden (ej. "Click en fila 2" -> Asignar a "Mago - Caminando").
4. **Exportación JSON:** La herramienta genera automáticamente un archivo JSON compatible con `SpriteConfig.ts`.

## 4. Flujo de Renderizado

1. **Inicialización:** El `SpriteManager` carga las hojas y, mediante `inicializarSpritesheets()`, genera las claves únicas (ej. `player_mago_walking_0`).
2. **Lógica de Estado:** La entidad actualiza su `estadoActual` y `frameActual` basándose en el tiempo y las acciones del juego.
3. **Dibujado:** El `Renderer` solicita al `SpriteManager` el sprite por su clave compuesta. Si Diseño añade un nuevo movimiento, solo hay que añadir la fila en la configuración.

## 5. Escalabilidad

Este sistema permite:
- **Personalización:** Añadir capas de "equipo" o "skins" simplemente cargando una hoja de armadura y superponiéndola en el renderizado usando el mismo sistema de índices.
- **Ambientes:** Cambiar todo el aspecto visual del laberinto (ej. de bosque a mazmorra) cambiando solo la hoja `sheet_static` y `sheet_dynamic`.
