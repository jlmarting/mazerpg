# Documentación del Proyecto

Directorio centralizado de documentación técnica, decisiones arquitectónicas y propuestas.

## Estructura

```
docs/
├── README.md                          # Este archivo (índice)
├── project-context.md                 # Contexto funcional y técnico del proyecto
├── analisis-refactor.md               # Análisis de refactorización (histórico)
├── analisis-sprites.md                # Viabilidad de migración a sprites (histórico)
├── analisis-sprites-avanzado.md       # Arquitectura avanzada de sprites
├── proposals/                         # Propuestas y RFCs
│   ├── README.md                      # Template y guía para nuevas propuestas
│   ├── 2025-06-07-servidor-dedicado.md
│   ├── 2025-06-07-red-hibrida-federada.md
│   ├── 2025-06-07-migracion-websockets.md
│   ├── 2025-06-07-sistema-items-xp-dificultad.md
│   ├── 2025-06-07-mapa-privado-home-sweet-home.md
│   ├── 2025-06-07-ui-cleanup-reconexion.md
│   ├── 2025-06-07-mejoras-sprite-render.md
│   └── 2025-06-07-limpieza-ramas-obsoletas.md
└── learn/                             # Píldoras formativas LEARN
    ├── README.md
    ├── webrtc/
    ├── architecture/
    ├── rendering/
    ├── world/
    ├── entities/
    └── tooling/
```

## Navegación rápida

| Sección | Descripción |
|---------|-------------|
| [project-context.md](project-context.md) | Visión general del proyecto, arquitectura, subsistemas y próximos pasos |
| [proposals/](proposals/) | Propuestas activas y archivadas |
| [learn/](learn/) | Píldoras formativas sobre tecnologías del proyecto |
| [analisis-refactor.md](analisis-refactor.md) | Análisis histórico de la migración a modular + TypeScript |
| [analisis-sprites.md](analisis-sprites.md) | Viabilidad de la migración a sprites |
| [analisis-sprites-avanzado.md](analisis-sprites-avanzado.md) | Arquitectura de hojas de sprites y metadatos |

## Documentación fuera de `docs/`

| Archivo | Razón |
|---------|-------|
| `README.md` | Convención raíz: punto de entrada del repositorio |
| `CHANGELOG.md` | Convención raíz: registro de cambios |
| `LICENSE` | Convención raíz: licencia |
| `AGENTS.md` | Configuración de herramientas de desarrollo |
| `verification/` | Scripts ejecutables de verificación (no solo documentación) |
