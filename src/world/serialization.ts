import { Celda } from './Celda';

/**
 * Serializa el mapa en una cadena compacta para evitar límites de WebRTC.
 * Con opts.v2 añade un tail con secciones dispersas de decor (S/D/E).
 */
export function serializarMapa(mapaLaberinto: Celda[][], opts?: { v2?: boolean }): string {
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

  if (opts?.v2) {
    resultado += serializarColaV2(mapaLaberinto, filas, columnas);
  }
  return resultado;
}

/**
 * Tail v2: secciones |S (sueloDecor), |D (mueble), |E (tipoEscenario + estadoEscenario),
 * solo para celdas con valor ≠ por defecto y solo secciones con ≥1 registro.
 * Coordenadas en base36; valores textuales tal cual.
 */
function serializarColaV2(mapaLaberinto: Celda[][], filas: number, columnas: number): string {
  let seccionS = "";
  let seccionD = "";
  let seccionE = "";
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      const celda = mapaLaberinto[f][c];
      if (!celda) continue;
      if (celda.sueloDecor !== null) {
        seccionS += (seccionS ? ';' : '') + f.toString(36) + ',' + c.toString(36) + ',' + celda.sueloDecor;
      }
      if (celda.mueble !== null) {
        seccionD += (seccionD ? ';' : '') + f.toString(36) + ',' + c.toString(36) + ',' + celda.mueble;
      }
      if (celda.tipoEscenario !== 'ninguno') {
        seccionE += (seccionE ? ';' : '') + f.toString(36) + ',' + c.toString(36) + ',' + celda.tipoEscenario + ',' + celda.estadoEscenario;
      }
    }
  }
  let cola = "";
  if (seccionS) cola += "|S" + seccionS;
  if (seccionD) cola += "|D" + seccionD;
  if (seccionE) cola += "|E" + seccionE;
  return cola;
}

/**
 * Deserializa el mapa desde una cadena compacta.
 * Retorna las dimensiones detectadas en el stream.
 * Payload v1 (sin |): comportamiento idéntico a fase 1 — el tail nunca se lee
 * porque el bloque base se interpreta carácter a carácter hasta agotar filas*columnas.
 * Payload v2: tras el bloque base, si hay |, decodifica secciones S/D/E sobre
 * las celdas en rango; secciones con letra desconocida se saltan; registros
 * con coordenadas fuera de rango se ignoran.
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

  // Tail v2 (secciones dispersas de decor)
  const finBase = 6 + filas * columnas;
  if (datos.length > finBase && datos.charAt(finBase) === '|') {
    aplicarColaV2(mapaLaberinto, filas, columnas, datos.substring(finBase + 1));
  }

  return { filas, columnas };
}

/**
 * Decodifica el tail v2: separa secciones por | y salta las de letra desconocida.
 */
function aplicarColaV2(mapaLaberinto: Celda[][], filas: number, columnas: number, cola: string): void {
  for (const parte of cola.split('|')) {
    if (parte.length === 0) continue;
    const letra = parte.charAt(0);
    if (letra === 'S') {
      aplicarSeccion(mapaLaberinto, filas, columnas, parte.substring(1), (celda, campos) => {
        const material = campos[2];
        if (material === 'madera' || material === 'baldosa' || material === 'alfombra') {
          celda.sueloDecor = material;
        }
      });
    } else if (letra === 'D') {
      aplicarSeccion(mapaLaberinto, filas, columnas, parte.substring(1), (celda, campos) => {
        celda.mueble = campos.slice(2).join(',');
      });
    } else if (letra === 'E') {
      aplicarSeccion(mapaLaberinto, filas, columnas, parte.substring(1), (celda, campos) => {
        if (campos[2] === 'puerta' || campos[2] === 'trampa') {
          celda.tipoEscenario = campos[2];
          celda.estadoEscenario = campos.slice(3).join(',');
        }
      });
    }
    // letra desconocida: saltar hasta el próximo | (el split ya la aísla)
  }
}

/**
 * Aplica los registros (separados por ;) de una sección a las celdas en rango.
 * Los registros fuera de rango o con coordenadas inválidas se ignoran.
 */
function aplicarSeccion(
  mapaLaberinto: Celda[][],
  filas: number,
  columnas: number,
  cuerpo: string,
  aplicar: (celda: Celda, campos: string[]) => void,
): void {
  for (const registro of cuerpo.split(';')) {
    if (!registro) continue;
    const campos = registro.split(',');
    const f = parseInt(campos[0], 36);
    const c = parseInt(campos[1], 36);
    if (Number.isNaN(f) || Number.isNaN(c) || f < 0 || c < 0 || f >= filas || c >= columnas) continue;
    const celda = mapaLaberinto[f] ? mapaLaberinto[f][c] : undefined;
    if (!celda) continue;
    aplicar(celda, campos);
  }
}
