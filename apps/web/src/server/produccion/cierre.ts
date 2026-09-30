import { and, eq, ne, sql } from "drizzle-orm";
import { segmentosDesdeMarcas, subtitulosDesdeTranscripcion } from "@/lib/voz";
import { esAlternativaDeComparativa } from "../comparativas/marcas";
import { db, type Ejecutor } from "../db/cliente";
import { type FilaTrabajo, projects, scenes } from "../db/esquema";
import type { MarcasDeVoz } from "../proveedores/contrato";

/**
 * Lo que la producción de una escena apunta cuando un trabajo suyo **termina** (RF06, 0.19.0).
 *
 * Se llama desde el cierre del trabajo (`generacion/seguimiento.ts`), que es el único sitio que sabe de verdad
 * qué ha pasado con el dinero. Aquí no se cobra, no se libera ninguna reserva y **no se reenvía nada**: solo se
 * escribe en la escena el hecho que acaba de ocurrir.
 *
 * Dos reglas:
 *
 * - **el fotograma no se aprueba solo.** Un fotograma listo deja la escena a la espera de que una persona lo mire:
 *   animar cuesta otro dinero y nadie lo autoriza en nombre del usuario;
 * - **un fallo no consume ningún reintento y no dispara ningún reenvío** (decisión provisional del propietario,
 *   2026-09-27; PRD §6). Lo único que se apunta es el motivo, para que la rejilla pueda decir qué pasó y ofrecer
 *   al usuario autorizar un presupuesto de reintentos si quiere volver a intentarlo.
 */

/** Todo cambio en una escena mueve la marca de tiempo de su proyecto. */
const tocarProyecto = (tx: Ejecutor, proyectoId: string) =>
  tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, proyectoId));

/**
 * El proyecto pasa a `listo` cuando **todas** sus escenas están producidas, y a `en_produccion` mientras quede
 * alguna sin producir. No se toca un borrador: eso lo decide la aprobación del plan.
 */
export async function ajustarEstadoDelProyecto(tx: Ejecutor, proyectoId: string): Promise<void> {
  const [{ pendientes } = { pendientes: 0 }] = await tx
    .select({ pendientes: sql<number>`count(*)::int` })
    .from(scenes)
    .where(and(eq(scenes.projectId, proyectoId), ne(scenes.state, "producida")));
  await tx
    .update(projects)
    .set({ state: pendientes === 0 ? "listo" : "en_produccion", updatedAt: new Date() })
    .where(and(eq(projects.id, proyectoId), ne(projects.state, "borrador")));
}

/** Marca el proyecto como en producción en cuanto se encola su primera escena. */
export async function marcarEnProduccion(proyectoId: string): Promise<void> {
  await db()
    .update(projects)
    .set({ state: "en_produccion", updatedAt: new Date() })
    .where(and(eq(projects.id, proyectoId), eq(projects.state, "planificado")));
}

/**
 * Un trabajo de escena ha terminado bien y su resultado ya está en la biblioteca.
 *
 * - **fotograma**: no se aprueba nada; solo se limpia el motivo del último fallo, porque ya no es verdad;
 * - **animación**: el clip es el resultado de la escena, así que la escena pasa a `producida` y el proyecto se
 *   recalcula.
 */
export async function registrarResultadoDeEscena(fila: FilaTrabajo, medioId: string): Promise<void> {
  if (!fila.sceneId) return;
  // Una alternativa de una comparativa A/B queda en la biblioteca de versiones y **no** pasa a ser el clip de la
  // escena: eso lo decide el usuario al elegir ganadora.
  if (fila.kind === "animacion" && (await esAlternativaDeComparativa(fila))) return;
  const escenaId = fila.sceneId;
  await db().transaction(async (tx) => {
    const [escena] = await tx.select().from(scenes).where(eq(scenes.id, escenaId)).limit(1).for("update");
    if (!escena) return;
    /**
     * Pista de voz de la escena (0.21.0). No cambia el estado de la escena: lo que la da por **producida** es su
     * clip, y una escena con voz y sin clip sigue sin estar producida.
     *
     * Se guarda además la **firma** con la que se encoló, no la que el proyecto tenga ahora: es lo único que
     * permite decir después si ese audio sigue correspondiendo a la voz y al diálogo vigentes. Y se limpia el
     * motivo de invalidación, porque el audio que acaba de llegar ya es el de ahora.
     *
     * **No toca `lastFailureReason`**: esa columna es del clip y la lee la rejilla de producción. Borrarla aquí
     * haría desaparecer el motivo real de un clip que sí falló solo porque su voz salió bien, que son dos cosas
     * distintas. Lo que le pase a la voz se cuenta desde su propio trabajo.
     */
    if (fila.kind === "voz") {
      const firma = (fila.input as { firmaVoz?: unknown }).firmaVoz;
      await tx
        .update(scenes)
        .set({
          voiceMediaId: medioId,
          voiceJobId: fila.id,
          voiceSignature: typeof firma === "string" ? firma : "",
          voiceInvalidationReason: "",
          updatedAt: new Date(),
        })
        .where(eq(scenes.id, escenaId));
      await tocarProyecto(tx, escena.projectId);
      return;
    }
    if (fila.kind === "fotograma") {
      await tx.update(scenes).set({ lastFailureReason: "", updatedAt: new Date() }).where(eq(scenes.id, escenaId));
      await tocarProyecto(tx, escena.projectId);
      return;
    }
    await tx
      .update(scenes)
      .set({
        clipMediaId: medioId,
        clipJobId: fila.id,
        state: "producida",
        lastFailureReason: "",
        // Lo producido corresponde otra vez a lo que dice la escena: se generó con el texto de ahora.
        changedSinceGeneration: false,
        updatedAt: new Date(),
      })
      .where(eq(scenes.id, escenaId));
    await ajustarEstadoDelProyecto(tx, escena.projectId);
  });
}

/**
 * Guarda en la escena las **marcas de tiempo medidas** que ha devuelto el proveedor de voz junto al audio
 * (0.21.0). Se guardan como transcripción, que es lo que son: lo que se ha dicho y cuándo, medido.
 *
 * Si la escena no tiene subtítulos **editados por una persona**, se proponen además desde esas marcas: unos
 * tiempos medidos son mejores que repartir el tiempo entre las frases a ojo, y quedan igualmente a la espera de
 * que alguien los revise. Lo que ha corregido una persona **no se toca nunca** desde aquí.
 */
export async function guardarMarcasDeVoz(fila: FilaTrabajo, marcas: MarcasDeVoz): Promise<void> {
  if (!fila.sceneId) return;
  const segmentos = segmentosDesdeMarcas(marcas);
  if (segmentos.length === 0) return;
  const escenaId = fila.sceneId;
  await db().transaction(async (tx) => {
    const [escena] = await tx.select().from(scenes).where(eq(scenes.id, escenaId)).limit(1).for("update");
    if (!escena) return;
    const editados = escena.subtitlesEditedAt !== null && escena.subtitles.length > 0;
    await tx
      .update(scenes)
      .set({
        transcript: segmentos,
        ...(editados ? {} : { subtitles: subtitulosDesdeTranscripcion(segmentos) }),
        updatedAt: new Date(),
      })
      .where(eq(scenes.id, escenaId));
  });
}

/**
 * Un trabajo de escena ha fallado. Se apunta el motivo **apto para el usuario** y nada más: ni se reintenta, ni
 * se consume presupuesto de reintentos, ni se marca la escena como producida.
 *
 * Un trabajo de **voz** no escribe aquí: `lastFailureReason` es el fallo del clip y lo lee la rejilla de
 * producción, así que un fallo de la pista de voz marcaría la escena entera como fallida sin serlo. El fallo de la
 * voz vive en su propio trabajo, y la pantalla de voz lo lee de ahí (`voz/consulta.ts`).
 */
export async function registrarFalloDeEscena(fila: FilaTrabajo, motivo: string): Promise<void> {
  if (fila.kind === "voz") return;
  if (!fila.sceneId || motivo.trim() === "") return;
  // El fallo de una alternativa de una comparativa se ve en la comparativa, no como fallo del clip de la escena.
  if (fila.kind === "animacion" && (await esAlternativaDeComparativa(fila))) return;
  await db()
    .update(scenes)
    .set({ lastFailureReason: motivo, updatedAt: new Date() })
    .where(eq(scenes.id, fila.sceneId));
}
