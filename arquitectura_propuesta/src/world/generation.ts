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
