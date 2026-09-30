import { eq } from "drizzle-orm";
import {
  type FormatoMontaje,
  formatoPrincipal,
  formatosDe,
  formatosGenerables,
  formatosValidos,
  PLATAFORMA_DE_FORMATO,
} from "@/lib/formatos";
import { proyectoPropio } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { eleccionesDelPlan, modelosDelPlan } from "../asistente/plan";
import { db } from "../db/cliente";
import { type FilaProyecto, projects, scenes } from "../db/esquema";
import type { Actor } from "../media/servicio";

/**
 * **Formatos de un proyecto** (0.41.0): cuáles tiene y cuál es el principal.
 *
 * - **El principal decide la proporción que se le pide al modelo.** Por eso solo se acepta si los modelos que el
 *   usuario tiene elegidos lo admiten según el catálogo, y solo se cambia mientras el plan no está aprobado ni hay
 *   clips: cambiarlo después dejaría escenas generadas en una proporción y aprobadas para otra.
 * - **Los demás se sacan en el montaje con reencuadre**, sin regenerar nada ni llamar a ningún proveedor. Añadirlos
 *   o quitarlos es gratis y se puede hacer siempre.
 *
 * Cambiar la lista no toca el montaje ni su versión: lo que cambia los píxeles de un formato es su encuadre, y ese
 * se guarda con la línea de tiempo.
 */

/**
 * Exige que se pueda generar en ese formato con los modelos del usuario. Es la puerta de la API: lo que la
 * pantalla no ofrece, tampoco se acepta aunque llegue en una petición.
 */
export async function exigirFormatoGenerable(usuarioId: string, formato: FormatoMontaje): Promise<void> {
  const motivo = formatosGenerables(modelosDelPlan(await eleccionesDelPlan(usuarioId)))[formato];
  if (motivo) throw new ErrorProyecto(409, motivo);
}

/** `true` si el proyecto ya no admite cambiar de formato principal: plan aprobado o algún clip generado. */
async function principalCongelado(proyecto: FilaProyecto): Promise<boolean> {
  if (proyecto.planApprovedAt !== null) return true;
  const filas = await db().select({ clip: scenes.clipMediaId }).from(scenes).where(eq(scenes.projectId, proyecto.id));
  return filas.some((f) => f.clip !== null);
}

/**
 * Cambia los formatos del proyecto. `crudo` es la lista tal cual llega de la petición: el primero es el principal.
 * Devuelve la lista guardada.
 */
export async function cambiarFormatosDelProyecto(
  actor: Actor,
  proyectoId: unknown,
  crudo: unknown,
): Promise<FormatoMontaje[]> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const formatos = formatosValidos(crudo);
  if (!formatos) {
    throw new ErrorProyecto(
      400,
      "Envía en «formatos» una lista sin repetidos de «vertical_9_16», «vertical_4_5», «cuadrado_1_1» u «horizontal_16_9». El primero es el principal.",
    );
  }
  const anteriores = formatosDe(proyecto.formats);
  const principal = formatoPrincipal(formatos);
  if (principal !== formatoPrincipal(anteriores)) {
    if (await principalCongelado(proyecto)) {
      throw new ErrorProyecto(
        409,
        `El formato principal decide la proporción en la que se generan los clips, y este proyecto ya tiene el plan aprobado o clips generados en «${PLATAFORMA_DE_FORMATO[formatoPrincipal(anteriores)]}». Añade «${PLATAFORMA_DE_FORMATO[principal]}» como formato más: sale del mismo clip con reencuadre y no cuesta nada.`,
      );
    }
    await exigirFormatoGenerable(actor.id, principal);
  }
  await db().update(projects).set({ formats: formatos, updatedAt: new Date() }).where(eq(projects.id, proyecto.id));
  return formatos;
}
