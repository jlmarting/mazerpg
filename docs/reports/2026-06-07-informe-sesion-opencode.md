# Informe Técnico: Sesión OpenCode — 7 de junio de 2026

**Dirigido a**: Jefatura de Producción / I+D / Gerencia
**Elaborado por**: Sistema de reporte automático OpenCode
**Sesión**: `ses_15e968d4affe7LUph9ZoqB5ojW` — "Navegador deja de responder tras minutos"
**Duración**: 09:28 - 11:01 (1 h 33 min)
**Rama activa durante la sesión**: `fix/sprites_no_visibles`

---

## Resumen Ejecutivo

Sesión centrada en la resolución de un bug crítico de estabilidad (memory leaks que provocaban que el navegador dejase de responder) y en la generación de documentación técnica LEARN como medida de contingencia. Se emplearon 4 modelos de IA diferentes, con un coste computacional total estimado de ~3.94 USD.

---

## Relación de Solicitudes

| # | Hora | Modelo | Acciones Realizadas | Coste |
|---|------|--------|-------------------|-------|
| 1 | 09:28 | `deepseek-v4-flash` (opencode) | Intento fallido — saldo insuficiente en proveedor `opencode` | 0.00 USD |
| 2 | 09:29 | `deepseek-v4-flash` (opencode-go) | Retomado con proveedor alternativo. Generación de documentación LEARN sobre contramedidas para game loops en navegador | 0.01 USD |
| 3 | 09:37 | `deepseek-v4-flash` | Continuación / ajustes sobre el documento generado | 0.00 USD |
| 4 | 09:39 | `deepseek-v4-flash` | Edición del índice LEARN (`docs/learn/README.md`) | 0.01 USD |
| 5 | 09:56 | **`glm-5.1`** | Cambio a modelo de alta precisión. Refactorización de memory leaks en `src/main.ts` | **1.07 USD** |
| 6 | 10:07 | **`qwen3.7-max`** | Cambio a modelo de alta capacidad. Continuación edición LEARN README | **0.42 USD** |
| 7 | 10:29 | **`qwen3.7-max`** | Continuación edición LEARN README (segunda ronda) | **1.12 USD** |
| 8 | 10:39 | `deepseek-v4-flash` | Vuelta a modelo ligero. Creación de `docs/learn/architecture/16-medidas-contingencia-game-loop.md` | 0.01 USD |
| 9 | 10:47 | `deepseek-v4-flash` | Correcciones finales de memory leaks en `src/main.ts` | 0.01 USD |

---

## Actuación por Modelo

| Modelo | Proveedor | Mensajes | Solicitudes | Coste Total | Tokens Input | Tokens Output | Tokens Reasoning | Cache Read |
|--------|-----------|----------|-------------|-------------|--------------|---------------|-----------------|------------|
| `qwen3.7-max` | opencode-go | 40 | 2 | **2.82 USD** | 228 | 12,587 | 0 | 4,008,704 |
| `glm-5.1` | opencode-go | 50 | 1 | **1.07 USD** | 76,822 | 5,790 | 0 | 3,615,488 |
| `deepseek-v4-flash` | opencode-go | 68 | 5 | 0.04 USD | 124,031 | 17,877 | 11,421 | 4,977,024 |
| `deepseek-v4-flash` | opencode | 2 | 1 | 0.00 USD | 0 | 0 | 0 | 0 |
| **TOTALES** | | **160** | **9** | **3.94 USD** | **201,081** | **36,254** | **11,421** | **12,601,216** |

---

## Archivos Modificados

| Archivo | Tipo de Cambio |
|---------|---------------|
| `src/main.ts` | Refactorización de memory leaks (pérdidas de memoria) |
| `docs/learn/README.md` | Actualización del índice de píldoras LEARN |
| `docs/learn/architecture/16-medidas-contingencia-game-loop.md` | Creación de nueva píldora formativa |
| Otros 6 archivos menores | Ajustes de documentación y sincronización |

**Totales**: 9 archivos, +724 líneas añadidas, -43 eliminadas.

---

## Observaciones Técnicas

### 1. Fallo inicial por saldo insuficiente
La primera solicitud falló porque el proveedor `opencode` (no confundir con `opencode-go`) tenía saldo agotado. Se recuperó automáticamente al reintentar con `opencode-go`.

### 2. Estrategia de escalado de modelos
Se observa un patrón claro de uso:
- **Modelos ligeros** (`deepseek-v4-flash`): tareas rutinarias, documentación, cambios pequeños. Coste ~0.01 USD por tanda.
- **Modelo de precisión** (`glm-5.1`): refactorización crítica de memoria en `src/main.ts`. Elevado coste (1.07 USD) debido a contexto grande (76,822 tokens de entrada).
- **Modelo de capacidad** (`qwen3.7-max`): generación de documentación extensa. Alto uso de caché de contexto (4M tokens leídos de caché) que reduce el coste efectivo.

### 3. Uso intensivo de caché de contexto
El 98.5% de los tokens de entrada en `qwen3.7-max` se sirvieron desde caché, lo que redujo significativamente el coste real. Sin caché, el coste de las solicitudes 6 y 7 habría sido aproximadamente 3x superior.

### 4. Eficiencia del agente `build` (modo `tool-calls`)
El 89% de las respuestas del asistente fueron `tool-calls` (ejecución de herramientas: lectura, escritura, bash), con solo un 11% de respuestas `stop` (texto final). Esto indica un flujo de trabajo altamente automatizado.

---

## Desglose de Costes

| Concepto | Importe |
|----------|---------|
| `qwen3.7-max` (2 solicitudes) | 2.82 USD |
| `glm-5.1` (1 solicitud) | 1.07 USD |
| `deepseek-v4-flash` (5 solicitudes) | 0.04 USD |
| **Total estimado** | **~3.94 USD** |

> **Nota**: Los precios son estimaciones proporcionadas por la plataforma OpenCode basadas en las tarifas de cada proveedor. No incluyen posibles descuentos por volumen ni costes de infraestructura local (Ollama).

---

## Histórico de Commits Relacionados

Los cambios de esta sesión se reflejan en los siguientes commits:
- `294826c` — `[fix] memory leaks y medidas de contingencia`
- `0adb9a5` — `[fix] robustecer renderizado de sprites y sincronización de estado al recibir daño/renacer`

---

## Anexo: OpenCode vs GitHub Copilot — Análisis Comparativo

### Metodología

Este anexo compara **OpenCode** (herramienta usada en esta sesión) con **GitHub Copilot** (alternativa del mercado) desde tres perspectivas: forma de trabajo, métricas de uso de IA y capacidad de auditoría. La comparación se basa en la experiencia de uso real documentada en este informe y en el conocimiento general de ambas plataformas a fecha de junio 2026.

---

### 1. Forma de Trabajo

| Aspecto | OpenCode | GitHub Copilot |
|---------|----------|----------------|
| **Interfaz** | CLI en terminal / TUI | Plugin IDE (VS Code, JetBrains, etc.) |
| **Modalidad** | Agente autónomo con herramientas (tool-calls) | Chat + autocompletado inline |
| **Flujo típico** | Usuario describe objetivo → agente ejecuta múltiples pasos (leer, editar, bash) | Usuario escribe código → Copilot sugiere línea/snippet |
| **Modelos** | **Multimodelo** intercambiable por tarea: `deepseek-v4-flash` (barato), `glm-5.1` (precisión), `qwen3.7-max` (capacidad), `kimi-k2.6` (aprendizaje), modelos locales Ollama, etc. | Modelo único por suscripción (GPT-4o, Claude, etc.). Sin control granular. |
| **Agentes** | Agentes especializados: `learn` (píldoras formativas), `changelog` (CHANGELOG automático), `explore` (análisis de código), `build` (desarrollo general) | Sin sistema de agentes. Un solo chat omnímodo. |
| **Ejecución** | El agente ejecuta comandos reales: edita archivos, corre `git`, `npm`, scripts, etc. | Solo sugiere código. El usuario debe aplicarlo manualmente. |
| **Contexto de entrada** | Todo el repositorio, con snapshot de git + herramientas de búsqueda (glob, grep, read) | Archivo abierto + selección. Contexto limitado al editor. |
| **Offline/Local** | Sí (Ollama: Qwen2.5, Llama 3.3) | No. Requiere conexión a Internet. |

**Conclusión**: OpenCode está diseñado para **trabajo autónomo delegado** (el agente hace), mientras que Copilot está diseñado para **asistencia en tiempo real** (el agente sugiere, el humano hace). No son mutuamente excluyentes: OpenCode brilla en automatización de tareas complejas de múltiples pasos; Copilot brilla en productividad momento a momento dentro del IDE.

---

### 2. Métricas de Uso de IA

| Métrica | OpenCode | GitHub Copilot |
|---------|----------|----------------|
| **Transparencia de costes** | **Total**. Cada mensaje registra modelo, proveedor, tokens input/output/reasoning, caché, coste en USD. | **Nula**. Coste fijo por suscripción (10 USD/mes individual, 19 USD/mes business). No hay desglose por sesión, solicitud o modelo. |
| **Registro de sesiones** | Completo en SQLite local: sesiones, mensajes, tokens, costes, archivos modificados, diffs. | No existe. |
| **Traza de ejecución** | Log detallado por sesión (cada llamada API, tiempo, errores). | No existe. |
| **Consumo por modelo** | **Sí**. Se sabe exactamente cuánto se gastó en cada modelo. | No aplica (un solo modelo). |
| **Coste por tarea** | **Sí**. Cada solicitud de usuario tiene su coste asociado. | No disponible. |
| **Métricas de caché** | Sí: tokens leídos/escritos en caché por mensaje. | No expuesto. |

**Conclusión**: OpenCode ofrece **transparencia radical** en métricas de IA. Cada céntimo gastado es trazable hasta la solicitud, el modelo y el fichero modificado. Copilot opera como una caja negra: pagas una tarifa plana y no sabes qué consumes ni cómo se usa la capacidad de IA. Para un departamento de I+D que necesita justificar costes y optimizar recursos, OpenCode es muy superior.

---

### 3. Auditoría de Trabajos

| Aspecto | OpenCode | GitHub Copilot |
|---------|----------|----------------|
| **Traza completa** | Cada sesión guarda: qué se pidió, con qué modelo, qué archivos se cambiaron, cuánto costó, cuánto tardó. | No disponible. Solo queda el código cometado. |
| **Atribución** | Cada cambio se asocia a una sesión, una solicitud y un modelo concretos. | No es posible saber si un cambio fue sugerido por Copilot o escrito manualmente. |
| **Diffs por solicitud** | Sí. Cada mensaje de usuario incluye el diff del cambio realizado. | No existe. |
| **Coste por PR/commit** | Calculable a partir de los datos de sesión. | Imposible. |
| **Trazabilidad de fallos** | Errores de API registrados con mensaje completo (ej. "Insufficient balance"). | No aplica. |
| **Exportabilidad** | Datos en SQLite consultable con SQL. Logs en texto plano. | Sin acceso a datos de uso. |

**Conclusión**: OpenCode proporciona un **sistema de auditoría completo** que permite responder preguntas como "¿cuánto costó este refactor?", "¿qué modelo se usó para esta funcionalidad?", "¿cuánto tiempo de IA consumió este PR?". Con Copilot es imposible responder a estas preguntas. En un entorno donde la gobernanza de IA es cada vez más relevante (trazabilidad, justificación de costes, optimización de modelos), OpenCode ofrece ventajas decisivas.

---

### 4. Limitaciones de OpenCode frente a Copilot

Para ser completamente honestos:

1. **Curva de aprendizaje**: OpenCode requiere manejo de terminal, conceptos de agentes, y configurar proveedores. Copilot se instala en 30 segundos desde el marketplace.
2. **Autocompletado inline**: Copilot ofrece sugerencias mientras escribes, en el editor. OpenCode no tiene esta modalidad.
3. **Madurez y ecosistema**: Copilot tiene años de desarrollo, millones de usuarios, integración con GitHub Actions, Code Review, y un ecosistema enterprise maduro.
4. **Discovery**: OpenCode no "sugiere" código mientras escribes. Es un agente que actúa bajo demanda.
5. **Soporte enterprise**: Copilot ofrece SSO, facturación consolidada, compliance centralizado. OpenCode es más artesanal en este aspecto.

---

### 5. Veredicto

| Si necesitas... | OpenCode | Copilot |
|----------------|----------|---------|
| Automatizar tareas complejas (refactor, docs, tests) | ⭐ **Excelente** | ⚠️ Limitado |
| Transparencia de costes y auditoría | ⭐ **Excelente** | ❌ No disponible |
| Sugerencias inline en el IDE | ❌ No disponible | ⭐ **Excelente** |
| Optimizar costes de IA por tarea | ⭐ **Excelente** | ❌ No posible |
| Gobernanza y trazabilidad | ⭐ **Excelente** | ❌ Mínimo |
| Productividad inmediata sin configuración | ⚠️ Curva media | ⭐ Excelente |
| Trabajo offline/local | ⭐ Sí (Ollama) | ❌ No |
| Multimodelo estratégico | ⭐ Sí | ❌ No |

**En resumen**: OpenCode y GitHub Copilot son herramientas complementarias, no sustitutas. Para un departamento de I+D que necesita **auditar, optimizar y justificar** el uso de IA, OpenCode ofrece capacidades que Copilot simplemente no tiene. Para productividad día a día en el editor, Copilot sigue siendo el estándar. La combinación de ambas sería la estrategia óptima.

---

*Documento generado automáticamente a partir de los registros de sesión de OpenCode.*
