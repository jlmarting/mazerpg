# Análisis de Refactorización - Laberinto RPG

## 1. Estado Actual del Proyecto
El proyecto se encuentra actualmente implementado como un **monolito en un único archivo HTML** (`public/maze.html`). Con más de 2600 líneas de código, este archivo contiene:
- Estructura HTML del juego y menús.
- Estilos CSS.
- Lógica de inicialización de Firebase.
- Definición de clases de negocio (Entidades RPG, Celdas, Mensajes).
- Algoritmos de generación de mapas (BSP) y búsqueda de caminos (A*).
- Motor de renderizado basado en Canvas.
- Lógica de red P2P (WebRTC) y señalización (Firestore).

### Principales Problemas de Escalabilidad
- **Acoplamiento Fuerte**: La lógica de juego está íntimamente ligada a la lógica de red y renderizado. Por ejemplo, la clase `EntidadRPG` gestiona su propia sincronización en red en algunos métodos.
- **Dificultad de Mantenimiento**: Cualquier cambio en la interfaz requiere navegar por miles de líneas de lógica de juego.
- **Falta de Tipado**: Al ser JavaScript puro, es propenso a errores en tiempo de ejecución, especialmente en la compleja gestión de estados de combate y sincronización multijugador.
- **Ausencia de un Proceso de Construcción (Build Pipeline)**: No hay minificación, transpilación ni gestión de módulos moderna.

## 2. Arquitectura Modular Propuesta
Para escalar el proyecto, se propone dividir el código en módulos especializados:

### Estructura de Directorios Sugerida
```text
/src
  /core         # Motor de juego, bucle principal, gestión de entrada
  /world        # Generación de mapas (BSP), lógica de celdas, niebla de guerra
  /entities     # Jugador, Enemigos NPCs, lógica RPG
  /network      # Abstracciones de WebRTC, señalización con Firebase, sincronización
  /ui           # Gestión del DOM, menús, chat, notificaciones
  /utils        # Algoritmos (A*), ayudantes matemáticos
/public         # Actas estáticos (imágenes, sonidos)
```

## 3. Recomendaciones Tecnológicas
- **Lenguaje**: Migrar a **TypeScript**. Esto proporcionará seguridad en las interfaces de red y en las estadísticas de las entidades RPG.
- **Herramienta de Construcción**: Utilizar **Vite**. Es extremadamente rápido y facilita la gestión de módulos ES6 y la integración con Firebase.
- **Gestión de Estado**: Considerar un patrón de arquitectura limpia o un pequeño store para el estado global (p. ej., lista de jugadores, estado de la partida) para desacoplarlo de la vista.

## 4. Mejoras en la Capa de Red
- **Abstracción de WebRTC**: Crear un `NetworkManager` que oculte la complejidad del intercambio de ofertas/respuestas y candidatos ICE.
- **Sincronización de Estado**: Implementar un sistema de "Snapshot Interpolation" o un modelo de mensajes más robusto para evitar inconsistencias entre el Host y los Invitados.

## 5. Plan de Acción (Hoja de Ruta)
1.  **Fase 1: Preparación**: Configurar el entorno con Vite y TypeScript.
2.  **Fase 2: Extracción de Clases**: Mover clases base (`Celda`, `EntidadRPG`) a archivos separados.
3.  **Fase 3: Desacoplamiento de Red**: Aislar toda la lógica de Firebase y WebRTC en un módulo de red independiente.
4.  **Fase 4: Refactorización de la UI**: Separar la manipulación del DOM del canvas de juego.
5.  **Fase 5: Pruebas y Optimización**: Implementar pruebas unitarias para algoritmos críticos (A*, BSP) y optimizar el renderizado.

---
*Este análisis sirve como base para la evolución del proyecto Laberinto RPG hacia una plataforma más robusta y colaborativa.*
