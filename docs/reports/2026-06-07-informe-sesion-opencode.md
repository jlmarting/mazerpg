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

*Documento generado automáticamente a partir de los registros de sesión de OpenCode.*
