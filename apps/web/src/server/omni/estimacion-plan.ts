import { precioCaducado } from "@/lib/catalogo";
import { motivoSinReparto } from "@/lib/omni";
import type { EstimacionEscena } from "@/lib/proyectos";
import type { FilaEscena, FilaProyecto } from "../db/esquema";
import { ErrorCatalogo } from "../proveedores/contrato";
import { ErrorOmni } from "./errores";
import { type CosteDeEscenaOmni, costeDeEscenaOmni, segundosPlanificados, totalDeEscenaOmni } from "./escena";

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
  /** La escena es un podcast o un dualcast: solo se produce con un modelo que admita dos personajes. */
  conReparto = false,
): EstimacionEscena {
  const creditos = totalDeEscenaOmni(coste, clips);
  const { modelo, precio } = coste.eleccion;
  // El mismo motivo con el que se rechazaría al confirmar: así el plan no deja aprobar lo que luego no se produce.
  const bloqueo = conReparto ? motivoSinReparto(modelo) : null;
  return {
    ...(bloqueo ? { bloqueo } : {}),
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
export async function costeOmniDelPlan(
  usuarioId: string,
  proyecto: FilaProyecto,
  segundos: number = proyecto.clipSeconds,
): Promise<CosteDeEscenaOmni | null> {
  try {
    return await costeDeEscenaOmni(usuarioId, proyecto, segundos);
  } catch (error) {
    if (error instanceof ErrorCatalogo || error instanceof ErrorOmni) return null;
    throw error;
  }
}

/**
 * Coste de las escenas habladas **por duración**: cada duración tiene su tarifa y su sello, y en un vídeo completo
 * las escenas no duran todas lo mismo (un podcast de 20 s son clips de 8, 6 y 6 s). Se lee una vez por duración
 * distinta, no una por escena. Las duraciones que no salgan de estas escenas no están en el mapa.
 */
export async function costesOmniPorDuracion(
  usuarioId: string,
  proyecto: FilaProyecto,
  escenas: readonly Pick<FilaEscena, "plannedSeconds">[],
): Promise<Map<number, CosteDeEscenaOmni | null>> {
  const duraciones = [...new Set(escenas.map((e) => segundosPlanificados(e, proyecto)))];
  return new Map(
    await Promise.all(duraciones.map(async (s) => [s, await costeOmniDelPlan(usuarioId, proyecto, s)] as const)),
  );
}

/** Sello vigente del precio de una escena hablada de esa duración; `null` fuera del modo Omni o sin modelo con precio. */
export async function selloOmniVigente(
  usuarioId: string,
  proyecto: FilaProyecto,
  segundos: number = proyecto.clipSeconds,
): Promise<string | null> {
  if (proyecto.voiceMode !== "omni") return null;
  return (await costeOmniDelPlan(usuarioId, proyecto, segundos))?.eleccion.precio.sello ?? null;
}

/** Sellos vigentes de las escenas habladas del proyecto por duración; vacío fuera del modo Omni. */
export async function sellosOmniVigentes(
  usuarioId: string,
  proyecto: FilaProyecto,
  escenas: readonly Pick<FilaEscena, "plannedSeconds">[],
): Promise<Map<number, string | null>> {
  if (proyecto.voiceMode !== "omni") return new Map();
  const costes = await costesOmniPorDuracion(usuarioId, proyecto, escenas);
  return new Map([...costes].map(([s, coste]) => [s, coste?.eleccion.precio.sello ?? null] as const));
}
