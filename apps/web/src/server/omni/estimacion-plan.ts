import { precioCaducado } from "@/lib/catalogo";
import type { EstimacionEscena } from "@/lib/proyectos";
import type { FilaProyecto } from "../db/esquema";
import { ErrorCatalogo } from "../proveedores/contrato";
import { ErrorOmni } from "./errores";
import { type CosteDeEscenaOmni, costeDeEscenaOmni, totalDeEscenaOmni } from "./escena";

/**
 * **El plan de una escena hablada** en modo Omni. No hay fotograma ni animación aparte: la escena la genera entera
 * el modelo de escenas habladas, con su duración y su tarifa. Por eso el plan no puede sumar «imagen + vídeo» del
 * mapa como en el modo de siempre; enseña el modelo, los segundos y el total que se van a confirmar al producir.
 *
 * Sin margen prudente a propósito: la confirmación no lo suma, y el plan tiene que decir la misma cifra.
 */
export function estimacionDeEscenaOmni(
  coste: CosteDeEscenaOmni,
  clips: number,
  eurosPorCredito: number,
): EstimacionEscena {
  const creditos = totalDeEscenaOmni(coste, clips);
  const { modelo, precio } = coste.eleccion;
  return {
    creditosFotograma: 0,
    creditosAnimacion: creditos,
    creditos,
    euros: creditos * eurosPorCredito,
    modeloFotograma: "",
    modeloAnimacion: modelo.nombre,
    segundos: coste.segundos,
    comprobado: precio.comprobado,
    precioAntiguo: precioCaducado(precio.comprobado),
    margen: 0,
    selloFotograma: "",
    selloAnimacion: precio.sello,
  };
}

/**
 * Coste de las escenas habladas de un proyecto, leído **una vez** para todas sus escenas; `null` si no hay modelo
 * Omni utilizable con precio, y entonces el plan dice que esas escenas no se pueden estimar, sin inventar cifra.
 */
export async function costeOmniDelPlan(usuarioId: string, proyecto: FilaProyecto): Promise<CosteDeEscenaOmni | null> {
  try {
    return await costeDeEscenaOmni(usuarioId, proyecto);
  } catch (error) {
    if (error instanceof ErrorCatalogo || error instanceof ErrorOmni) return null;
    throw error;
  }
}
