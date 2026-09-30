import { eq, sql } from "drizzle-orm";
import { MOTIVO_MAXIMO, MOTIVO_MINIMO } from "@/lib/comunidad";
import { db } from "../db/cliente";
import { communityPosts, userAchievements } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { elegibilidadActual } from "./consulta";
import { ErrorComunidad } from "./errores";
import { exigirUuid } from "./http";
import { esHuerfana } from "./visibilidad";

/**
 * Moderación previa (solo quien administra). **Nadie modera lo suyo**: quien publicó no puede aprobar ni rechazar su
 * propia publicación, aunque sea administrador. Se decide sobre **una revisión concreta**: si el autor la cambió
 * mientras se miraba, la decisión no se aplica (409) y hay que volver a mirarla.
 *
 * Aprobar vuelve a comprobar la elegibilidad con la misma función que al publicar: si el original ya no la cumple (se
 * añadió una persona real a su escena, por ejemplo), no se aprueba. Bloqueos en el orden de siempre: el usuario autor
 * y después la publicación, como al retirarla; así aprobar y retirar a la vez no se cruzan.
 */

type Decision = { accion: "aprobar" } | { accion: "rechazar"; motivo: string };

export async function moderar(
  actor: Actor,
  idPedido: unknown,
  revisionPedida: unknown,
  decision: Decision,
): Promise<{ estado: "aprobada" | "rechazada" }> {
  if (!actor.esAdmin) throw new ErrorComunidad(404, "No existe.");
  const id = exigirUuid(idPedido);
  if (typeof revisionPedida !== "number" || !Number.isInteger(revisionPedida)) {
    throw new ErrorComunidad(400, "Falta la revisión que has mirado: vuelve a cargar la cola.");
  }
  const motivo = decision.accion === "rechazar" ? decision.motivo.trim().replace(/[ \t]+/g, " ") : "";
  if (decision.accion === "rechazar" && (motivo.length < MOTIVO_MINIMO || motivo.length > MOTIVO_MAXIMO)) {
    throw new ErrorComunidad(
      400,
      `Escribe el motivo del rechazo (de ${MOTIVO_MINIMO} a ${MOTIVO_MAXIMO} caracteres): es lo que leerá el autor.`,
    );
  }

  return await db().transaction(async (tx) => {
    const [previa] = await tx
      .select({ autor: communityPosts.authorId })
      .from(communityPosts)
      .where(eq(communityPosts.id, id))
      .limit(1);
    if (!previa) throw new ErrorComunidad(404, "Esa publicación ya no existe: su autor la ha retirado.");
    await tx.execute(sql`select 1 from users where id = ${previa.autor} for update`);
    const [fila] = await tx.select().from(communityPosts).where(eq(communityPosts.id, id)).for("update");
    if (!fila) throw new ErrorComunidad(404, "Esa publicación ya no existe: su autor la ha retirado.");
    if (fila.authorId === actor.id) {
      throw new ErrorComunidad(
        403,
        "Nadie modera lo suyo: esta publicación es tuya y tiene que revisarla otra persona con rol de administrador.",
      );
    }
    if (fila.revision !== revisionPedida) {
      throw new ErrorComunidad(
        409,
        "El autor la ha cambiado mientras la mirabas: vuelve a cargar la cola y revísala otra vez.",
      );
    }
    if (decision.accion === "aprobar") {
      if (fila.state === "aprobada") return { estado: "aprobada" as const };
      if (esHuerfana(fila)) throw new ErrorComunidad(409, "El original ya no existe: no se puede aprobar.");
      const [enBorrado] = (await tx.execute(sql`select 1 from account_deletions where user_id = ${fila.authorId}
        and state in ('programado', 'borrando_objetos') limit 1`)) as unknown as unknown[];
      if (enBorrado) throw new ErrorComunidad(409, "La cuenta del autor está en periodo de borrado: no se aprueba.");
      const eleg = await elegibilidadActual(tx, fila);
      if (!eleg.publicable) throw new ErrorComunidad(409, `Ya no se puede publicar: ${eleg.motivos.join(" ")}`);
      const ahora = new Date();
      await tx
        .update(communityPosts)
        .set({ state: "aprobada", moderatedBy: actor.id, moderatedAt: ahora, approvedAt: ahora, rejectionReason: "" })
        .where(eq(communityPosts.id, id));
      // Hito real: la primera publicación aprobada. Una sola vez por persona (clave primaria).
      await tx
        .insert(userAchievements)
        .values({ userId: fila.authorId, achievement: "primera_publicacion_aprobada", achievedAt: ahora })
        .onConflictDoNothing();
      return { estado: "aprobada" as const };
    }
    await tx
      .update(communityPosts)
      .set({
        state: "rechazada",
        moderatedBy: actor.id,
        moderatedAt: new Date(),
        approvedAt: null,
        rejectionReason: motivo,
      })
      .where(eq(communityPosts.id, id));
    return { estado: "rechazada" as const };
  });
}
