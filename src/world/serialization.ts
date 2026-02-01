import { Celda } from './Celda';

/**
 * Serializa el mapa en una cadena compacta para evitar límites de WebRTC.
 */
export function serializarMapa(mapaLaberinto: Celda[][]): string {
  let resultado = "";
  const filas = mapaLaberinto.length;
  const columnas = filas > 0 ? mapaLaberinto[0].length : 0;
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      const celda = mapaLaberinto[f][c];
      let valor = 0;
      if (celda.muros.superior) valor |= 1;
      if (celda.muros.derecho) valor |= 2;
      if (celda.muros.inferior) valor |= 4;
      if (celda.muros.izquierdo) valor |= 8;
      if (celda.esTransitable) valor |= 16;
      resultado += valor.toString(36);
    }
  }
  return resultado;
}

/**
 * Deserializa el mapa desde una cadena compacta.
 */
export function deserializarMapa(mapaLaberinto: Celda[][], datos: string) {
  let i = 0;
  const filas = mapaLaberinto.length;
  const columnas = filas > 0 ? mapaLaberinto[0].length : 0;
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      const valor = parseInt(datos[i++], 36);
      const celda = mapaLaberinto[f][c];
      celda.muros.superior = !!(valor & 1);
      celda.muros.derecho = !!(valor & 2);
      celda.muros.inferior = !!(valor & 4);
      celda.muros.izquierdo = !!(valor & 8);
      celda.esTransitable = !!(valor & 16);
    }
  }
}
