import { Celda } from './Celda';
import { GestorMundo } from './GestorMundo';
import { HousingLocal, puedeEditarNodo, type AlmacenamientoLocal } from './housing';
import type { ConectorMundo, DeltaMundo, NodoMundo } from './mundo';

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

class AlmacenMock implements AlmacenamientoLocal {
  private readonly datos: Map<string, string> = new Map();
  getItem(clave: string): string | null {
    return this.datos.has(clave) ? (this.datos.get(clave) as string) : null;
  }
  setItem(clave: string, valor: string): void {
    this.datos.set(clave, valor);
  }
  claves(): string[] {
    return Array.from(this.datos.keys());
  }
}

function crearNodo(
  id: string,
  tipo: NodoMundo['tipo'],
  ownerId: string | null,
): NodoMundo {
  const celdas: Celda[][] = [];
  for (let f = 0; f < 3; f++) {
    celdas[f] = [];
    for (let c = 0; c < 3; c++) {
      const celda = new Celda(f, c);
      celda.esTransitable = true;
      celdas[f][c] = celda;
    }
  }
  return {
    id,
    padreId: null,
    transform: { df: 0, dc: 0 },
    filas: 3,
    columnas: 3,
    tipo,
    gen: { nombre: 'personal', version: 1, seed: 11, params: {} },
    celdas,
    ownerId,
  };
}

function deltaCavar(
  nodoId: string,
  fila: number,
  columna: number,
  autoria: string,
  tick: number,
): DeltaMundo {
  return {
    fmt: 1,
    nodoId,
    fila,
    columna,
    autoria,
    tick,
    cambio: { tipo: 'cavar' },
  };
}

function main(): void {
  // --- Persistencia local roundtrip ---
  const almacen = new AlmacenMock();
  const housing = new HousingLocal('L1', almacen);
  const casa = crearNodo('casa-L1', 'personal', 'L1');

  housing.guardarCasa(casa);
  assert(
    almacen.claves().includes('mazerpg.casa.L1'),
    'guardarCasa escribe bajo la clave exacta mazerpg.casa.{idLocal}',
  );

  const cargada = housing.cargarCasa();
  assert(cargada !== null, 'cargarCasa devuelve el nodo tras guardarCasa');
  assert(cargada?.ownerId === 'L1', 'el roundtrip conserva ownerId');
  assert(
    cargada?.gen.nombre === 'personal' &&
      cargada?.gen.seed === 11 &&
      cargada?.gen.version === 1,
    'el roundtrip conserva gen (nombre, seed, version)',
  );
  assert(cargada?.tipo === 'personal', 'el roundtrip conserva el tipo personal');

  const housingVacio = new HousingLocal('L2', new AlmacenMock());
  assert(housingVacio.cargarCasa() === null, 'cargarCasa sin entrada devuelve null');

  const almacenRoto = new AlmacenMock();
  almacenRoto.setItem('mazerpg.casa.L3', '{esto-no-es-json');
  assert(
    new HousingLocal('L3', almacenRoto).cargarCasa() === null,
    'cargarCasa con JSON corrupto devuelve null (no lanza)',
  );

  const housingSinStorage = new HousingLocal('L4', null);
  housingSinStorage.guardarCasa(casa);
  assert(
    housingSinStorage.cargarCasa() === null,
    'sin almacenamiento disponible no lanza ni devuelve datos',
  );

  // --- Creación del portal personal ---
  const portal = housing.crearPortalPersonal(casa, { fila: 1, columna: 2 });
  assert(portal.tipo === 'portal', "crearPortalPersonal produce tipo 'portal'");
  assert(portal.housingOwnerId === 'L1', 'el portal queda ligado al idLocal como dueño');
  assert(portal.nodoDestinoId === 'casa-L1', 'el destino del portal es la casa del dueño');
  assert(
    portal.filaD === 1 && portal.columnaD === 2,
    'destinoCelda se usa como celda de aparición en la casa',
  );
  assert(portal.id.length > 0, 'el conector tiene id no vacío');
  assert(portal.housingOwnerId !== null, 'housingOwnerId no es null en un portal personal');

  // --- Disponibilidad estricta (fase 1) ---
  const portalSinDueno: ConectorMundo = { ...portal, housingOwnerId: null };
  assert(
    housing.portalDisponible(portal, new Set(['L1'])) === true,
    'portalDisponible es true con el dueño online',
  );
  assert(
    housing.portalDisponible(portal, new Set<string>()) === false,
    'portalDisponible es false con el dueño ausente',
  );
  assert(
    housing.portalDisponible(portal, new Set(['L2', 'L3'])) === false,
    'portalDisponible es false si otro jugador está online pero no el dueño',
  );
  assert(
    housing.portalDisponible(portalSinDueno, new Set(['L1'])) === false,
    'portalDisponible es false si el conector no tiene dueño',
  );

  // --- Edición solo del dueño (deltas ignorados para no-owner) ---
  const gestor = new GestorMundo();
  const personal = crearNodo('casa-L1', 'personal', 'L1');
  gestor.mundo.set(personal.id, personal);

  personal.celdas[0][0].esTransitable = false as boolean;
  assert(
    gestor.aplicarDelta(deltaCavar('casa-L1', 0, 0, 'L1', 1)) === true,
    'el dueño puede aplicar un delta sobre su nodo personal',
  );
  assert(
    personal.celdas[0][0].esTransitable === true,
    'el delta del dueño se aplica a la celda',
  );

  personal.celdas[1][1].esTransitable = false as boolean;
  assert(
    gestor.aplicarDelta(deltaCavar('casa-L1', 1, 1, 'L2', 2)) === false,
    'un delta de un no-owner sobre un nodo personal se rechaza',
  );
  assert(
    personal.celdas[1][1].esTransitable === false,
    'el delta del no-owner no muta la celda personal',
  );

  assert(
    gestor.aplicarDelta(deltaCavar('inexistente', 0, 0, 'L1', 3)) === false,
    'aplicarDelta rechaza un nodo desconocido',
  );

  const mazmorra = crearNodo('m1', 'mazmorra', null);
  gestor.mundo.set(mazmorra.id, mazmorra);
  mazmorra.celdas[0][0].esTransitable = false as boolean;
  assert(
    gestor.aplicarDelta(deltaCavar('m1', 0, 0, 'L9', 4)) === true,
    'un nodo no personal es editable por cualquier autor',
  );
  assert(
    mazmorra.celdas[0][0].esTransitable === true,
    'el delta de un nodo no personal se aplica',
  );

  // --- Helper puro puedeEditarNodo ---
  assert(puedeEditarNodo(personal, 'L1') === true, 'puedeEditarNodo autoriza al dueño');
  assert(puedeEditarNodo(personal, 'L2') === false, 'puedeEditarNodo rechaza al intruso');
  assert(
    puedeEditarNodo(crearNodo('p-sin-dueno', 'personal', null), 'L2') === true,
    'un nodo personal sin dueño no restringe edición',
  );
  assert(
    puedeEditarNodo(mazmorra, 'L2') === true,
    'un nodo no personal es editable por cualquiera',
  );

  // --- Registro del portal personal en el gestor (celda marcada) ---
  const origen = crearNodo('raiz', 'mazmorra', null);
  gestor.mundo.set(origen.id, origen);
  const portalRaiz: ConectorMundo = {
    ...portal,
    id: 'housing-portal-raiz',
    nodoOrigenId: 'raiz',
    filaO: 2,
    columnaO: 2,
    nodoDestinoId: 'casa-L1',
  };
  gestor.registrarPortalPersonal(portalRaiz);
  assert(
    gestor.conectores.get(portalRaiz.id) === portalRaiz,
    'registrarPortalPersonal registra el conector',
  );
  assert(
    origen.celdas[2][2].esPortal === true,
    'registrarPortalPersonal marca la celda de origen como portal',
  );
  assert(
    origen.celdas[2][2].conectorId === portalRaiz.id,
    'registrarPortalPersonal enlaza conectorId en la celda',
  );

  // --- El portal producido por crearPortalPersonal se engancha a la raíz real ---
  const gestorReal = new GestorMundo();
  const raizReal = gestorReal.crearMundoInicial(
    { nombre: 'mazmorra', version: 1, seed: 5, params: {} },
    3,
    3,
  );
  const portalReal = housing.crearPortalPersonal(casa, { fila: 1, columna: 2 });
  assert(
    portalReal.nodoOrigenId === raizReal.id,
    'crearPortalPersonal engancha el portal a la raíz real (sin reescribir nodoOrigenId)',
  );
  gestorReal.registrarPortalPersonal(portalReal);
  assert(
    gestorReal.conectores.get(portalReal.id) === portalReal,
    'el portal de crearPortalPersonal queda registrado y recuperable',
  );
  assert(
    raizReal.celdas[portalReal.filaO][portalReal.columnaO].conectorId === portalReal.id,
    'registrarPortalPersonal marca conectorId en la celda de origen real',
  );
  assert(
    raizReal.celdas[portalReal.filaO][portalReal.columnaO].esPortal === true,
    'registrarPortalPersonal marca esPortal en la celda de origen real',
  );
  assert(
    gestorReal.conectorEn(portalReal.filaO, portalReal.columnaO) === portalReal,
    'conectorEn recupera el portal personal desde la celda de origen',
  );

  console.log(`${ok}/${total} ok`);
}

main();
