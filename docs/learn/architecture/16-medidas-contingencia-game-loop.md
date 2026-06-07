# LEARN: Medidas de contingencia para game loops en el navegador

## Concepto

Cuando un game loop se ejecuta en el navegador mediante `requestAnimationFrame`, no tienes control directo sobre los recursos del sistema. Si el loop consume demasiada CPU o memoria, el navegador puede congelarse, y en casos extremos, afectar a todo el sistema operativo. Las **medidas de contingencia** son mecanismos automáticos que detectan problemas de rendimiento y toman acción preventiva antes de que el usuario pierda el control.

## Por qué es importante

- **El navegador no te avisa**: si tu game loop está consumiendo el 100% de CPU, el navegador simplemente se vuelve lento o no responde. No hay un "task manager" visible para el usuario promedio.
- **Pestañas en background**: cuando el usuario cambia de pestaña, el navegador reduce la prioridad de tu JavaScript, pero el game loop sigue intentando ejecutarse. Esto puede causar acumulación de trabajo pendiente.
- **El usuario no puede escapar**: si el navegador está congelado, el usuario no puede hacer clic en botones ni usar la interfaz. La única opción es matar el proceso desde el sistema operativo.
- **Protección del SO**: en casos extremos, un game loop mal comportado puede consumir tanta memoria que el sistema operativo empieza a hacer swap, degradando todo el equipo.

## Explicación sencilla

Imagina que estás conduciendo un coche sin frenos. Si el motor se acelera demasiado, no tienes forma de detenerlo. Las medidas de contingencia son como instalar:
1. Un sensor que detecta cuando vas demasiado rápido y frena automáticamente
2. Un botón de emergencia que apaga el motor instantáneamente
3. Un sistema que pausa el motor cuando no estás mirando la carretera

## Ejemplo práctico

### 1. Auto-pause al perder foco (visibilitychange) — Solo en modo solitario

**Importante**: En juegos multiplayer, especialmente si el jugador es el host, NO se debe pausar el juego al cambiar de pestaña, ya que dejaría al resto de jugadores parados. El auto-pause solo tiene sentido en modos de juego solitarios.

```typescript
class Game {
  private juegoPausado: boolean = false;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      // Solo pausar en modo solitario (no multiplayer)
      if (document.hidden && this.motorIniciado && !this.network.multiplayerActivo) {
        this.pausarJuego();
      } else if (!document.hidden && this.juegoPausado && !this.network.multiplayerActivo) {
        this.reanudarJuego();
      }
    });
  }

  pausarJuego() {
    if (this.juegoPausado || !this.motorIniciado) return;
    this.juegoPausado = true;
    if (this.gameLoopId !== null) {
      cancelAnimationFrame(this.gameLoopId);
      this.gameLoopId = null;
    }
    console.log('⏸️ Juego pausado (pestaña en background)');
  }

  reanudarJuego() {
    if (!this.juegoPausado) return;
    this.juegoPausado = false;
    this.cicloDeJuego();
    console.log('▶️ Juego reanudado');
  }
}
```

### 2. Monitor de FPS con auto-pause

```typescript
class Game {
  private ultimoFrameTime: number = 0;
  private fpsBajoContador: number = 0;
  private readonly FPS_MINIMO: number = 15;
  private readonly FPS_UMBRAL_SEGUNDOS: number = 3;

  cicloDeJuego() {
    const ahora = performance.now();
    if (this.ultimoFrameTime > 0) {
      const delta = ahora - this.ultimoFrameTime;
      const fps = 1000 / delta;
      
      if (fps < this.FPS_MINIMO) {
        this.fpsBajoContador += delta / 1000;
        if (this.fpsBajoContador >= this.FPS_UMBRAL_SEGUNDOS) {
          console.log(`⚠️ FPS bajo detectado (${fps.toFixed(1)}). Pausando automáticamente.`);
          this.pausarJuego();
          return;
        }
      } else {
        this.fpsBajoContador = Math.max(0, this.fpsBajoContador - delta / 1000);
      }
    }
    this.ultimoFrameTime = ahora;

    this.actualizar();
    this.renderizar();
    this.gameLoopId = requestAnimationFrame(() => this.cicloDeJuego());
  }
}
```

### 3. Hotkey de emergencia

```typescript
constructor() {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'Q') {
      e.preventDefault();
      if (confirm('¿Forzar recarga de emergencia?')) {
        window.location.reload();
      }
    }
  });
}
```

### 4. Botón del pánico accesible para usuarios touch

Los hotkeys de teclado (`Ctrl+Shift+Q`) no son accesibles para usuarios en dispositivos táctiles. Un **botón del pánico** visible y opcional permite a estos usuarios forzar una recarga de emergencia cuando el juego se congela.

```html
<!-- Toggle en el menú de opciones -->
<label style="display: flex; align-items: center; gap: 8px; padding: 8px 12px;">
    <input type="checkbox" id="panicBtnToggle">
    BOTÓN DEL PÁNICO
</label>

<!-- Botón circular rojo en la esquina superior derecha -->
<button id="panicButton" style="position: fixed; top: 15px; right: 15px; 
    width: 50px; height: 50px; border-radius: 50%; 
    background: #dc3545; color: white; border: 3px solid #fff; 
    font-size: 20px; font-weight: bold; cursor: pointer; 
    z-index: 100; display: none;">⚠</button>
```

```typescript
// Mostrar/ocultar según toggle
const panicToggle = document.getElementById('panicBtnToggle') as HTMLInputElement;
panicToggle.addEventListener('change', () => {
    const panicBtn = document.getElementById('panicButton');
    if (panicBtn) {
        panicBtn.style.display = panicToggle.checked ? 'block' : 'none';
    }
});

// Acción idéntica al hotkey
const panicBtn = document.getElementById('panicButton');
panicBtn.addEventListener('click', () => {
    if (confirm('¿Forzar recarga de emergencia?')) {
        window.location.reload();
    }
});
```

### 5. Monitor de FPS visible en modo debug

Mostrar los FPS en tiempo real cuando el modo debug está activado permite detectar problemas de rendimiento antes de que se conviertan en congelamientos. El color del indicador cambia a rojo cuando los FPS caen por debajo del umbral crítico.

```typescript
cicloDeJuego() {
    const ahora = performance.now();
    if (this.ultimoFrameTime > 0) {
        const delta = ahora - this.ultimoFrameTime;
        const fps = 1000 / delta;
        
        // Mostrar FPS solo en modo debug
        if (this.config.vistaDebugActivada) {
            const fpsDisplay = document.getElementById('fpsDisplay');
            if (fpsDisplay) {
                fpsDisplay.style.display = 'block';
                fpsDisplay.textContent = `FPS: ${fps.toFixed(1)}`;
                fpsDisplay.style.color = fps < this.FPS_MINIMO ? '#ff4444' : '#0f0';
            }
        } else {
            const fpsDisplay = document.getElementById('fpsDisplay');
            if (fpsDisplay) fpsDisplay.style.display = 'none';
        }
        
        // ⚠️ TRAMPA: confirm() bloquea el event loop. El primer frame tras el
        // diálogo tiene un delta enorme (~segundos) y el FPS calculado es ~0.
        // Si no tratamos esto, el auto-pause se dispararía en falso.
        if (fps < this.FPS_MINIMO) {
            if (delta > 1000) {
                this.fpsBajoContador = 0;  // Reseteamos, fue un bloqueo, no baja de rendimiento real
            } else {
                this.fpsBajoContador += delta / 1000;
            }
            // Auto-pause solo en modo solitario (no multiplayer)
            if (this.fpsBajoContador >= this.FPS_UMBRAL_SEGUNDOS && !this.network.multiplayerActivo) {
                this.pausarJuego();
                return;
            }
        } else {
            this.fpsBajoContador = Math.max(0, this.fpsBajoContador - delta / 1000);
        }
        
        // ... resto del game loop ...
    }
    this.ultimoFrameTime = ahora;
    // ...
}
```

> **Trampa del `confirm()`**: `confirm()`, `alert()` y `prompt()` son síncronos y bloquean el event loop del navegador. Mientras el diálogo está abierto, `requestAnimationFrame` no se ejecuta. Al cerrarlo, el primer frame tiene un delta artificialmente enorme. Si tu monitor de FPS no distingue entre "bloqueo por diálogo" y "baja de rendimiento real", el auto-pause se disparará en falso. La solución: si `delta > 1000ms`, asume que fue un bloqueo síncrono y resetea el contador en lugar de incrementarlo.

## Consejo pro

Establece estas cinco capas de defensa como **estándar del equipo** para cualquier juego en el navegador:

```typescript
// Capa 1: Auto-pause en background (solo modo solitario)
// En multiplayer, especialmente como host, NO pausar para no afectar a otros jugadores
document.addEventListener('visibilitychange', handleVisibility);

// Capa 2: Monitor de FPS con auto-pause (siempre)
// Detecta degradación progresiva y pausa antes del colapso

// Capa 3: Hotkey de emergencia (siempre)
// Ctrl+Shift+Q para escapar cuando todo lo demás falla

// Capa 4: Botón del pánico opcional (para usuarios touch)
// Toggle en opciones, botón rojo visible en esquina superior derecha

// Capa 5: FPS display en modo debug (siempre)
// Permite detectar problemas de rendimiento antes de que se conviertan en congelamientos
```

**Reglas adicionales:**
- Nunca confíes en que el usuario cerrará la pestaña manualmente. Si el navegador está congelado, no puede.
- Usa `performance.now()` en lugar de `Date.now()` para medir tiempos. Es más preciso y no se ve afectado por cambios en el reloj del sistema.
- El umbral de FPS bajo debe ser conservador (15-20 FPS). Si lo pones muy alto (30 FPS), pausarás juegos legítimos en hardware modesto.
- El contador de segundos (`FPS_UMBRAL_SEGUNDOS`) evita pausas por picos momentáneos de carga.
- Siempre muestra un mensaje al usuario cuando pauses automáticamente. Si no, pensará que el juego se rompió.
- **Nunca uses `confirm()`, `alert()` o `prompt()` en un game loop.** Si necesitas una confirmación, implementa tu propio modal asíncrono. Si por alguna razón debes usarlos (como en el botón del pánico), protege el monitor de FPS contra el delta bloqueado (`delta > 1000` = reseteo).

**Para debugging avanzado:**
```typescript
// Exponer métricas en consola para diagnóstico
setInterval(() => {
  if (this.motorIniciado) {
    const fps = 1000 / (performance.now() - this.ultimoFrameTime);
    console.log(`FPS: ${fps.toFixed(1)}, Pausado: ${this.juegoPausado}`);
  }
}, 5000);
```
