import { and, count, eq, inArray, sql } from "drizzle-orm";
import { borrarObjeto } from "../almacenamiento";
import { proyectoPropio } from "../asistente/consulta";
import { olvidarPercibidoDeProyecto } from "../coherencia/registro";
import { db } from "../db/cliente";
import {
  assistantRuns,
  type FilaTrabajo,
  generationJobs,
  media,
  montageExports,
  projectExports,
  projects,
  reviewResults,
  scenes,
  usageLedger,
} from "../db/esquema";
import type { Actor } from "../media/servicio";
import { ErrorDatos } from "./errores";
import { clavesDeExportaciones } from "./exportacion-proyecto";
import { cerrarTrabajosAntesDeBorrar, enMarchaEnElProveedor } from "./trabajos-al-borrar";

/**
 * Borrado de un proyecto con sus derivados, en la base de datos **y** en el almacenamiento.
 *
 * Qué se borra: el proyecto con sus escenas, afirmaciones, revisiones, brief del anuncio, montaje y exportaciones
 * (cascada); sus **trabajos** de generación; los **medios generados** por esos trabajos y los **vídeos montados**
 * (fila y objeto); y los **ZIP** de sus exportaciones.
 *
 * Qué se queda, a propósito:
 *
 * - lo que **subiste tú** a la biblioteca (foto de referencia de una escena, audio de una canción, música): es tuyo y
 *   puede estar en otro sitio. Desaparece la relación con el proyecto;
 * - un medio generado que **usas fuera de este proyecto** (referencia de un personaje, de un producto o de un lugar,
 *   en una colección, en otra escena o como origen de otro trabajo). Se cuenta en el diálogo;
 * - los **apuntes de gasto**: el gasto ocurrió. Pierden su trabajo y se deja escrito de qué proyecto venían.
 *
 * Mismas reglas que el borrado de un personaje: un trabajo en el proveedor, un montaje renderizándose o un paquete
 * preparándose impiden borrar (409); lo que no ha salido se cancela liberando su reserva. Primero las filas en una
 * transacción, después los objetos: el peor caso es un objeto huérfano, que queda registrado con su clave.
 */

export interface ResumenBorradoProyecto {
  titulo: string;
  escenas: number;
  trabajos: number;
  trabajosEnMarcha: number;
  trabajosPorCancelar: number;
  /** Medios generados que se borran (fila y archivo). */
  generados: number;
  /** Medios generados que se quedan porque los usas fuera de este proyecto. */
  generadosEnUsoFuera: number;
  videosMontados: number;
  paquetesExportados: number;
  /** Montajes renderizándose o paquetes preparándose: impiden borrar hasta que terminen. */
  procesosEnCurso: number;
}

const trabajosDe = (proyectoId: string): Promise<FilaTrabajo[]> =>
  db()
    .select({ trabajo: generationJobs })
    .from(generationJobs)
    .innerJoin(scenes, eq(scenes.id, generationJobs.sceneId))
    .where(eq(scenes.projectId, proyectoId))
    .then((filas) => filas.map((f) => f.trabajo));

/**
 * Medios que produce el proyecto: resultados de sus trabajos y vídeos montados. Separados en los que se borran y los
 * que se quedan porque algo **fuera del proyecto** los usa.
 */
async function derivadosDe(proyectoId: string): Promise<{
  borrar: { id: string; clave: string }[];
  enUsoFuera: number;
  videos: number;
}> {
  const filas = (await db().execute<{ id: string; clave: string; video: boolean; fuera: boolean }>(sql`
    with propios as (
      select j.result_media_id as id, false as video from generation_jobs j
      join scenes s on s.id = j.scene_id
      where s.project_id = ${proyectoId} and j.result_media_id is not null
      union
      select x.result_media_id, true from montage_exports x
      where x.project_id = ${proyectoId} and x.result_media_id is not null
    ), escenas_del_proyecto as (
      select id from scenes where project_id = ${proyectoId}
    )
    select m.id, m.storage_key as clave, bool_or(p.video) as video,
      (
        exists (select 1 from character_references r where r.media_id = m.id)
        or exists (select 1 from characters c where c.master_frame_media_id = m.id or c.identity_sheet_media_id = m.id)
        or exists (select 1 from character_versions v where v.sheet_media_id = m.id)
        or exists (select 1 from product_references r where r.media_id = m.id)
        or exists (select 1 from place_references r where r.media_id = m.id)
        or exists (select 1 from place_versions v where v.master_media_id = m.id)
        or exists (select 1 from collection_media c where c.media_id = m.id)
        or exists (select 1 from music_tracks t where t.media_id = m.id and t.project_id <> ${proyectoId})
        or exists (select 1 from voice_samples v where v.media_id = m.id)
        or exists (select 1 from prompt_templates t where t.demo_media_id = m.id)
        or exists (
          select 1 from scenes s where s.project_id <> ${proyectoId} and m.id in (
            s.approved_frame_media_id, s.clip_media_id, s.voice_media_id, s.reference_image_media_id,
            s.change_only_base_frame_id, s.change_only_reference_media_id, s.singing_audio_media_id))
        or exists (
          select 1 from generation_jobs j
          where j.source_media_id = m.id and (j.scene_id is null or j.scene_id not in (select id from escenas_del_proyecto)))
        or exists (select 1 from montage_exports x where x.result_media_id = m.id and x.project_id <> ${proyectoId})
      ) as fuera
    from propios p join media m on m.id = p.id
    group by m.id
  `)) as unknown as { id: string; clave: string; video: boolean; fuera: boolean }[];
  return {
    borrar: filas.filter((f) => !f.fuera).map((f) => ({ id: f.id, clave: f.clave })),
    enUsoFuera: filas.filter((f) => f.fuera).length,
    videos: filas.filter((f) => f.video && !f.fuera).length,
  };
}

async function procesosEnCurso(proyectoId: string): Promise<number> {
  const [montajes, paquetes] = await Promise.all([
    db()
      .select({ total: count() })
      .from(montageExports)
      .where(and(eq(montageExports.projectId, proyectoId), eq(montageExports.state, "en_curso"))),
    db()
      .select({ total: count() })
      .from(projectExports)
      .where(and(eq(projectExports.projectId, proyectoId), eq(projectExports.state, "preparando"))),
  ]);
  return (montajes[0]?.total ?? 0) + (paquetes[0]?.total ?? 0);
}

/** Gasto a medio cerrar del proyecto (texto del asistente o revisión con modelo): sus filas no se pueden borrar aún. */
async function gastosSinCerrar(proyectoId: string): Promise<number> {
  const [ejecuciones, revisiones] = await Promise.all([
    db()
      .select({ total: count() })
      .from(assistantRuns)
      .where(and(eq(assistantRuns.projectId, proyectoId), eq(assistantRuns.state, "reservado"))),
    db()
      .select({ total: count() })
      .from(reviewResults)
      .innerJoin(scenes, eq(scenes.id, reviewResults.sceneId))
      .where(and(eq(scenes.projectId, proyectoId), eq(reviewResults.state, "reservado"))),
  ]);
  return (ejecuciones[0]?.total ?? 0) + (revisiones[0]?.total ?? 0);
}

export async function resumenBorradoProyecto(actor: Actor, id: unknown): Promise<ResumenBorradoProyecto> {
  const proyecto = await proyectoPropio(actor, id);
  const [escenas, trabajos, derivados, paquetes, enCurso] = await Promise.all([
    db().select({ total: count() }).from(scenes).where(eq(scenes.projectId, proyecto.id)),
    trabajosDe(proyecto.id),
    derivadosDe(proyecto.id),
    clavesDeExportaciones([proyecto.id]),
    procesosEnCurso(proyecto.id),
  ]);
  return {
    titulo: proyecto.title,
    escenas: escenas[0]?.total ?? 0,
    trabajos: trabajos.length,
    trabajosEnMarcha: enMarchaEnElProveedor(trabajos).length,
    trabajosPorCancelar: trabajos.filter((t) => t.state === "en_cola" || t.state === "esperando_limite").length,
    generados: derivados.borrar.length - derivados.videos,
    generadosEnUsoFuera: derivados.enUsoFuera,
    videosMontados: derivados.videos,
    paquetesExportados: paquetes.length,
    procesosEnCurso: enCurso,
  };
}

export interface BorradoProyectoRealizado {
  titulo: string;
  trabajosBorrados: number;
  trabajosCancelados: number;
  clavesBorradas: string[];
  clavesHuerfanas: string[];
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : `${n} ${varios}`);

export async function borrarProyectoConDerivados(
  actor: Actor,
  id: unknown,
  borrar: (clave: string) => Promise<void> = borrarObjeto,
): Promise<BorradoProyectoRealizado> {
  const proyecto = await proyectoPropio(actor, id);
  const titulo = proyecto.title || "sin título";

  // ── 1. Lo que no se puede deshacer se espera a que termine.
  const trabajos = await trabajosDe(proyecto.id);
  const enMarcha = enMarchaEnElProveedor(trabajos).length;
  if (enMarcha > 0) {
    throw new ErrorDatos(
      409,
      `«${titulo}» tiene ${plural(enMarcha, "un trabajo que ya está", "trabajos que ya están")} en el proveedor: la tarea existe, se va a cobrar y su resultado va a llegar. No se ha borrado nada. Espera a que ${enMarcha === 1 ? "termine" : "terminen"} y vuelve a intentarlo.`,
    );
  }
  const enCurso = await procesosEnCurso(proyecto.id);
  if (enCurso > 0) {
    throw new ErrorDatos(
      409,
      `«${titulo}» tiene ${plural(enCurso, "un montaje o una exportación", "montajes o exportaciones")} preparándose ahora mismo. No se ha borrado nada: espera a que termine y vuelve a intentarlo.`,
    );
  }
  if ((await gastosSinCerrar(proyecto.id)) > 0) {
    throw new ErrorDatos(
      409,
      `«${titulo}» tiene una llamada al asistente o una revisión con modelo cuyo coste aún no se ha cerrado. No se ha borrado nada: vuelve a intentarlo en un par de minutos.`,
    );
  }

  // ── 2. Los trabajos que no han salido se cancelan y ninguna reserva se queda abierta.
  const motivo = `al borrar el proyecto «${titulo}»`;
  const { cancelados, siguenAbiertos } = await cerrarTrabajosAntesDeBorrar(trabajos, motivo);
  if (siguenAbiertos > 0) {
    throw new ErrorDatos(
      409,
      `«${titulo}» tiene ${plural(siguenAbiertos, "un trabajo", "trabajos")} con presupuesto retenido que no se ha podido liberar. No se ha borrado nada: pídele a quien administra que lo resuelva en «Trabajos».`,
    );
  }

  // ── 3. Qué objetos hay que borrar, antes de perder las filas que los apuntan.
  const derivados = await derivadosDe(proyecto.id);
  const claves = [
    ...new Set([...derivados.borrar.map((d) => d.clave), ...(await clavesDeExportaciones([proyecto.id]))]),
  ];
  const idsTrabajos = trabajos.map((t) => t.id);

  // ── 4. Filas, en una transacción. El proyecto se bloquea y se vuelve a comprobar: un encolado que llegue ahora
  // choca con el bloqueo y, al soltarse, con la escena borrada.
  const borrados = await db().transaction(async (tx) => {
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, proyecto.id)).for("update");
    const [{ nuevos } = { nuevos: 0 }] = await tx
      .select({ nuevos: count() })
      .from(generationJobs)
      .innerJoin(scenes, eq(scenes.id, generationJobs.sceneId))
      .where(
        and(
          eq(scenes.projectId, proyecto.id),
          inArray(generationJobs.state, [
            "en_cola",
            "esperando_limite",
            "preparando",
            "enviando",
            "enviado",
            "en_curso",
            "desconocido",
          ]),
        ),
      );
    if (nuevos > 0) {
      throw new ErrorDatos(
        409,
        `Se acaba de encolar un trabajo en «${titulo}». No se ha borrado nada: vuelve a intentarlo.`,
      );
    }
    if (idsTrabajos.length > 0) {
      await tx
        .update(usageLedger)
        .set({
          note: sql`${usageLedger.note} || ' (trabajo ' || ${usageLedger.jobId}::text || ' borrado con el proyecto «' || ${titulo} || '»)'`,
        })
        .where(inArray(usageLedger.jobId, idsTrabajos));
    }
    const filas = await tx
      .delete(generationJobs)
      .where(
        inArray(
          generationJobs.sceneId,
          tx.select({ id: scenes.id }).from(scenes).where(eq(scenes.projectId, proyecto.id)),
        ),
      )
      .returning({ id: generationJobs.id });
    if (derivados.borrar.length > 0) {
      await tx.delete(media).where(
        and(
          inArray(
            media.id,
            derivados.borrar.map((d) => d.id),
          ),
          eq(media.ownerId, actor.id),
        ),
      );
    }
    await olvidarPercibidoDeProyecto(tx, proyecto.id);
    await tx.delete(projects).where(and(eq(projects.id, proyecto.id), eq(projects.userId, actor.id)));
    return filas.length;
  });

  // ── 5. Objetos del almacenamiento, uno a uno; lo que falle queda registrado con su clave.
  const clavesBorradas: string[] = [];
  const clavesHuerfanas: string[] = [];
  for (const clave of claves) {
    try {
      await borrar(clave);
      clavesBorradas.push(clave);
    } catch (error) {
      clavesHuerfanas.push(clave);
      console.error(
        `[datos] objeto huérfano tras borrar un proyecto: ${clave}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  console.info(
    `[datos] proyecto borrado · trabajos=${borrados} cancelados=${cancelados} objetos=${clavesBorradas.length} huérfanos=${clavesHuerfanas.length}`,
  );
  return { titulo, trabajosBorrados: borrados, trabajosCancelados: cancelados, clavesBorradas, clavesHuerfanas };
}
