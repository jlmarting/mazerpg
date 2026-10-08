# LEARN: El import que compila en tu máquina pero no en CI

## Concepto

Git versiona **commits**, no tu disco. El compilador (`tsc`) resuelve los `import`
contra el **sistema de archivos**, no contra el commit. Por eso un archivo puede
existir en tu *working tree* pero **no estar trackeado** — `git status` lo marca como
`?? (untracked)` — y aun así `pnpm build` pasa en tu máquina. En un **clon limpio**
(como hace CI), ese archivo no existe y el build falla con `TS2307: Cannot find module`.

> En una frase: **tu working tree no es tu commit**. Lo que no está en el commit, para
> CI no existe.

## Por qué es importante

- **CI es el clon limpio**: el único lugar que reproduce *exactamente* lo versionado.
- **Fallo silencioso**: el build local pasa → cero señales de alarma → se publica un commit roto.
- **Riesgo doble**: el fichero huérfano suele ser la **única copia**; un `git clean -fd` lo borra sin vuelta atrás.
- **Falsa confianza en el editor/IDE**: el autocompletado y el type-check en vivo también resuelven contra el disco, así que "va todo bien" hasta que otro clona el repo.

## Explicación sencilla

Piensa en **la receta y la despensa**:

- El **commit** es la receta escrita: lo que dices que hace falta para cocinar.
- Tu **disco** es la despensa: lo que de verdad tienes a mano.
- El **compilador** cocina con la despensa, no con la receta.

Apuntas un ingrediente nuevo en la receta (`import { LobbyManager } from './ui/LobbyManager'`)
pero olvidas meterlo en la despensa versionada. En *tu* cocina el plato sale
(el ingrediente está en tu nevera particular). En la cocina de otro —o en CI— no hay
ingrediente y el plato se cae.

Otra imagen: haces la maleta mirando la habitación y crees que lo llevas todo; al
llegar al hotel descubres que falta justo lo que **nunca llegaste a meter en la maleta**
(aunque estaba en la habitación).

## Ejemplo práctico

### El caso real (mazerpg, commit `794b249`)

```typescript
// src/main.ts — ESTO SÍ está en el commit
import { LobbyManager } from './ui/LobbyManager';   // referencia a un fichero…
// ...
this.lobbyManager = new LobbyManager(this);          // …y lo usa
```

```bash
# 1) En TU máquina: parece que todo está bien
$ git status --short
?? src/ui/LobbyManager.ts        # ← está en disco, pero NO en el commit

$ pnpm tsc --noEmit
# exit 0 ✅  (tsc resuelve el import contra el disco: el fichero existe)
```

```bash
# 2) En CI (clon limpio del MISMO commit):
$ git checkout 794b249
$ pnpm build
src/main.ts(8,28): error TS2307: Cannot find module './ui/LobbyManager'
# ❌ el build se rompe — y solo aquí
```

### Cómo detectarlo antes de publicar

```bash
# ¿Qué NO está entrando realmente en el commit?
git status --short              # M = modificado sin stagear · ?? = untracked
git add src/ui/LobbyManager.ts
git diff --cached               # revisa QUÉ entra de verdad antes de commitear
```

```bash
# ¿Algún .gitignore está ocultando un import legítimo?
git check-ignore -v src/ui/LobbyManager.ts
```

### Reproducir un clon limpio SIN tocar tu working tree

La forma más segura: extraer un commit a una carpeta temporal y compilar allí.

```bash
# Exporta exactamente lo que hay EN el commit (sin untracked, sin cambios sin commitear)
mkdir -p /tmp/checkout && git archive 794b249 | tar -x -C /tmp/checkout
cd /tmp/checkout && pnpm install && pnpm build
# → aquí ves lo que verá CI, sin arriesgar tu único fichero huérfano
```

Alternativa rápida (guarda y restaura, incluyendo untracked con `-u`):

```bash
git stash -u        # guarda modificados + untracked (el stash es recuperable)
pnpm build          # compilas como CI
git stash pop       # recupera tu trabajo
```

## Consejo pro

1. **Si un import nuevo no aparece en `git diff --cached` antes del commit, no existe para CI.** Revisa siempre el *staged diff*, no solo el `git status`.
2. **Nunca `git clean -fd`** con trabajo untracked que sea la única copia. Antes: `git clean -n` (simulación) para ver qué borraría.
3. Cuidado con **`.gitignore`**: un patrón amplio (`*.ts`, `dist/`, `*.config.*`) puede excluir un fichero importado del commit y provocar este mismo fallo solo en CI.
4. **`git archive <ref> | tar -x -C /tmp`** es tu "clon limpio" de bolsillo: verifica el commit publicado sin tocar tu árbol ni tu stash.
5. Cuando el build local pasa pero CI falla, tu **primera sospecha** debe ser *estado del working tree vs. commit*, no el compilador.

> **Regla de oro**: confía en el commit, no en tu disco. El compilador es el que te
> miente, porque cocina con lo que tienes en la nevera, no con lo que dice la receta.
