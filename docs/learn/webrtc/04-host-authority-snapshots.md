# LEARN: Host-Authority con Snapshots y Snap-back

## Concepto

En un juego multijugador con arquitectura **Host-Autoritativo**, solo una máquina (el host) ejecuta la lógica del mundo y decide la "verdad". Los clientes envían sus intenciones (acciones) y reciben **snapshots periódicos** con el estado real. Para que la experiencia no se sienta como un slideshow de 1998, los clientes predicen localmente sus movimientos... pero el host corrige desviaciones grandes mediante un **umbral de tolerancia** (*snap-back*).

## Por qué es importante

- **Evita trampas**: el cliente nunca manda "estoy aquí"; manda "quiero moverme", y el host decide.
- **Mantiene la coherencia**: todos ven el mismo mundo porque hay una única fuente de verdad.
- **Equilibra respuesta visual y precisión**: la predicción local da feedback inmediato; el *snap-back* evita que los jugadores atraviesen paredes por desfases de red.

## Explicación sencilla

Imagina una coreografía de salsa en una pista grande. Hay un **coreógrafo** (host) que dicta los pasos. Los bailarines (clientes) pueden adelantarse un poco si escuchan mal la música, pero si se separan más de un metro del paso oficial, el coreógrafo les tira del brazo y los reubica. No los corrige por cada micro-desfase (eso sería un baile robótico), solo cuando la diferencia es **notable**.

## Ejemplo práctico

En nuestro juego, el host envía un snapshot completo en cada tick:

**Host enviando estado (`main.ts`)**:
```typescript
enviarSnapshot() {
  const snapshot: any = { tipo: 'snapshot', entities: [] };

  // 1. Estado del host
  snapshot.entities.push({
    id: this.network.idLocal,
    f: this.protagonista.fila,
    c: this.protagonista.columna,
    v: this.protagonista.vidaActual,
    // ... más campos compactos
  });

  // 2. Estado de jugadores remotos
  this.network.jugadoresRemotos.forEach((j: any, id: string) => {
    if (j.entidad && id !== 'host') {
      snapshot.entities.push({ id, f: j.entidad.fila, c: j.entidad.columna, /* ... */ });
    }
  });

  // 3. Estado de NPCs (enemigos)
  snapshot.entities.push(...this.listaDeEnemigos.map(e => ({
    id: (e as any).id, f: e.fila, c: e.columna, v: e.vidaActual, isNpc: true
  })));

  // Enviar a todos por el canal P2P
  this.network.enviarMensaje(snapshot);
}
```

**Cliente aplicando corrección con umbral (`main.ts`)**:
```typescript
case 'snapshot':
  msg.entities.forEach((entData: any) => {
    // ... actualizar NPCs y jugadores remotos directamente

    // Para el jugador LOCAL solo corregimos si la discrepancia es grande
    if (entData.id === this.network.idLocal) {
      const dist = Math.sqrt(
        Math.pow(this.protagonista.fila - entData.f, 2) +
        Math.pow(this.protagonista.columna - entData.c, 2)
      );

      // Umbral de 1.1 tiles: si estoy muy lejos de la verdad, "snap"
      if (dist > 1.1) {
        this.protagonista.fila = entData.f;
        this.protagonista.columna = entData.c;
      }

      // Siempre sincronizo vida y estado (no hay predicción local de daño)
      this.protagonista.vidaActual = entData.v;
      this.protagonista.vidaMaxima = entData.vm;
      this.protagonista.estaVivo = entData.viva;
    }
  });
```

## Consejo pro

Elige tu **umbral de snap-back** con criterio de juego, no de red:

- **Muy bajo** (< 0.5 tiles): sentirás constantes micro-teletransportes por cualquier lag.
- **Muy alto** (> 3 tiles): los jugadores podrían atravesar muros o quedar fuera de sync durante segundos.
- **1.0–1.5 tiles** es un sweet spot para juegos por turnos o de ritmo moderado como este.

Además, si tu juego tiene física compleja, considera interpolar la corrección en lugar de teletransportar de golpe (interpolación lineal durante 100-200 ms). Aquí usamos snap directo porque el movimiento es discreto (celdas), pero en un platformer sería visualmente violento.

> **Regla de oro**: el host decide, el cliente predice, pero el cliente **siempre cede** cuando la discrepancia supera el umbral de tolerancia.
