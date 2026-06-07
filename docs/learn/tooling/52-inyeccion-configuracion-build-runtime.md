# LEARN: Inyección de Configuración: Build vs Runtime

## Concepto

Las aplicaciones web necesitan configuraciones que varían según el entorno: claves de API, URLs de backend, flags de debug. Hay dos momentos para inyectar estas configuraciones: **en build time** (cuando Vite compila el proyecto) o **en runtime** (cuando el navegador ejecuta el código).

En nuestro proyecto combinamos ambos enfoques:
- **Build time**: placeholders como `__FIREBASE_API_KEY__` en `index.html` que el pipeline de CI reemplaza con `sed` antes de desplegar.
- **Runtime**: `window.FIREBASE_CONFIG` en el `<script>` del HTML, que se lee en vivo cuando el usuario abre la página.

Esto permite que el **mismo código** funcione en desarrollo local (con `window.FIREBASE_CONFIG` manual) y en producción (con placeholders reemplazados por CI), sin necesidad de builds distintos ni variables de entorno duplicadas.

## Por qué es importante

- **Seguridad**: las claves de API nunca aparecen en el código fuente del repositorio (solo placeholders). El CI las inyecta desde secrets.
- **Flexibilidad**: en desarrollo local, puedes cambiar la config recargando la página. No necesitas recompilar.
- **Despliegue único**: un solo artefacto compilado puede recibir diferentes configs según el entorno de destino (staging, producción, demo).
- **Debugging**: puedes inspeccionar `window.FIREBASE_CONFIG` en la consola del navegador para ver exactamente qué config está activa.

## Explicación sencilla

Imagina que organizas una **fiesta sorpresa** y necesitas que el DJ toque la música correcta:

- **Build time** es como darle al DJ una **lista de canciones impresa** antes de la fiesta. Una vez empieza, no puedes cambiarla sin parar todo.
- **Runtime** es como darle al DJ un **walkie-talkie** para que te pregunte en vivo qué canción tocar. Puedes cambiar de opinión en cualquier momento.

En nuestro juego, el `index.html` es el walkie-talkie: contiene `window.FIREBASE_CONFIG` que el navegador lee al cargar. El pipeline de CI es como reemplazar el walkie-talkie por un **guion prefijado** (la lista impresa) solo en producción.

## Ejemplo práctico

### 1. El HTML con placeholders (`index.html`)

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>MazeRPG</title>
    <!--
      Esta config se lee EN RUNTIME cuando el navegador carga la página.
      En producción, el pipeline de CI (GitHub Actions) reemplaza los
      placeholders __FIREBASE_*__ con valores reales antes de desplegar.
    -->
    <script>
        window.FIREBASE_CONFIG = {
            apiKey: "__FIREBASE_API_KEY__",
            authDomain: "__FIREBASE_AUTH_DOMAIN__",
            projectId: "__FIREBASE_PROJECT_ID__",
            storageBucket: "__FIREBASE_STORAGE_BUCKET__",
            messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
            appId: "__FIREBASE_APP_ID__"
        };

        // URL del servidor de signaling para modo HTTP (también runtime)
        window.SIGNALING_SERVER_URL = "http://localhost:8080";
    </script>
</head>
<body>
    <canvas id="mazeCanvas"></canvas>
    <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

**Qué está pasando aquí**:
- El `<script>` en el `<head>` se ejecuta **antes** de cualquier módulo TypeScript. Define `window.FIREBASE_CONFIG` como propiedad global.
- Los placeholders `__FIREBASE_API_KEY__` son strings literal que **no funcionarían** como clave real. En desarrollo local, ves un warning de Firebase. En producción, el CI los reemplaza.
- `window.SIGNALING_SERVER_URL` es otra config runtime. En local apunta a `localhost:8080`; en producción podría apuntar a `https://signal.tudominio.com`.

### 2. El código lee la config en runtime (`main.ts` y `FirebaseManager.ts`)

```typescript
// main.ts — Declaración de tipos para el global
declare global {
    interface Window {
        SIGNALING_SERVER_URL: string;
    }
}

// FirebaseManager.ts — Lectura de la config en runtime
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

export class FirebaseManager {
    private app: FirebaseApp | null = null;
    private db: Firestore | null = null;

    async inicializar() {
        const config = (window as any).FIREBASE_CONFIG;

        if (!config || config.apiKey === "__FIREBASE_API_KEY__") {
            console.warn("Firebase no configurado. El modo multijugador Firebase no funcionará.");
            return;
        }

        this.app = initializeApp(config);
        this.db = getFirestore(this.app);
    }

    getDb(): Firestore | null {
        return this.db;
    }

    isInitialized(): boolean {
        return this.app !== null;
    }
}
```

**Qué está pasando aquí**:
- `FirebaseManager` no importa la config desde un archivo `.env` o `.ts`. La lee de `window.FIREBASE_CONFIG` en el momento de la inicialización.
- La verificación `config.apiKey === "__FIREBASE_API_KEY__"` detecta si los placeholders **no fueron reemplazados** (desarrollo local o despliegue mal configurado). En ese caso, Firebase se desactiva elegantemente con un warning.
- `getDb()` retorna `null` si no se inicializó. Todas las llamadas a `game.firebase.getDb()` en el código deben manejar ese caso (lo hacen: usan optional chaining o null checks).

### 3. El pipeline de CI reemplaza placeholders en build time (`.github/workflows/firebase-hosting-merge.yml`)

```yaml
# Fragmento del workflow de GitHub Actions
jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Reemplazar placeholders de Firebase
        run: |
          sed -i "s|__FIREBASE_API_KEY__|${{ secrets.FIREBASE_API_KEY }}|g" index.html
          sed -i "s|__FIREBASE_AUTH_DOMAIN__|${{ secrets.FIREBASE_AUTH_DOMAIN }}|g" index.html
          sed -i "s|__FIREBASE_PROJECT_ID__|${{ secrets.FIREBASE_PROJECT_ID }}|g" index.html
          sed -i "s|__FIREBASE_STORAGE_BUCKET__|${{ secrets.FIREBASE_STORAGE_BUCKET }}|g" index.html
          sed -i "s|__FIREBASE_MESSAGING_SENDER_ID__|${{ secrets.FIREBASE_MESSAGING_SENDER_ID }}|g" index.html
          sed -i "s|__FIREBASE_APP_ID__|${{ secrets.FIREBASE_APP_ID }}|g" index.html

      - name: Build
        run: pnpm build

      - name: Deploy to Firebase Hosting
        uses: FirebaseExtended/action-hosting-deploy@v0
```

**Qué está pasando aquí**:
- El reemplazo ocurre **antes** de `pnpm build`. Vite ve el HTML ya con las claves reales y las empaqueta en el bundle.
- Las claves provienen de **GitHub Secrets**, nunca del código fuente. Ni siquiera aparecen en el historial de git.
- `sed -i` reemplaza todos los placeholders in-place en `index.html`. Es una operación simple y reversible (si haces `git checkout index.html` vuelves a placeholders).

### 4. Configuración local sin CI: `window.FIREBASE_CONFIG` manual

```typescript
// En desarrollo local, puedes sobreescribir window.FIREBASE_CONFIG
// desde la consola del navegador antes de cargar el juego:

// 1. Abre la consola (F12)
// 2. Pega tu config real:
window.FIREBASE_CONFIG = {
    apiKey: "tu-api-key-real",
    authDomain: "tu-proyecto.firebaseapp.com",
    projectId: "tu-proyecto",
    // ...
};

// 3. Recarga la página
// El juego leerá esta config en lugar de los placeholders
```

**Qué está pasando aquí**:
- El mismo código (`window.FIREBASE_CONFIG`) funciona en **tres modos**:
  1. **Desarrollo sin config**: placeholders sin reemplazar → Firebase se desactiva, juego funciona en modo local.
  2. **Desarrollo con config manual**: desarrollador pone su config real en consola → Firebase funciona en local.
  3. **Producción**: CI reemplaza placeholders → Firebase funciona para todos los usuarios.

### 5. La señalización HTTP usa la misma técnica (`SignalingClient.ts`)

```typescript
export function getSignalingUrl(): string {
    // Usa el hostname actual con puerto 8080
    // Esto evita problemas con localhost cacheado
    const url = window.location.protocol + '//' + window.location.hostname + ':8080';
    return url;
}

export function crearSignalingClient(url?: string): SignalingClient {
    return new SignalingClient({ serverUrl: url || getSignalingUrl() });
}
```

**Qué está pasando aquí**:
- `getSignalingUrl()` deriva la URL del servidor de signaling **en runtime** a partir de `window.location`. Si accedes al juego por `http://192.168.1.45:5173`, el signaling apuntará a `http://192.168.1.45:8080`.
- Esto permite probar en red local sin modificar código: cualquier dispositivo en la misma red puede acceder al juego y al signaling usando la IP local.

---

### Tabla comparativa: build time vs runtime

| Aspecto | Build time (placeholders + sed) | Runtime (window.*) |
|---------|--------------------------------|-------------------|
| **Cuándo se define** | Durante CI/CD | Cuando el navegador carga |
| **Puede cambiar sin rebuild** | No | Sí |
| **Seguridad** | Alta (secrets nunca en repo) | Media (visible en HTML) |
| **Debugging** | Requiere redeploy | Cambia en consola y recarga |
| **Adecuado para** | API keys, endpoints fijos | URLs dinámicas, flags de feature |
| **Ejemplo en nuestro juego** | Firebase config en CI | `SIGNALING_SERVER_URL` en local |

## Consejo pro

### 1. Nunca cometas secrets en el repo

```typescript
// MAL: clave hardcodeada
const API_KEY = "AIzaSyA-real-key";

// MAL: .env en el repo
// .env.production
FIREBASE_API_KEY=AIzaSyA-real-key

// BIEN: placeholder + CI secrets
// index.html: apiKey: "__FIREBASE_API_KEY__"
// CI: sed -i "s|__FIREBASE_API_KEY__|$FIREBASE_API_KEY|g" index.html
```

Incluso si tu repo es privado, los secrets no deben estar en el historial de git. Es muy difícil eliminarlos completamente una vez cometidos.

### 2. Usa TypeScript para tipar las globals

```typescript
// En un archivo types/globals.d.ts
declare global {
    interface Window {
        FIREBASE_CONFIG: {
            apiKey: string;
            authDomain: string;
            projectId: string;
            // ...
        };
        SIGNALING_SERVER_URL: string;
        __DEBUG_MODE__?: boolean;
    }
}

export {};  // Hacerlo un módulo
```

Esto da autocompletado y validación en tiempo de compilación para `window.FIREBASE_CONFIG`.

### 3. Valida la config al iniciar, no al usar

```typescript
function validarConfig(config: any): config is Window['FIREBASE_CONFIG'] {
    return (
        config &&
        typeof config.apiKey === 'string' &&
        typeof config.authDomain === 'string' &&
        config.apiKey.length > 10  // Heurística básica
    );
}

// Al inicializar:
if (!validarConfig(window.FIREBASE_CONFIG)) {
    console.error("Configuración de Firebase inválida");
    mostrarModal("El juego no está configurado correctamente.");
}
```

### 4. Separa configs por entorno con archivos HTML distintos

Si necesitas configs radicalmente distintas (demo vs producción), considera:

```
index.html          # Producción (placeholders para CI)
index.demo.html     # Demo pública (config pública de Firebase demo)
index.dev.html      # Desarrollo (config vacía, modo offline)
```

Y en Vite:

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: process.env.VITE_APP_MODE === 'demo' ? './index.demo.html' : './index.html'
      }
    }
  }
});
```

### 5. Considera Vite's `import.meta.env` para configs no secretas

Para configuraciones que **no** son secretos (feature flags, tamaño de mapa, nombres de clases), usa las variables de entorno nativas de Vite:

```typescript
// .env
VITE_MAP_SIZE=50
VITE_TICK_RATE=16

// Código
const MAP_SIZE = parseInt(import.meta.env.VITE_MAP_SIZE || '30');
```

Estas variables se inyectan en **build time** y se optimizan (ej. `if (MAP_SIZE === 50)` puede eliminarse por dead code elimination si siempre es 50). Solo úsalas para datos no sensibles.

> **Regla de oro**: los secrets van en build time (CI secrets + placeholders); las configs variables van en runtime (`window.*` o `import.meta.env`). Nunca mezcles ambos en el mismo lugar.
