import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { escenaPropia } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { db } from "../db/cliente";
import { generationJobs, media, montages, projects, scenes } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { invalidarRevisionesDeEscena } from "../revision/resultados";
import { ajustarEstadoDelProyecto } from "./cierre";

/**
 * **Biblioteca de versiones de una escena** (0.41.0; decisión del propietario: se conservan todas mientras el
 * proyecto exista).
 *
 * Una versión es un trabajo de clip de la escena que terminó con su archivo en la biblioteca. No hay tabla nueva:
 * el trabajo ya guarda todo lo que la describe (modelo, coste, fecha y archivo), y la versión **elegida** es la que
 * la escena tiene como clip. Por eso «usar esta» no copia ni borra nada: cambia a qué trabajo apunta la escena.
 *
 * Lo que sí hace, porque es el mismo hecho contado desde otros sitios:
 *
 * - **sube la versión del montaje**: la exportación es idempotente por versión, y sin subirla se devolvería el MP4
 *   montado con el clip anterior;
 * - **invalida la revisión de continuidad**, como al regenerar: lo revisado ya no es el clip que hay.
 *
 * No cuesta nada ni llama a ningún proveedor: el archivo ya está pagado y guardado.
 */

/** Estados de un trabajo que siguen vivos: mientras haya uno, su resultado pisaría la versión elegida. */
const EN_MARCHA = ["en_cola", "esperando_limite", "preparando", "enviando", "enviado", "en_curso"] as const;

export async function usarVersionDeEscena(actor: Actor, escenaId: unknown, trabajoId: unknown): Promise<string> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  if (typeof trabajoId !== "string" || !/^[0-9a-f-]{36}$/i.test(trabajoId)) {
    throw new ErrorProyecto(400, "Indica en «trabajoId» qué versión del clip quieres usar.");
  }
  if (escena.castFormat === "podcast") {
    throw new ErrorProyecto(
      409,
      `La escena ${escena.sortOrder} es un podcast: sus clips van por turnos y se eligen juntos al producirla, no uno a uno.`,
    );
  }
  const [version] = await db()
    .select({ trabajo: generationJobs, medio: media })
    .from(generationJobs)
    .innerJoin(media, eq(media.id, generationJobs.resultMediaId))
    .where(
      and(
        eq(generationJobs.id, trabajoId),
        eq(generationJobs.sceneId, escena.id),
        eq(generationJobs.userId, actor.id),
        eq(generationJobs.kind, "animacion"),
        eq(generationJobs.state, "listo"),
        isNull(generationJobs.castClipOrder),
      ),
    )
    .limit(1);
  // Una versión de otra escena, de otro usuario o que nunca llegó a tener clip responde igual: no es de aquí.
  if (!version) throw new ErrorProyecto(404, "Esa versión no es un clip terminado de esta escena.");
  if (version.medio.deletedAt !== null) {
    throw new ErrorProyecto(
      409,
      "El archivo de esa versión está en la papelera de tu biblioteca. Recupéralo desde la biblioteca y vuelve a elegirla.",
    );
  }
  if (escena.clipJobId === version.trabajo.id && escena.clipMediaId === version.medio.id) return proyecto.id;

  const [enMarcha] = await db()
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.sceneId, escena.id),
        eq(generationJobs.kind, "animacion"),
        inArray(generationJobs.state, [...EN_MARCHA]),
      ),
    )
    .limit(1);
  if (enMarcha) {
    throw new ErrorProyecto(
      409,
      `Hay un clip de la escena ${escena.sortOrder} generándose: cuando termine, pasaría a ser el de la escena y taparía la versión que eliges. Espera a que acabe y elige entonces.`,
    );
  }

  await db().transaction(async (tx) => {
    // Misma cerradura que al regenerar: una revisión que se guarde a la vez espera y ve que el clip ya es otro.
    await tx.select({ id: scenes.id }).from(scenes).where(eq(scenes.id, escena.id)).limit(1).for("update");
    await tx
      .update(scenes)
      .set({
        clipMediaId: version.medio.id,
        clipJobId: version.trabajo.id,
        // La escena ya tiene un clip terminado, sea el que sea: está producida. Un borrador sigue siéndolo.
        state: sql`case when ${scenes.state} = 'borrador' then 'borrador'::scene_state else 'producida'::scene_state end`,
        lastFailureReason: "",
        updatedAt: new Date(),
      })
      .where(eq(scenes.id, escena.id));
    await invalidarRevisionesDeEscena(
      escena.id,
      "Se eligió otra versión del clip de esta escena, así que lo revisado ya no es el clip que hay. Vuelve a comprobarlo.",
      tx,
    );
    // Otra versión del montaje: el MP4 de antes se montó con el clip anterior y no se debe devolver como vigente.
    await tx
      .update(montages)
      .set({ version: sql`${montages.version} + 1`, updatedAt: new Date() })
      .where(eq(montages.projectId, proyecto.id));
    await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, proyecto.id));
    await ajustarEstadoDelProyecto(tx, proyecto.id);
  });
  return proyecto.id;
}

/** Bytes que ocupan las versiones de clip **no elegidas** de un proyecto: es lo que se podría liberar. */
export async function bytesDeVersionesSinUsar(proyectoId: string): Promise<number> {
  const [fila] = await db()
    .select({ bytes: sql<number>`coalesce(sum(${media.sizeBytes}), 0)::bigint` })
    .from(generationJobs)
    .innerJoin(scenes, eq(scenes.id, generationJobs.sceneId))
    .innerJoin(media, eq(media.id, generationJobs.resultMediaId))
    .where(
      and(
        eq(scenes.projectId, proyectoId),
        eq(generationJobs.kind, "animacion"),
        isNotNull(generationJobs.resultMediaId),
        isNull(media.deletedAt),
        sql`${generationJobs.resultMediaId} is distinct from ${scenes.clipMediaId}`,
      ),
    );
  return Number(fila?.bytes ?? 0);
}
