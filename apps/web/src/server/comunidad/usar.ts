import { and, eq, isNull } from "drizzle-orm";
import { leerAjustes } from "../ajustes";
import { db } from "../db/cliente";
import { communityPosts, communityUses, promptTemplates } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { ErrorComunidad } from "./errores";
import { exigirUuid } from "./http";
import { comunidadActiva, condicionVisible } from "./visibilidad";

/**
 * «Usar» un trend o una plantilla compartidos: abre «Crear» con esa plantilla de la instalación elegida y la atribución
 * a la publicación. **No copia ningún medio** ni ningún texto de prompt: la plantilla es de la instalación y el usuario
 * ya podía usarla; lo que se registra es el uso (uno por persona) para la atribución y el contador.
 *
 * Personajes y clips **no se usan**: se ven y sirven de inspiración (decisión provisional, pendiente del propietario).
 */
export async function usarPublicacion(actor: Actor, idPedido: unknown): Promise<{ destino: string }> {
  const id = exigirUuid(idPedido);
  if (!(await comunidadActiva())) throw new ErrorComunidad(404, "Esa publicación no existe.");
  const [fila] = await db()
    .select({ autor: communityPosts.authorId, tipo: communityPosts.kind, plantilla: communityPosts.templateId })
    .from(communityPosts)
    .where(and(eq(communityPosts.id, id), condicionVisible()))
    .limit(1);
  if (!fila) throw new ErrorComunidad(404, "Esa publicación no existe.");
  if ((fila.tipo !== "trend" && fila.tipo !== "plantilla") || !fila.plantilla) {
    throw new ErrorComunidad(
      409,
      "Solo se pueden usar trends y plantillas; un personaje o un clip sirven de inspiración.",
    );
  }
  const [plantilla] = await db()
    .select({ kind: promptTemplates.kind, estado: promptTemplates.trendStatus })
    .from(promptTemplates)
    .where(
      and(eq(promptTemplates.id, fila.plantilla), isNull(promptTemplates.ownerId), eq(promptTemplates.active, true)),
    )
    .limit(1);
  const trendsVisibles = (await leerAjustes()).trendsVisibles;
  if (!plantilla || (plantilla.kind === "trend" && (plantilla.estado !== "vigente" || !trendsVisibles))) {
    throw new ErrorComunidad(409, "Esa plantilla ya no está disponible en la instalación: no se puede usar ahora.");
  }
  if (fila.autor !== actor.id) {
    await db().insert(communityUses).values({ postId: id, userId: actor.id }).onConflictDoNothing();
  }
  return { destino: `/crear?plantilla=${fila.plantilla}&desde=${id}` };
}
