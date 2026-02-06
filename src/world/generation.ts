import { Celda } from './Celda';
import { NUMERO_FILAS, NUMERO_COLUMNAS } from './constants';

const TAMANO_MINIMO_NODO = 6;

export function eliminarMurosEntre(celdaA: Celda, celdaB: Celda) {
  const diferenciaFila = celdaA.fila - celdaB.fila;
  const diferenciaColumna = celdaA.columna - celdaB.columna;

  if (diferenciaFila === 1) {
    celdaA.muros.superior = false;
    celdaB.muros.inferior = false;
  } else if (diferenciaFila === -1) {
    celdaA.muros.inferior = false;
    celdaB.muros.superior = false;
  }

  if (diferenciaColumna === 1) {
    celdaA.muros.izquierdo = false;
    celdaB.muros.derecho = false;
  } else if (diferenciaColumna === -1) {
    celdaA.muros.derecho = false;
    celdaB.muros.izquierdo = false;
  }
}

class NodoEspacial {
  fila: number;
  columna: number;
  alto: number;
  ancho: number;
  hijoIzquierdo: NodoEspacial | null = null;
  hijoDerecho: NodoEspacial | null = null;
  sala: { fila: number; columna: number; alto: number; ancho: number } | null = null;
  mapaLaberinto: Celda[][];

  constructor(fila: number, columna: number, alto: number, ancho: number, mapaLaberinto: Celda[][]) {
    this.fila = fila;
    this.columna = columna;
    this.alto = alto;
    this.ancho = ancho;
    this.mapaLaberinto = mapaLaberinto;
  }

  dividir(): boolean {
    if (this.hijoIzquierdo || this.hijoDerecho) return false;

    let dividirHorizontalmente = Math.random() > 0.5;
    if (this.ancho > this.alto && this.ancho / this.alto >= 1.25) dividirHorizontalmente = false;
    else if (this.alto > this.ancho && this.alto / this.ancho >= 1.25) dividirHorizontalmente = true;

    const maximoEspacio = (dividirHorizontalmente ? this.alto : this.ancho) - TAMANO_MINIMO_NODO;
    if (maximoEspacio < TAMANO_MINIMO_NODO) return false;

    const puntoDeCorte = Math.floor(Math.random() * (maximoEspacio - TAMANO_MINIMO_NODO)) + TAMANO_MINIMO_NODO;

    if (dividirHorizontalmente) {
      this.hijoIzquierdo = new NodoEspacial(this.fila, this.columna, puntoDeCorte, this.ancho, this.mapaLaberinto);
      this.hijoDerecho = new NodoEspacial(this.fila + puntoDeCorte, this.columna, this.alto - puntoDeCorte, this.ancho, this.mapaLaberinto);
    } else {
      this.hijoIzquierdo = new NodoEspacial(this.fila, this.columna, this.alto, puntoDeCorte, this.mapaLaberinto);
      this.hijoDerecho = new NodoEspacial(this.fila, this.columna + puntoDeCorte, this.alto, this.ancho - puntoDeCorte, this.mapaLaberinto);
    }
    return true;
  }

  crearSalasYPasillos() {
    if (this.hijoIzquierdo || this.hijoDerecho) {
      if (this.hijoIzquierdo) this.hijoIzquierdo.crearSalasYPasillos();
      if (this.hijoDerecho) this.hijoDerecho.crearSalasYPasillos();

      const salaIzq = this.hijoIzquierdo ? this.hijoIzquierdo.obtenerSala() : null;
      const salaDer = this.hijoDerecho ? this.hijoDerecho.obtenerSala() : null;

      if (salaIzq && salaDer) {
        this.crearPasilloEntre(salaIzq, salaDer);
      }
    } else {
      const altoSala = Math.floor(Math.random() * (this.alto - 4)) + 3;
      const anchoSala = Math.floor(Math.random() * (this.ancho - 4)) + 3;
      const filaSala = this.fila + Math.floor(Math.random() * (this.alto - altoSala - 2)) + 1;
      const colSala = this.columna + Math.floor(Math.random() * (this.ancho - anchoSala - 2)) + 1;

      this.sala = { fila: filaSala, columna: colSala, alto: altoSala, ancho: anchoSala };

      for (let f = filaSala; f < filaSala + altoSala; f++) {
        for (let c = colSala; c < colSala + anchoSala; c++) {
          this.mapaLaberinto[f][c].esTransitable = true;
          if (f + 1 < filaSala + altoSala) eliminarMurosEntre(this.mapaLaberinto[f][c], this.mapaLaberinto[f + 1][c]);
          if (c + 1 < colSala + anchoSala) eliminarMurosEntre(this.mapaLaberinto[f][c], this.mapaLaberinto[f][c + 1]);
        }
      }
    }
  }

  obtenerSala(): { fila: number; columna: number; alto: number; ancho: number } | null {
    if (this.sala) return this.sala;
    let salaIzq: { fila: number; columna: number; alto: number; ancho: number } | null = null;
    let salaDer: { fila: number; columna: number; alto: number; ancho: number } | null = null;

    if (this.hijoIzquierdo) salaIzq = this.hijoIzquierdo.obtenerSala();
    if (this.hijoDerecho) salaDer = this.hijoDerecho.obtenerSala();

    if (!salaIzq && !salaDer) return null;
    if (!salaIzq) return salaDer;
    if (!salaDer) return salaIzq;
    return Math.random() > 0.5 ? salaIzq : salaDer;
  }

  crearPasilloEntre(salaA: { fila: number; columna: number; alto: number; ancho: number }, salaB: { fila: number; columna: number; alto: number; ancho: number }) {
    let puntoA = { f: salaA.fila + Math.floor(salaA.alto / 2), c: salaA.columna + Math.floor(salaA.ancho / 2) };
    let puntoB = { f: salaB.fila + Math.floor(salaB.alto / 2), c: salaB.columna + Math.floor(salaB.ancho / 2) };

    let fActual = puntoA.f;
    let cActual = puntoA.c;

    while (cActual !== puntoB.c) {
      let siguienteC = cActual < puntoB.c ? cActual + 1 : cActual - 1;
      this.mapaLaberinto[fActual][cActual].esTransitable = true;
      this.mapaLaberinto[fActual][siguienteC].esTransitable = true;
      eliminarMurosEntre(this.mapaLaberinto[fActual][cActual], this.mapaLaberinto[fActual][siguienteC]);
      cActual = siguienteC;
    }
    while (fActual !== puntoB.f) {
      let siguienteF = fActual < puntoB.f ? fActual + 1 : fActual - 1;
      this.mapaLaberinto[fActual][cActual].esTransitable = true;
      this.mapaLaberinto[siguienteF][cActual].esTransitable = true;
      eliminarMurosEntre(this.mapaLaberinto[fActual][cActual], this.mapaLaberinto[siguienteF][cActual]);
      fActual = siguienteF;
    }
  }
}

export function generarLaberintoBSP(mapaLaberinto: Celda[][]) {
  console.log("Iniciando generación de laberinto BSP...");
  let raiz = new NodoEspacial(0, 0, NUMERO_FILAS, NUMERO_COLUMNAS, mapaLaberinto);
  let todosLosNodos = [raiz];
  let huboDivision = true;
  let seguridadBSP = 0;

  while (huboDivision && seguridadBSP < 500) {
    seguridadBSP++;
    huboDivision = false;
    for (let i = 0; i < todosLosNodos.length; i++) {
      if (!todosLosNodos[i].hijoIzquierdo && !todosLosNodos[i].hijoDerecho) {
        if (todosLosNodos[i].dividir()) {
          todosLosNodos.push(todosLosNodos[i].hijoIzquierdo!);
          todosLosNodos.push(todosLosNodos[i].hijoDerecho!);
          huboDivision = true;
        }
      }
    }
  }
  raiz.crearSalasYPasillos();

  // Post-procesamiento: asegurar que celdas transitables adyacentes no tengan muros entre ellas
  for (let f = 0; f < NUMERO_FILAS; f++) {
    for (let c = 0; c < NUMERO_COLUMNAS; c++) {
      if (mapaLaberinto[f][c].esTransitable) {
        if (f + 1 < NUMERO_FILAS && mapaLaberinto[f + 1][c].esTransitable) {
          eliminarMurosEntre(mapaLaberinto[f][c], mapaLaberinto[f + 1][c]);
        }
        if (c + 1 < NUMERO_COLUMNAS && mapaLaberinto[f][c + 1].esTransitable) {
          eliminarMurosEntre(mapaLaberinto[f][c], mapaLaberinto[f][c + 1]);
        }
      }
    }
  }

  if (!mapaLaberinto[0][0].esTransitable) {
    for (let f = 0; f < NUMERO_FILAS; f++) {
      for (let c = 0; c < NUMERO_COLUMNAS; c++) {
        if (mapaLaberinto[f][c].esTransitable) {
          trazarRutaDirecta(mapaLaberinto, 0, 0, f, c);
          break;
        }
      }
      if (mapaLaberinto[0][0].esTransitable) break;
    }
  }

  if (!mapaLaberinto[NUMERO_FILAS - 1][NUMERO_COLUMNAS - 1].esTransitable) {
    for (let f = NUMERO_FILAS - 1; f >= 0; f--) {
      for (let c = NUMERO_COLUMNAS - 1; c >= 0; c--) {
        if (mapaLaberinto[f][c].esTransitable) {
          trazarRutaDirecta(mapaLaberinto, NUMERO_FILAS - 1, NUMERO_COLUMNAS - 1, f, c);
          break;
        }
      }
      if (mapaLaberinto[NUMERO_FILAS - 1][NUMERO_COLUMNAS - 1].esTransitable) break;
    }
  }

  function trazarRutaDirecta(mapa: Celda[][], f1: number, c1: number, f2: number, c2: number) {
    let fActual = f1, cActual = c1;
    while (cActual !== c2) {
      let sigC = cActual < c2 ? cActual + 1 : cActual - 1;
      mapa[fActual][cActual].esTransitable = true;
      mapa[fActual][sigC].esTransitable = true;
      eliminarMurosEntre(mapa[fActual][cActual], mapa[fActual][sigC]);
      cActual = sigC;
    }
    while (fActual !== f2) {
      let sigF = fActual < f2 ? fActual + 1 : fActual - 1;
      mapa[fActual][cActual].esTransitable = true;
      mapa[sigF][cActual].esTransitable = true;
      eliminarMurosEntre(mapa[fActual][cActual], mapa[sigF][cActual]);
      fActual = sigF;
    }
  }
}

export function generarMapaHogar(mapa: Celda[][]) {
  const filas = mapa.length;
  const columnas = mapa[0].length;
  const centroF = Math.floor(filas / 2);
  const centroC = Math.floor(columnas / 2);

  // 1. Inicializar como agua
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      const celda = mapa[f][c];
      celda.tipoTerreno = 'agua';
      celda.esTransitable = false;
      celda.muros = { superior: false, inferior: false, izquierdo: false, derecho: false };
      celda.esParedGruesa = false;
      celda.decoracion = null;
    }
  }

  // 2. Generar isla (cesped)
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      const dist = Math.sqrt(Math.pow(f - centroF, 2) + Math.pow(c - centroC, 2));
      const noise = Math.sin(f * 0.15) * 3 + Math.cos(c * 0.15) * 3;
      if (dist < 40 + noise) {
        const celda = mapa[f][c];
        celda.tipoTerreno = 'cesped';
        celda.esTransitable = true;
        if (Math.random() < 0.04) celda.decoracion = 'arbol';
      }
    }
  }

  // 3. Costa (arena y rocas) - Más profundidad
  const celdasCosta: {f: number, c: number}[] = [];
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      if (mapa[f][c].tipoTerreno === 'cesped') {
        let esBorde = false;
        for (let df = -1; df <= 1; df++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nf = f + df;
            const nc = c + dc;
            if (nf >= 0 && nf < filas && nc >= 0 && nc < columnas && mapa[nf][nc].tipoTerreno === 'agua') {
              esBorde = true;
            }
          }
        }
        if (esBorde) celdasCosta.push({f, c});
      }
    }
  }

  celdasCosta.forEach(pos => {
      const celda = mapa[pos.f][pos.c];
      const tipo = Math.random() < 0.7 ? 'arena' : 'roca';
      celda.tipoTerreno = tipo;

      // Profundidad de 2-3 celdas
      const depth = Math.floor(Math.random() * 2) + 2;
      for(let d=1; d<=depth; d++) {
          const df = Math.sign(centroF - pos.f);
          const dc = Math.sign(centroC - pos.c);
          const nf = pos.f + df * d;
          const nc = pos.c + dc * d;
          if (nf >= 0 && nf < filas && nc >= 0 && nc < columnas && mapa[nf][nc].tipoTerreno === 'cesped') {
              mapa[nf][nc].tipoTerreno = tipo;
          }
      }
  });

  // Vegetación de costa
  for (let f = 0; f < filas; f++) {
      for (let c = 0; c < columnas; c++) {
          const celda = mapa[f][c];
          if (celda.tipoTerreno === 'arena' && Math.random() < 0.15) celda.decoracion = 'palmera';
          if (celda.tipoTerreno === 'roca' && Math.random() < 0.1) celda.decoracion = 'pino';
      }
  }

  // 4. Ríos (1-5)
  const numRios = Math.floor(Math.random() * 5) + 1;
  for (let r = 0; r < numRios; r++) {
    const angulo = Math.random() * Math.PI * 2;
    const distIni = 20 + Math.random() * 30;
    let curF = Math.round(centroF + Math.sin(angulo) * distIni);
    let curC = Math.round(centroC + Math.cos(angulo) * distIni);

    let riverPath: {f: number, c: number}[] = [];

    for (let i = 0; i < 150; i++) {
      if (curF < 0 || curF >= filas || curC < 0 || curC >= columnas) break;
      const celda = mapa[curF][curC];
      if (celda.tipoTerreno === 'agua' && i > 10) break; // Llegó al mar

      celda.tipoTerreno = 'agua';
      celda.esTransitable = false;
      celda.decoracion = null;
      riverPath.push({f: curF, c: curC});

      // Mover hacia afuera de forma meándrica
      const df = Math.sign(curF - centroF) || (Math.random() > 0.5 ? 1 : -1);
      const dc = Math.sign(curC - centroC) || (Math.random() > 0.5 ? 1 : -1);

      if (Math.random() < 0.7) {
          if (Math.random() > 0.5) curF += df;
          else curC += dc;
      } else {
          // Meandro (perpendicular)
          if (Math.random() > 0.5) curF += dc;
          else curC -= df;
      }
    }

    // Puente en el primer río
    if (r === 0 && riverPath.length > 20) {
        const midIdx = Math.floor(riverPath.length / 2);
        const p = riverPath[midIdx];
        mapa[p.f][p.c].tipoTerreno = 'puente';
        mapa[p.f][p.c].esTransitable = true;
    }
  }

  // 5. Casas (1-4 clustered)
  const numCasas = Math.floor(Math.random() * 4) + 1;
  const clusterF = centroF + Math.floor(Math.random() * 10) - 5;
  const clusterC = centroC + Math.floor(Math.random() * 10) - 5;

  for (let h = 0; h < numCasas; h++) {
    const casaF = clusterF + Math.floor(Math.random() * 20) - 10;
    const casaC = clusterC + Math.floor(Math.random() * 20) - 10;
    const numRooms = Math.floor(Math.random() * 4) + 2; // 2-5 habitaciones

    const rooms: {f: number, c: number, w: number, h: number}[] = [];

    // First room
    let rw = Math.floor(Math.random() * 5) + 4;
    let rh = Math.floor(Math.random() * 5) + 4;
    rooms.push({ f: casaF, c: casaC, w: rw, h: rh });

    for (let i = 1; i < numRooms; i++) {
        const base = rooms[Math.floor(Math.random() * rooms.length)];
        let nrw = Math.floor(Math.random() * 4) + 4;
        let nrh = Math.floor(Math.random() * 4) + 4;
        let nf = base.f;
        let nc = base.c;

        const side = Math.floor(Math.random() * 4);
        if (side === 0) nf = base.f - nrh + 1;
        else if (side === 1) nf = base.f + base.h - 1;
        else if (side === 2) nc = base.c - nrw + 1;
        else nc = base.c + base.w - 1;

        rooms.push({ f: nf, c: nc, w: nrw, h: nrh });
    }

    // Apply rooms to map and walls
    rooms.forEach(room => {
        for (let f = room.f; f < room.f + room.h; f++) {
            for (let c = room.c; c < room.c + room.w; c++) {
                if (f < 0 || f >= filas || c < 0 || c >= columnas) continue;
                const celda = mapa[f][c];
                celda.tipoTerreno = 'baldosa';
                celda.esTransitable = true;
                celda.decoracion = null;

                // Set walls (we'll thicken external ones later)
                if (f === room.f) celda.muros.superior = true;
                if (f === room.f + room.h - 1) celda.muros.inferior = true;
                if (c === room.c) celda.muros.izquierdo = true;
                if (c === room.c + room.w - 1) celda.muros.derecho = true;
            }
        }
    });

    // Remove internal walls and mark external as thick
    for (let f = 0; f < filas; f++) {
        for (let c = 0; c < columnas; c++) {
            const celda = mapa[f][c];
            if (celda.tipoTerreno !== 'baldosa') continue;

            const checkExt = (nf: number, nc: number) => {
                if (nf < 0 || nf >= filas || nc < 0 || nc >= columnas) return true;
                return mapa[nf][nc].tipoTerreno !== 'baldosa';
            };

            if (celda.muros.superior) {
                if (!checkExt(f - 1, c)) {
                    // Internal wall, make it a door with 30% probability
                    if (Math.random() < 0.3) celda.muros.superior = false;
                }
                else celda.esParedGruesa = true;
            }
            if (celda.muros.inferior) {
                if (!checkExt(f + 1, c)) {
                    if (Math.random() < 0.3) celda.muros.inferior = false;
                }
                else celda.esParedGruesa = true;
            }
            if (celda.muros.izquierdo) {
                if (!checkExt(f, c - 1)) {
                    if (Math.random() < 0.3) celda.muros.izquierdo = false;
                }
                else celda.esParedGruesa = true;
            }
            if (celda.muros.derecho) {
                if (!checkExt(f, c + 1)) {
                    if (Math.random() < 0.3) celda.muros.derecho = false;
                }
                else celda.esParedGruesa = true;
            }
        }
    }

    // Ensure connectivity: doors between rooms and one external door
    // For simplicity, we already removed internal walls.
    // Now just add one external door.
    const mainRoom = rooms[0];
    const doorSide = Math.floor(Math.random() * 4);
    let df = 0, dc = 0;
    if (doorSide === 0) { df = mainRoom.f; dc = mainRoom.c + Math.floor(mainRoom.w / 2); mapa[df][dc].muros.superior = false; mapa[df][dc].esParedGruesa = false; }
    else if (doorSide === 1) { df = mainRoom.f + mainRoom.h - 1; dc = mainRoom.c + Math.floor(mainRoom.w / 2); mapa[df][dc].muros.inferior = false; mapa[df][dc].esParedGruesa = false; }
    else if (doorSide === 2) { df = mainRoom.f + Math.floor(mainRoom.h / 2); dc = mainRoom.c; mapa[df][dc].muros.izquierdo = false; mapa[df][dc].esParedGruesa = false; }
    else { df = mainRoom.f + Math.floor(mainRoom.h / 2); dc = mainRoom.c + mainRoom.w - 1; mapa[df][dc].muros.derecho = false; mapa[df][dc].esParedGruesa = false; }

    // Add furniture
    rooms.forEach(room => {
        for (let f = room.f + 1; f < room.f + room.h - 1; f++) {
            for (let c = room.c + 1; c < room.c + room.w - 1; c++) {
                if (f < 0 || f >= filas || c < 0 || c >= columnas) continue;
                if (Math.random() < 0.1) {
                    const muebles = ['sofa', 'cama', 'mesa', 'silla'];
                    mapa[f][c].decoracion = muebles[Math.floor(Math.random() * muebles.length)];
                }
            }
        }
    });
  }
}
