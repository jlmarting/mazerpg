
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
- **Selección Inteligente:** Por defecto el selector es 32x32 para facilitar el alineado con la rejilla estándar.
- **Selección Múltiple:**
    - `Ctrl + Click`: Agrega un nuevo frame en la posición del puntero.
    - `Ctrl + Arrastrar`: Mueve una selección individual para ajuste fino.
    - `Shift + Click`: Crea automáticamente una serie de frames lineales (horizontales o verticales) hasta el puntero.
    - `Ctrl + Click Derecho`: Elimina una selección específica.
- **Simulación Ampliada:** Modal dedicado para ver la animación en tamaño grande, permitiendo ajustar el ciclo (ms) en tiempo real para verificar la fluidez de movimientos complejos.
- **Asignación Lógica:** Dropdowns dinámicos basados en el **Contrato Juego-Herramienta** para evitar errores de nombres.
- **Exportación Directa:** Genera el bloque de metadatos JSON detallando cada frame (X, Y, W, H) y el archivo de imagen de origen.

### Flujo de Trabajo:
1. Abrir `structor.html` en el navegador.
2. Cargar la hoja de sprites deseada.
3. **Mapeo Rápido:** Use `Shift + Click` para capturar tiras enteras de animación en segundos.
4. **Validación:** Abra la "Simulación Ampliada" para comprobar que los frames están bien alineados.
5. **Exportación:** Copie el JSON generado a `SpriteConfig.ts`.

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
