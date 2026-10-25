import { calcularRadiosInteres, RADIO_SIM_AUTORIDAD, type MetricasInteres, type RadiosInteres } from './interes';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) throw new Error(`FALLO: ${mensaje}`);
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

function metricas(overrides: Partial<MetricasInteres> = {}): MetricasInteres {
  return {
    dispositivo: 'pc',
    clase: 'guerrero',
    jugadores: 1,
    fps: 60,
    fpsBajoMs: 0,
    fpsAltoMs: 0,
    anterior: null,
    ...overrides,
  };
}

function radios(m: Partial<MetricasInteres> = {}): RadiosInteres {
  return calcularRadiosInteres(metricas(m));
}

function iguales(r: RadiosInteres, sim: number, vis: number, etiqueta: string): void {
  assert(r.radioSim === sim && r.radioVis === vis, `${etiqueta}: esperado ${sim}/${vis}, obtenido ${r.radioSim}/${r.radioVis}`);
}

function main(): void {
  iguales(radios({ dispositivo: 'pc' }), 2, 3, 'base PC');
  iguales(radios({ dispositivo: 'tablet' }), 2, 3, 'base tablet');
  iguales(radios({ dispositivo: 'movil' }), 1, 3, 'base móvil');
  iguales(radios({ dispositivo: 'pc', clase: 'explorador' }), 2, 4, 'explorador PC parte de vis 4');
  iguales(radios({ dispositivo: 'movil', clase: 'explorador' }), 1, 3, 'explorador móvil respeta el cap 3');

  // FPS bajo: primero sim, luego vis, y no baja de los mínimos.
  iguales(radios({ anterior: { radioSim: 2, radioVis: 3 }, fpsBajoMs: 2000 }), 1, 3, 'FPS bajo baja sim');
  iguales(radios({ anterior: { radioSim: 1, radioVis: 3 }, fpsBajoMs: 2000 }), 1, 2, 'FPS bajo con sim al mínimo baja vis a 2');
  iguales(radios({ anterior: { radioSim: 1, radioVis: 2 }, fpsBajoMs: 2000 }), 1, 2, 'FPS bajo no baja de los mínimos');
  iguales(radios({ anterior: { radioSim: 2, radioVis: 3 }, fpsBajoMs: 1999 }), 2, 3, 'FPS bajo por debajo de 2 s no cambia');

  // FPS alto: sube un paso por ventana, sim antes que vis.
  iguales(radios({ anterior: { radioSim: 1, radioVis: 2 }, fpsAltoMs: 5000 }), 2, 2, 'FPS alto sube sim');
  iguales(radios({ anterior: { radioSim: 2, radioVis: 3 }, fpsAltoMs: 5000 }), 3, 3, 'FPS alto sube sim a 3 en PC');
  iguales(radios({ anterior: { radioSim: 2, radioVis: 2 }, fpsAltoMs: 5000 }), 2, 3, 'FPS alto sube vis cuando sim ya toca vis');
  iguales(radios({ anterior: { radioSim: 3, radioVis: 3 }, fpsAltoMs: 5000 }), 3, 4, 'FPS alto sube vis cuando sim está en cap');
  iguales(radios({ anterior: { radioSim: 3, radioVis: 5 }, fpsAltoMs: 5000 }), 3, 5, 'FPS alto no pasa del cap');
  iguales(radios({ anterior: { radioSim: 1, radioVis: 2 }, fpsAltoMs: 4999 }), 1, 2, 'FPS alto por debajo de 5 s no cambia');

  // Jugadores: cap de sim sin tocar vis.
  iguales(radios({ anterior: { radioSim: 3, radioVis: 5 }, jugadores: 3 }), 2, 5, '3 jugadores capan sim en 2');
  iguales(radios({ anterior: { radioSim: 2, radioVis: 5 }, jugadores: 5 }), 1, 5, '5 jugadores capan sim en 1');

  // Explorador no acumula +1 en llamadas sucesivas.
  iguales(radios({ dispositivo: 'pc', clase: 'explorador', anterior: { radioSim: 2, radioVis: 4 } }), 2, 4, 'explorador no acumula vis');

  // Dispositivo con caps distintos: al pasar a móvil se recorta.
  iguales(radios({ dispositivo: 'movil', anterior: { radioSim: 3, radioVis: 5 } }), 2, 3, 'cambio a móvil recorta a caps');

  // Saneo de anterior inválido y del invariante.
  iguales(radios({ anterior: { radioSim: 9, radioVis: -1 } }), 2, 2, 'anterior inválido se sanea y respeta sim <= vis');
  iguales(radios({ anterior: { radioSim: 5, radioVis: 9 }, dispositivo: 'movil' }), 2, 3, 'anterior fuera de caps se recorta');

  // Invariante en barrido de combinaciones.
  let invariante = true;
  for (const dispositivo of ['movil', 'tablet', 'pc'] as const) {
    for (const clase of ['guerrero', 'explorador']) {
      for (const jugadores of [1, 3, 5]) {
        for (const fpsBajoMs of [0, 2000]) {
          for (const fpsAltoMs of [0, 5000]) {
            for (const anterior of [null, { radioSim: 1, radioVis: 2 }, { radioSim: 3, radioVis: 5 }, { radioSim: 9, radioVis: 9 }]) {
              const r = calcularRadiosInteres(metricas({ dispositivo, clase, jugadores, fpsBajoMs, fpsAltoMs, anterior }));
              const capVis = dispositivo === 'movil' ? 3 : dispositivo === 'tablet' ? 4 : 5;
              if (!(r.radioSim >= 1 && r.radioSim <= r.radioVis && r.radioVis <= capVis)) {
                invariante = false;
                console.error('invariante roto', { dispositivo, clase, jugadores, fpsBajoMs, fpsAltoMs, anterior, r });
              }
            }
          }
        }
      }
    }
  }
  assert(invariante, 'invariante 1 <= sim <= vis <= cap en todas las combinaciones');
  assert(RADIO_SIM_AUTORIDAD === 3, 'el radio de autoridad es 3');

  console.log(`${ok}/${total} ok`);
}

main();
