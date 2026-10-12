/**
 * Contrato serializable del equipo y la mochila (persistencia y red).
 *
 * Análogo a `AparienciaAvatar`: payload **versionado** (`formato: 1`) y saneado
 * en la frontera. Viaja en la sesión guardada y en la ficha/partida. Un payload
 * inválido devuelve `null` para que el llamador conserve su estado (retrocompat:
 * sesiones/fichas viejas sin este campo no se ven afectadas).
 */
import { ITEMS, type ItemDef } from '../config/items';
import {
  equipoVacio, sanearEquipo, sanearInventario as sanearMochila,
  type Equipo, type Inventario,
} from './equipo';

export interface InventarioGuardado {
  formato: 1;
  puesto: Equipo;
  bulto: string[];
  mochila: Inventario;
}

/** Estado vacío (sin equipo, bulto ni mochila). Objetos nuevos: no comparte referencias. */
export function inventarioGuardadoVacio(): InventarioGuardado {
  return { formato: 1, puesto: equipoVacio(), bulto: [], mochila: {} };
}

/** Sanea un payload crudo; `null` si no es un objeto `formato: 1` (retrocompat). */
export function sanearEquipoGuardado(raw: unknown, cat: Record<string, ItemDef> = ITEMS): InventarioGuardado | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.formato !== 1) return null;

  const out = inventarioGuardadoVacio();
  out.puesto = sanearEquipo(obj.puesto, cat);

  if (Array.isArray(obj.bulto)) {
    const bulto: string[] = [];
    for (const id of obj.bulto) {
      if (typeof id !== 'string') continue;
      if (cat[id]?.tipo !== 'equipo') continue;
      bulto.push(id);
    }
    out.bulto = bulto;
  }

  out.mochila = sanearMochila(obj.mochila, cat);
  return out;
}
