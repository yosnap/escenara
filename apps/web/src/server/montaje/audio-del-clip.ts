import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { ClipsDelProyecto } from "@/lib/audio-del-clip";
import { escenaPropia, proyectoPropio } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { db } from "../db/cliente";
import { type FilaEscena, generationJobs, media, montages, projects, scenes } from "../db/esquema";
import { type Actor, aDto } from "../media/servicio";

/**
 * **Quitar o devolver el audio propio del clip** de una escena (RF08). No cuesta nada: no se llama a ningún
 * proveedor ni se toca el archivo, solo se decide si su audio entra en el montaje y en el MP4.
 *
 * Es por escena y no depende del modo de voz del proyecto, que sigue siendo uno para todo el proyecto
 * (`lib/audio-del-clip.ts` explica la regla). Lo que sí toca es la **versión del montaje**: la exportación es
 * idempotente por montaje y versión, y sin subirla, pedir el MP4 después de quitar el audio devolvería el que ya se
 * había montado con él.
 */

/** Los clips producidos del proyecto, con lo que hace falta para decidir su audio. Solo los del dueño (404). */
export async function clipsProducidosDelProyecto(actor: Actor, proyectoId: unknown): Promise<ClipsDelProyecto> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const filas = await db()
    .select({ escena: scenes, medio: media })
    .from(scenes)
    .innerJoin(media, and(eq(media.id, scenes.clipMediaId), isNull(media.deletedAt)))
    .where(eq(scenes.projectId, proyecto.id))
    .orderBy(asc(scenes.sortOrder));
  const hablados = await clipsQueHablan(filas.map((f) => f.escena));
  return {
    modoVoz: proyecto.voiceMode,
    clips: filas.map(({ escena, medio }) => ({
      escenaId: escena.id,
      orden: escena.sortOrder,
      medio: aDto(medio, actor),
      hablaEnElClip: escena.clipJobId !== null && hablados.has(escena.clipJobId),
      audioQuitado: escena.clipAudioMuted,
      conPistaDeVoz: escena.voiceMediaId !== null,
      conDialogo: escena.scriptText.trim() !== "",
    })),
  };
}

/**
 * Trabajos de clip a los que se les pidió que dijeran algo. Se mira lo que **se envió** (`input.dialogo`), no el
 * guion de ahora: es lo único que dice si el clip trae voz propia dentro. Mismo criterio que
 * `voz/proyecto.ts › clipsConDialogoHablado`.
 */
async function clipsQueHablan(escenas: readonly FilaEscena[]): Promise<Set<string>> {
  const ids = escenas.flatMap((e) => (e.clipJobId ? [e.clipJobId] : []));
  if (ids.length === 0) return new Set();
  const trabajos = await db()
    .select({ id: generationJobs.id, entrada: generationJobs.input })
    .from(generationJobs)
    .where(inArray(generationJobs.id, ids));
  return new Set(
    trabajos
      .filter(({ entrada }) => String((entrada as { dialogo?: unknown }).dialogo ?? "").trim() !== "")
      .map(({ id }) => id),
  );
}

/**
 * Quita (`quitado = true`) o devuelve el audio propio del clip de una escena. Devuelve los clips del proyecto ya
 * actualizados. Repetir el mismo valor no hace nada ni sube ninguna versión.
 */
export async function cambiarAudioDelClip(
  actor: Actor,
  escenaId: unknown,
  quitado: unknown,
): Promise<ClipsDelProyecto> {
  if (typeof quitado !== "boolean") {
    throw new ErrorProyecto(400, "Indica en «quitado» si el audio del clip se quita (true) o se oye (false).");
  }
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  if (!escena.clipMediaId) {
    throw new ErrorProyecto(
      409,
      `La escena ${escena.sortOrder} todavía no tiene clip, así que no hay audio que quitar. Prodúcela primero.`,
    );
  }
  if (escena.clipAudioMuted !== quitado) {
    await db().transaction(async (tx) => {
      const [cambiada] = await tx
        .update(scenes)
        .set({ clipAudioMuted: quitado, updatedAt: new Date() })
        .where(and(eq(scenes.id, escena.id), eq(scenes.clipAudioMuted, !quitado)))
        .returning({ id: scenes.id });
      // Otra petición ya lo había dejado así: no hay nada que cambiar y el montaje no debe subir de versión.
      if (!cambiada) return;
      // Lo que se oye cambia el MP4: otra versión del montaje, para no reutilizar una exportación con el audio anterior.
      await tx
        .update(montages)
        .set({ version: sql`${montages.version} + 1`, updatedAt: new Date() })
        .where(eq(montages.projectId, proyecto.id));
      await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, proyecto.id));
    });
  }
  return clipsProducidosDelProyecto(actor, proyecto.id);
}
