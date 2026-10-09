import { dentroDeBurbuja, radioSimPorDefecto, RADIO_SIM_DEFECTO } from './burbuja';
import { RADIO_VISION } from './constants';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) {
    throw new Error(`FALLO: ${mensaje}`);
  }
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

function main(): void {
  assert(dentroDeBurbuja(0, 0, 3, 0, 3) === true, 'el borde horizontal exacto es interior (inclusive)');
  assert(dentroDeBurbuja(0, 0, 4, 0, 3) === false, 'una celda a distancia 4 con radio 3 es exterior');
  assert(dentroDeBurbuja(5, 5, 5, 5, 3) === true, 'el propio centro siempre está dentro');
  assert(dentroDeBurbuja(0, 0, 3, 3, 3) === false, 'el borde diagonal (3,3) es exterior (distancia ~4.24)');
  assert(dentroDeBurbuja(0, 0, 2, 2, 3) === true, 'la diagonal (2,2) es interior (distancia ~2.83)');
  assert(dentroDeBurbuja(0, 0, 3, 0, 0) === false, 'radio 0 excluye celdas vecinas');
  assert(dentroDeBurbuja(0, 0, 0, 0, 0) === true, 'radio 0 incluye el propio centro');

  assert(RADIO_SIM_DEFECTO > 0, 'el radio de simulación por defecto es positivo');
  assert(radioSimPorDefecto(RADIO_VISION) <= RADIO_VISION, 'radioSim por defecto respeta radioSim <= radioVis');
  assert(radioSimPorDefecto(1) === 1, 'radioSim se recorta al radioVis cuando este es menor');
  assert(radioSimPorDefecto(1) <= 1, 'radioSim por defecto con radioVis=1 respeta el invariante');
  assert(radioSimPorDefecto(10) <= 10 && radioSimPorDefecto(10) > 0, 'radioSim por defecto es positivo y no supera radioVis');

  console.log(`${ok}/${total} ok`);
}

main();
