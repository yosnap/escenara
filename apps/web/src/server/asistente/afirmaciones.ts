import { eq } from "drizzle-orm";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import { type EstadoAfirmacion, esEstadoAfirmacion, FUENTE_AFIRMACION_MAXIMA } from "@/lib/proyectos";
import { db } from "../db/cliente";
import { claims, type FilaAfirmacion } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { afirmacionPropia } from "./consulta";
import { ErrorProyecto } from "./errores";

/**
 * Resolución de las afirmaciones señaladas en el guion: «verificar», «corregir» o «descartar».
 *
 * Escenara **no verifica nada por su cuenta** (queda fuera de esta versión, y una verificación automática que
 * se equivoque es peor que ninguna): aquí solo se guarda lo que decide una persona y la fuente que aporta.
 *
 * Verificar exige escribir la fuente. Es lo único que convierte «lo he mirado» en algo que se puede volver a
 * comprobar dentro de seis meses.
 */

export async function resolverAfirmacion(
  actor: Actor,
  id: unknown,
  estado: unknown,
  fuente: unknown,
): Promise<FilaAfirmacion> {
  if (!esEstadoAfirmacion(estado) || estado === "por_verificar") {
    throw new ErrorProyecto(400, "Elige si la verificas, la corriges o la descartas.");
  }
  const { afirmacion } = await afirmacionPropia(actor, id);
  const limpia = limpiarTextoDePrompt(fuente, FUENTE_AFIRMACION_MAXIMA);
  if (estado === "verificada" && limpia === "") {
    throw new ErrorProyecto(
      400,
      "Escribe de dónde sale esta afirmación: una verificación sin fuente no se puede revisar.",
    );
  }
  const [actualizada] = await db()
    .update(claims)
    .set({ state: estado as EstadoAfirmacion, source: limpia, resolvedBy: actor.id, resolvedAt: new Date() })
    .where(eq(claims.id, afirmacion.id))
    .returning();
  if (!actualizada) throw new ErrorProyecto(404, "Esa afirmación no existe.");
  return actualizada;
}
