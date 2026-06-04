# LEARN: TypeScript Strict como Gate de Calidad

## Concepto

TypeScript puede operar en varios niveles de "estrictura". En nuestro proyecto activamos tres opciones clave en `tsconfig.json`:

- **`strict: true`**: activa todas las comprobaciones estrictas (null checks, asignaciones seguras, this checks, etc.).
- **`noUnusedLocals: true`**: falla la compilación si hay variables locales declaradas pero no usadas.
- **`noUnusedParameters: true`**: falla la compilación si hay parámetros de función declarados pero no usados.

Combinadas, estas opciones convierten el compilador TypeScript en un **gate de calidad automático**: `pnpm build` no genera el bundle si existe código muerto, parámetros huérfanos, o accesos potencialmente inseguros a `null`/`undefined`.

## Por qué es importante

- **Código limpio desde el origen**: no se acumula "deuda técnica" de variables olvidadas. Cada PR que pasa CI tiene garantía de limpieza.
- **Prevención de bugs silenciosos**: `strict: true` obliga a manejar explícitamente los casos `null` y `undefined`. En un juego donde `mapaLaberinto[f][c]` podría ser undefined en los bordes, esto evita crashes en runtime.
- **Refactorización segura**: puedes renombrar propiedades, cambiar firmas de funciones y confiar en que el compilador te dirá exactamente qué archivos necesitan actualización.
- **Onboarding más rápido**: los nuevos desarrolladores reciben feedback inmediato en su IDE (errores en rojo) antes de intentar compilar.

## Explicación sencilla

Imagina que estás escribiendo una **receta de cocina** para tu restaurante:

- **`strict: true`** es como un **chef inspector** que revisa cada paso: "¿estás seguro de que ese huevo no es null? ¿Verificaste que la sartén esté caliente antes de echar el aceite?"
- **`noUnusedLocals`** es como un **camarero organizado** que se queja si dejas ingredientes en la mesa que no usaste: "¿por qué compraste perejil si no está en ningún plato?"
- **`noUnusedParameters`** es como un **jefe de cocina** que pregunta: "¿por qué tu función 'cocinar' pide 'temperatura' si nunca la consultas?"

Al principio parece exigente, pero el resultado es que tu cocina (código) nunca sirve platos crudos (null pointer exceptions) ni desperdicia ingredientes (código muerto).

## Ejemplo práctico

### 1. La configuración (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,

    // === GATES DE CALIDAD ===
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

**Qué está pasando aquí**:
- `strict: true` es un "macro" que activa ~10 flags individuales (`noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, etc.).
- `noEmit: true` significa que TypeScript no genera archivos `.js`; solo verifica tipos. Vite se encarga de la compilación real.
- `include: ["src"]` limita la verificación al directorio fuente. Archivos de config o tests pueden tener reglas distintas.

### 2. `strict: true` en acción: null safety

```typescript
// ANTES (sin strict):
function obtenerCelda(mapa: Celda[][], f: number, c: number) {
    return mapa[f][c];  // mapa[f] podría ser undefined, y [c] podría ser undefined
}

// USO inseguro:
const celda = obtenerCelda(mapa, 999, 0);
console.log(celda.esTransitable);  // 💥 CRASH EN RUNTIME: celda is undefined
```

```typescript
// DESPUÉS (con strict):
function obtenerCelda(mapa: Celda[][], f: number, c: number): Celda | undefined {
    return mapa[f]?.[c];  // Optional chaining devuelve undefined si algo falta
}

// USO seguro:
const celda = obtenerCelda(mapa, 999, 0);
if (celda) {
    console.log(celda.esTransitable);  // ✅ Seguro
} else {
    console.warn("Celda fuera de límites");
}
```

**Qué está pasando aquí**:
- Con `strict: true`, `mapa[f][c]` sin optional chaining es un **error de compilación** si `mapa[f]` puede ser `undefined`.
- El compilador fuerza al programador a manejar el caso `undefined`, eliminando una clase entera de bugs (null pointer exceptions).
- En nuestro juego, esto es crítico porque `mapaLaberinto` se accede desde múltiples sistemas (renderer, IA, pathfinding, combate).

### 3. `noUnusedLocals`: detectar código muerto

```typescript
// ANTES: compila sin problemas (pero la variable 'arma' nunca se usa)
function resolverCombate(atacante: IEntidadRPG, defensor: IEntidadRPG) {
    const arma = atacante.clase;  // ❌ Variable declarada pero no usada
    const daño = atacante.generarAtaque();
    defensor.recibirDano(daño);
}
```

```bash
# Al ejecutar pnpm build:
Error: src/entities/EntidadRPG.ts(71,9): error TS6133: 'arma' is declared but its value is never read.
```

```typescript
// DESPUÉS: código limpio
function resolverCombate(atacante: IEntidadRPG, defensor: IEntidadRPG) {
    const daño = atacante.generarAtaque();
    defensor.recibirDano(daño);
}
```

**Qué está pasando aquí**:
- `noUnusedLocals` falla el build por una variable sin usar. Esto suena drástico, pero evita que el código se llene de variables olvidadas durante experimentos o debugging.
- El error es de **compilación**, no de runtime. Lo detectas inmediatamente al guardar el archivo o al ejecutar `pnpm build`.

### 4. `noUnusedParameters`: parámetros documentados, no olvidados

```typescript
// ANTES: parámetro '_atacante' declarado pero no usado en el cuerpo
class JugadorRemoto extends EntidadRPG {
  recibirDano(cantidad: number, _atacante?: EntidadRPG | null): number {
    return super.recibirDano(cantidad, _atacante);  // ¿Pero se usa _atacante?
  }
}
```

En nuestro código, `_atacante` **sí** se pasa a `super.recibirDano`, por lo que no es un caso de parámetro sin usar. Pero imaginemos un error real:

```typescript
// ❌ ERROR DE COMPILACIÓN con noUnusedParameters
function calcularDistancia(f1: number, c1: number, f2: number, c2: number) {
    // Olvidamos usar c1
    return Math.sqrt(Math.pow(f1 - f2, 2) + Math.pow(c2 - c2, 2));  // c2 - c2 = 0!
}
```

```bash
Error: TS6133: 'c1' is declared but its value is never read.
```

**Qué está pasando aquí**:
- El compilador detectó que `c1` no se leyó nunca. Esto reveló un bug: la fórmula debería usar `c1`, no `c2 - c2`.
- Con el prefijo `_` (convención TypeScript) puedes marcar parámetros como "intencionalmente no usados" si son requeridos por una interfaz.

### 5. El flujo de trabajo: build antes de commit

```bash
# En el proyecto
pnpm tsc --noEmit     # Verificación de tipos (igual que el build)
pnpm build            # Type check + Vite bundling
```

**Qué está pasando aquí**:
- `pnpm tsc --noEmit` ejecuta solo el type checker. Es más rápido que el build completo y detecta los mismos errores.
- En CI (GitHub Actions, GitLab CI), este comando corre antes de permitir merge. Si falla, el PR se bloquea.
- Nuestro `AGENTS.md` documenta explícitamente: "`pnpm build` fails on unused variables or parameters. Do not ignore these errors."

---

### Tabla: errores comunes y soluciones con strict mode

| Error | Ejemplo | Solución |
|-------|---------|----------|
| `TS2532` | `obj.prop` cuando `obj` puede ser null | `obj?.prop` o `if (obj)` |
| `TS6133` | Variable declarada pero no usada | Eliminar o usar la variable |
| `TS7006` | Parámetro sin tipo explícito | Añadir `: Tipo` al parámetro |
| `TS2322` | Asignar `string` a `number` | Corregir el tipo o castear con validación |
| `TS7027` | `switch` sin `default` | Añadir `default` o `noFallthroughCasesInSwitch` |

## Consejo pro

### 1. No desactives strict mode "temporalmente"

Es tentador poner `// @ts-ignore` o desactivar `strict` cuando hay prisa. Resiste. Cada excepción es una puerta abierta para bugs. Si tienes un error legítimo que no puedes resolver ahora, usa `// @ts-expect-error` con una explicación:

```typescript
// @ts-expect-error: Firebase types are incompatible until v10 upgrade
const db = firebase.firestore();
```

`@ts-expect-error` es mejor que `@ts-ignore` porque falla si el error desaparece (es decir, te avisa cuando ya no es necesario).

### 2. Usa `_` para parámetros no usados que vienen de interfaces

```typescript
// La interfaz IEntidadRPG exige recibirDano(cantidad, atacante)
// pero JugadorRemoto no necesita atacante para nada especial
recibirDano(cantidad: number, _atacante?: EntidadRPG | null): number {
    return super.recibirDano(cantidad, _atacante);
}
```

El prefijo `_` silencia `noUnusedParameters` para ese parámetro específico.

### 3. Configura tu IDE para mostrar errores en tiempo real

VSCode con la extensión oficial de TypeScript muestra subrayados rojos en el editor. Configura:

```json
// .vscode/settings.json
{
  "typescript.validate.enable": true,
  "typescript.tsc.autoDetect": "off",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

Así los errores de `noUnusedLocals` aparecen mientras escribes, no solo en CI.

### 4. Gradual adoption en proyectos legacy

Si heredas un proyecto sin `strict: true`, no lo actives de golpe. Usa:

```json
{
  "compilerOptions": {
    "strict": false,
    "noUnusedLocals": true,
    "noImplicitAny": true
  }
}
```

Activa los flags uno a uno, arreglando los errores en cada paso. Nuestro proyecto los activó desde el inicio, lo cual es mucho más fácil.

### 5. El costo de strict mode es cero en runtime

Todas las comprobaciones de TypeScript desaparecen en la compilación. El JavaScript generado no tiene ni rastro de `noUnusedLocals` ni `strictNullChecks`. El "costo" es solo en tiempo de desarrollo, y el beneficio es código más robusto.

> **Regla de oro**: trata los errores del compilador como mensajes de un mentor técnico exigente. Ignorarlos es como ignorar las advertencias de un humo detector: puede que no pase nada... hasta que pase.
