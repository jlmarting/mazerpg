import { Celda } from './Celda';

/**
 * Serializa el mapa en una cadena compacta para evitar límites de WebRTC.
 */
export function serializarMapa(mapaLaberinto: Celda[][]): string {
  let resultado = "";
  const filas = mapaLaberinto.length;
  const columnas = filas > 0 ? mapaLaberinto[0].length : 0;

  // Incluimos dimensiones al inicio para que el receptor sepa qué esperar
  resultado += filas.toString(36).padStart(3, '0');
  resultado += columnas.toString(36).padStart(3, '0');

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
 * Retorna las dimensiones detectadas en el stream.
 */
export function deserializarMapa(mapaLaberinto: Celda[][], datos: string): { filas: number, columnas: number } {
  let i = 0;
  const filas = parseInt(datos.substring(i, i + 3), 36); i += 3;
  const columnas = parseInt(datos.substring(i, i + 3), 36); i += 3;

  // Redimensionar el mapa si es necesario
  if (mapaLaberinto.length !== filas) {
    mapaLaberinto.length = filas;
  }

  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      const valor = parseInt(datos[i++], 36);
      if (!mapaLaberinto[f]) mapaLaberinto[f] = [];
      if (mapaLaberinto[f].length !== columnas) {
          mapaLaberinto[f].length = columnas;
      }
      if (!mapaLaberinto[f][c]) mapaLaberinto[f][c] = new Celda(f, c);

      const celda = mapaLaberinto[f][c];
      celda.muros.superior = !!(valor & 1);
      celda.muros.derecho = !!(valor & 2);
      celda.muros.inferior = !!(valor & 4);
      celda.muros.izquierdo = !!(valor & 8);
      celda.esTransitable = !!(valor & 16);
    }
  }
  return { filas, columnas };
}
