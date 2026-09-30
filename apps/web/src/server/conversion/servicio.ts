import { and, eq, isNull, sql } from "drizzle-orm";
import {
  columnasDeDireccion,
  duracionDelProyecto,
  type EstadoConversion,
  estadoDeConversion,
  type HechosDelClip,
  type ProyectoConvertido,
  segundosDelClip,
  techoInicial,
  tituloDelProyecto,
  urlDelProyectoConvertido,
} from "@/lib/conversion";
import { ACENTO_POR_DEFECTO } from "@/lib/direccion";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import { ACCION_MAXIMA, IDEA_MAXIMA, TEXTO_ESCENA_MAXIMO } from "@/lib/proyectos";
import { leerAjustes } from "../ajustes";
import { ErrorProyecto } from "../asistente/errores";
import { sincronizarAfirmaciones } from "../asistente/escenas";
import { PROYECTOS_MAXIMOS } from "../asistente/proyectos";
import { db, type Ejecutor } from "../db/cliente";
import {
  characters,
  type FilaTrabajo,
  generationJobs,
  media,
  projects,
  promptTemplates,
  scenes,
  usageLedger,
} from "../db/esquema";
import { direccionGuardada, esUuidGeneracion, filaPropia } from "../generacion/trabajos";
import type { Actor } from "../media/servicio";
import { motivosParaNoGenerar } from "../personajes/puede-generar";
import { motivoTrendNoDisponible } from "../prompts/trends";
import { sembrarRepartoInicial } from "../reparto/siembra";

/**
 * **Convertir un clip de «Crear» en un proyecto** (RF06 y RF08).
 *
 * Crea un proyecto de **una** escena cuyo clip producido es **el mismo clip**: se reutiliza el trabajo y su
 * archivo, no se regenera nada y no se cobra nada. La escena hereda la imagen de partida, el trend, la dirección,
 * el producto y el personaje; el modelo y lo que costó siguen en el propio trabajo, que pasa a ser de la escena.
 *
 * Tres reglas:
 *
 * 1. **El dinero se cuenta una vez.** El trabajo del clip se engancha a la escena (`scene_id`), así que su gasto
 *    entra en lo comprometido del proyecto (`asistente/plan.ts › comprometidoDelProyecto`) y el techo del proyecto
 *    se compara con él; el historial de créditos del usuario no cambia, porque no se apunta nada nuevo.
 *    El trabajo del **fotograma** no se engancha: seguir animándolo en «Crear» colgaría esos clips nuevos de la
 *    escena del proyecto sin que nadie lo pidiera (`generacion/servicio.ts › partidaDelClip`).
 * 2. **Un clip se convierte una vez.** El enganche es `where scene_id is null` con la fila bloqueada: pulsar dos
 *    veces, o desde dos pestañas, lleva al mismo proyecto.
 * 3. **Ningún consentimiento se hereda a ciegas.** El personaje tiene que poder usarse **ahora** (consentimiento
 *    vigente y referencias), y las declaraciones del clip tienen que estar guardadas. Lo que el proyecto pide al
 *    producir (derechos de la imagen, revisión de fotos, marca) lo vuelve a pedir su puerta al regenerar.
 */

interface ClipLeido {
  fila: FilaTrabajo;
  hechos: HechosDelClip;
  avisos: string[];
  trend: { nombre: string; version: number | null } | null;
  personaje: { renderStyle: "realista" | "animado" } | null;
}

/** Lo que el botón necesita saber de un clip antes de pulsarlo. Un clip ajeno responde 404. */
export async function estadoDelClip(actor: Actor, trabajoId: unknown): Promise<EstadoConversion> {
  const { hechos, avisos } = await leerClip(actor, trabajoId);
  return estadoDeConversion(hechos, avisos);
}

/**
 * Convierte el clip. Devuelve el proyecto creado o, si el clip ya estaba convertido, el que ya existía
 * (`nuevo: false`). Nada se escribe si el clip no se puede convertir: se responde 409 con el motivo.
 */
export async function convertirEnProyecto(actor: Actor, trabajoId: unknown): Promise<ProyectoConvertido> {
  const clip = await leerClip(actor, trabajoId);
  const estado = estadoDeConversion(clip.hechos, clip.avisos);
  if (estado.estado === "convertido") {
    return { proyectoId: estado.proyectoId, titulo: estado.titulo, url: estado.url, nuevo: false };
  }
  if (estado.estado === "no_convertible") throw new ErrorProyecto(409, estado.motivo);
  const { presupuestoProyecto } = await leerAjustes();

  return db().transaction(async (tx) => {
    // La fila del trabajo se bloquea: dos conversiones a la vez se ponen en fila y la segunda ve el enganche.
    const [trabajo] = await tx
      .select({ sceneId: generationJobs.sceneId })
      .from(generationJobs)
      .where(and(eq(generationJobs.id, clip.fila.id), eq(generationJobs.userId, actor.id)))
      .limit(1)
      .for("update");
    if (!trabajo) throw new ErrorProyecto(404, "Ese clip no existe.");
    if (trabajo.sceneId) {
      const [ya] = await tx
        .select({ id: projects.id, titulo: projects.title })
        .from(scenes)
        .innerJoin(projects, eq(projects.id, scenes.projectId))
        .where(and(eq(scenes.id, trabajo.sceneId), eq(projects.userId, actor.id)))
        .limit(1);
      if (!ya) throw new ErrorProyecto(409, "Este clip ya pertenece a otra escena y no se puede convertir.");
      return { proyectoId: ya.id, titulo: ya.titulo, url: urlDelProyectoConvertido(ya.id), nuevo: false };
    }
    // La fila del usuario se bloquea antes de contar: dos conversiones de clips distintos a la vez no pueden pasar
    // las dos del tope de proyectos por contar antes de que la otra escriba.
    await tx.execute(sql`select 1 from users where id = ${actor.id}::uuid for update`);
    const [{ total } = { total: 0 }] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(projects)
      .where(eq(projects.userId, actor.id));
    if (total >= PROYECTOS_MAXIMOS) {
      throw new ErrorProyecto(
        409,
        `No puedes tener más de ${PROYECTOS_MAXIMOS} proyectos. Borra alguno y vuelve a convertir el clip: no se ha creado nada.`,
      );
    }

    const { fila } = clip;
    const entrada = fila.input as { escena?: unknown; dialogo?: unknown };
    const direccion = direccionGuardada(fila);
    // La duración con la que se generó el clip, que es la que su modelo ya aceptó y cobró.
    const segundos = duracionDelProyecto(segundosDelClip(fila.input));
    const titulo = tituloDelProyecto(clip.trend?.nombre ?? null, fila.createdAt);
    const descripcion = limpiarTextoDePrompt(entrada.escena, IDEA_MAXIMA);
    const [proyecto] = await tx
      .insert(projects)
      .values({
        userId: actor.id,
        title: titulo,
        idea: descripcion || "Clip hecho en Crear y traído a un proyecto para ponerle voz y montarlo.",
        mainCharacterId: fila.characterId,
        renderStyle: clip.personaje?.renderStyle ?? "realista",
        authorizedCredits: techoInicial(presupuestoProyecto, await gastoDelClip(tx, fila.id)),
        clipSeconds: segundos,
        speechAccent: direccion?.acento ?? ACENTO_POR_DEFECTO,
      })
      .returning();
    if (!proyecto) throw new ErrorProyecto(500, "No se ha podido crear el proyecto. No se ha cobrado nada.");

    const [escena] = await tx
      .insert(scenes)
      .values({
        projectId: proyecto.id,
        sortOrder: 1,
        plannedSeconds: segundos,
        scriptText: limpiarTextoDePrompt(entrada.dialogo, TEXTO_ESCENA_MAXIMO),
        action: limpiarTextoDePrompt(entrada.escena, ACCION_MAXIMA),
        ...(direccion ? columnasDeDireccion(direccion) : {}),
        // El trend y la versión con la que se hizo el clip: si ya no está vigente, lo dice la producción al regenerar.
        ...(clip.trend && fila.promptTemplateId
          ? { templateId: fila.promptTemplateId, templateVersion: clip.trend.version }
          : {}),
        productId: fila.productId,
        productAction: fila.productId ? fila.productAction : "",
        // La imagen de partida es el fotograma de la escena. **Sin trabajo de fotograma**: animar otra vez desde el
        // proyecto parte de la imagen y engancha el clip nuevo a esta escena, no a un trabajo de «Crear».
        approvedFrameMediaId: fila.sourceMediaId,
        approvedFrameJobId: null,
        clipMediaId: fila.resultMediaId,
        clipJobId: fila.id,
        state: "producida",
      })
      .returning();
    if (!escena) throw new ErrorProyecto(500, "No se ha podido crear la escena. No se ha cobrado nada.");
    await sembrarRepartoInicial(tx, escena.id, fila.characterId);
    await sincronizarAfirmaciones(tx, escena.id, escena.scriptText);

    // El enganche que hace que el gasto cuente una sola vez, y que un clip se convierta una sola vez.
    const [enganchado] = await tx
      .update(generationJobs)
      .set({ sceneId: escena.id })
      .where(and(eq(generationJobs.id, fila.id), isNull(generationJobs.sceneId)))
      .returning({ id: generationJobs.id });
    if (!enganchado) throw new ErrorProyecto(409, "Este clip se acaba de convertir desde otra pestaña. Recarga.");
    return { proyectoId: proyecto.id, titulo, url: urlDelProyectoConvertido(proyecto.id), nuevo: true };
  });
}

/**
 * Lo que ya costó el clip según sus apuntes (reservas vivas, consumos y ajustes), con la misma cuenta que
 * `comprometidoDelProyecto`. Es lo que el proyecto hereda como gastado.
 */
async function gastoDelClip(tx: Ejecutor, trabajoId: string): Promise<number> {
  const [fila] = await tx
    .select({
      total: sql<number>`coalesce(sum(case when ${usageLedger.entryType} in ('reserva', 'liberacion', 'consumo', 'ajuste') then ${usageLedger.credits} else 0 end), 0)::float8`,
    })
    .from(usageLedger)
    .where(eq(usageLedger.jobId, trabajoId));
  return Math.max(0, fila?.total ?? 0);
}

/** Reúne los hechos del clip. Todo es lectura, y un trabajo ajeno responde 404 sin decir si existe. */
async function leerClip(actor: Actor, trabajoId: unknown): Promise<ClipLeido> {
  if (!esUuidGeneracion(trabajoId)) throw new ErrorProyecto(404, "Ese clip no existe.");
  // Un trabajo ajeno responde 404, también para quien administra (`generacion/trabajos.ts › filaPropia`).
  const fila = await filaPropia(actor.id, trabajoId);
  const entrada = fila.input as { canto?: unknown; plantilla?: { kind?: unknown; version?: unknown } };

  const [medio, partida, proyecto, personaje, plantilla] = await Promise.all([
    fila.resultMediaId
      ? db()
          .select({ id: media.id })
          .from(media)
          .where(and(eq(media.id, fila.resultMediaId), isNull(media.deletedAt)))
          .limit(1)
          .then((f) => f[0] ?? null)
      : null,
    fila.sourceMediaId
      ? db()
          .select({ id: media.id })
          .from(media)
          .where(and(eq(media.id, fila.sourceMediaId), isNull(media.deletedAt)))
          .limit(1)
          .then((f) => f[0] ?? null)
      : null,
    fila.sceneId
      ? db()
          .select({ id: projects.id, titulo: projects.title })
          .from(scenes)
          .innerJoin(projects, eq(projects.id, scenes.projectId))
          .where(and(eq(scenes.id, fila.sceneId), eq(projects.userId, actor.id)))
          .limit(1)
          .then((f) => f[0] ?? null)
      : null,
    fila.characterId
      ? db()
          .select({ nombre: characters.name, renderStyle: characters.renderStyle })
          .from(characters)
          .where(and(eq(characters.id, fila.characterId), eq(characters.ownerId, actor.id)))
          .limit(1)
          .then((f) => f[0] ?? null)
      : null,
    entrada.plantilla?.kind === "trend" && fila.promptTemplateId
      ? db()
          .select()
          .from(promptTemplates)
          .where(eq(promptTemplates.id, fila.promptTemplateId))
          .limit(1)
          .then((f) => f[0] ?? null)
      : null,
  ]);

  /**
   * El personaje tiene que poder usarse **ahora**, igual que al asignarlo como protagonista de cualquier proyecto:
   * un consentimiento revocado después de generar el clip no se salta por convertirlo. Uno que ya no es suyo
   * cuenta como que no existe.
   */
  const motivosPersonaje = fila.characterId
    ? personaje
      ? await motivosParaNoGenerar(fila.characterId)
      : ["ya no está entre tus personajes."]
    : [];

  const avisos: string[] = [];
  if (plantilla && (!plantilla.active || plantilla.trendStatus !== "vigente")) {
    avisos.push(
      `${await motivoTrendNoDisponible(plantilla)} El clip se conserva tal cual; para regenerar la escena dentro del proyecto tendrás que elegir otro trend.`,
    );
  }
  const version = entrada.plantilla?.version;
  return {
    fila,
    avisos,
    trend: plantilla ? { nombre: plantilla.name, version: typeof version === "number" ? version : null } : null,
    personaje: personaje ? { renderStyle: personaje.renderStyle } : null,
    hechos: {
      tipo: fila.kind,
      estado: fila.state,
      tieneMedio: medio !== null,
      tieneImagenDePartida: partida !== null,
      proyecto,
      turnoDeConversacion: fila.castClipOrder !== null,
      canto: entrada.canto === true,
      personaje: personaje?.nombre ?? null,
      motivosPersonaje,
      declaraciones: {
        derechosImagen: fila.rightsConfirmedAt !== null,
        revisionDeFotos: fila.characterId ? fila.referencesReviewedAt !== null : null,
        derechoMarca: fila.productId ? fila.brandRightsAt !== null : null,
      },
    },
  };
}
