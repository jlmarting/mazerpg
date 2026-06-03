# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Sprite-based rendering engine y STRUCTOR tool v1 (`3a7f572`)
- Integración de metadatos de sprites externos y mejora de lógica de carga (`2bc5c9d`)
- Soporte para hojas de sprites servidor en STRUCTOR (`5a8bbd4`)
- Editor bidireccional de mapeo de sprites en STRUCTOR (`9c598cc`)
- Sincronización bidireccional en tiempo real de metadatos en STRUCTOR (`56437af`)
- Clonación de acciones en STRUCTOR (`d98cc27`)
- Adaptabilidad de UI de STRUCTOR a diferentes tamaños de pantalla (`4d88fbb`)
- Migración completa a sprites con STRUCTOR v1.3 (`d8d7675`)
- JSON drawer y simulación mejorada en STRUCTOR (`5443987`)
- Migración a sprite-based rendering con STRUCTOR v1.4 (`221a262`)
- Refinamiento de STRUCTOR con pestañas y lógica de fotograma anterior (`ec3c2cc`)
- Migración a sprite-based rendering con STRUCTOR v1.5 (`bca032f`)
- Soporte de sprites VFX y redimensionamiento dinámico del mapa (`021667d`)
- Modo multijugador HTTP con servidor de señalización externo (`bab0b3b`)
- Píldoras formativas LEARN sobre WebRTC, signaling híbrido, buffering ICE y host-authority con snapshots (`9f6bc75`, `8dc717a`)

### Changed
- Estandarización de configuración de sprites a formato basado en puntos (`e0c31e7`)
- Consolidación de configuración de sprites en un único JSON centralizado (`eaf31f4`)
- Externalización de configuración de sprites y mejora de manejo de errores (`8202c84`)
- Migración del motor del juego a sistema de sprites basado en metadatos con STRUCTOR (`81773c3`)
- Documentación del sistema de sprites con instrucciones de despliegue (`a411b4d`)
- Asignación de sprites a jugadores (`90dcd59`, `38480ef`, `96b3eec`)
- Ajustes varios de configuración de sprites (`03cadbb`, `d867863`, `b4e8044`)
- Migración de npm a pnpm y actualización de AGENTS.md (`6be78ee`)

### Fixed
- Fallos de interacción de invitados y optimización de suavizado de cámara (`7c17fa9`)
- Desincronización multijugador y problemas de sprite fallback en NPCs (`438e7c4`)
- Corrección de estado de respawn (`7c874ca`)
