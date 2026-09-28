import { and, desc, eq, ne, sql } from "drizzle-orm";
import { duracionTotalDeFragmentos, erroresDeMontaje, subtitulosDelMontaje, tieneSubtitulos } from "@/lib/montaje";
import type { FormatoSubtitulos } from "@/lib/voz";
import { db } from "../db/cliente";
import { type FilaExportacion, type FilaMontaje, montageExports, projects } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { ErrorMontaje } from "./errores";
import { exigirHerramientasDeRender } from "./ffmpeg";
import { escenasParaValidar, type MaterialDelProyecto } from "./material";
import { exigirControlesDelMontaje, resolucionDe } from "./puerta";
import { exigirMontajeActivo } from "./servicio";

/**
 * Exportaciones de un montaje (RF08, 0.32.0): pedirlas, listarlas y cerrarlas.
 *
 * **Idempotente por montaje y versión**: pedir la exportación de la misma versión dos veces devuelve la misma
 * fila, no un segundo MP4 ocupando la cuota de alguien. Lo garantizan dos cosas, no una: la fila del montaje se
 * bloquea mientras se decide (así dos peticiones simultáneas se ponen en fila) y hay un índice único parcial que
 * es la red por debajo.
 *
 * Una exportación **fallida** sí se puede repetir: es lo único que la idempotencia no cubre a propósito, porque
 * el usuario tiene que poder volver a intentarlo después de arreglar lo que fuera.
 *
 * El render no cuesta créditos: aquí no hay estimación, ni confirmación de coste, ni sello de precio, ni apunte
 * en `usage_ledger`. Lo único que se comprueba antes es que **hay sitio** para el resultado y que el material
 * está (`puerta.ts`).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Exportaciones del proyecto, de la más reciente a la más antigua. */
export function exportacionesDeProyecto(proyectoId: string, limite = 20): Promise<FilaExportacion[]> {
  return db()
    .select()
    .from(montageExports)
    .where(eq(montageExports.projectId, proyectoId))
    .orderBy(desc(montageExports.createdAt))
    .limit(limite);
}

/**
 * Exportación de un proyecto del actor. Una ajena responde **404**, igual que el proyecto del que sale: el cruce
 * con el montaje y con el proyecto va en la misma consulta.
 */
export async function exportacionPropia(actor: Actor, id: unknown): Promise<FilaExportacion> {
  if (!UUID.test(String(id))) throw new ErrorMontaje(404, "Esa exportación no existe.");
  const [fila] = await db()
    .select({ exportacion: montageExports })
    .from(montageExports)
    .innerJoin(projects, eq(projects.id, montageExports.projectId))
    .where(and(eq(montageExports.id, String(id)), eq(projects.userId, actor.id)))
    .limit(1);
  if (!fila) throw new ErrorMontaje(404, "Esa exportación no existe.");
  return fila.exportacion;
}

/**
 * Pide la exportación del montaje vigente. Devuelve la fila **y** si se acaba de crear, para que la pantalla
 * pueda decir «ya la estabas exportando» en lugar de fingir que ha empezado otra vez.
 *
 * El orden importa y es este: que el montaje esté activo, que FFmpeg esté instalado, que la línea de tiempo siga
 * siendo válida (una escena puede haber perdido su clip desde que se guardó), y después la puerta de controles.
 * Nada se escribe hasta que las cuatro pasan.
 */
export async function pedirExportacion(
  actor: Actor,
  montaje: FilaMontaje,
  material: MaterialDelProyecto,
): Promise<{ exportacion: FilaExportacion; nueva: boolean }> {
  await exigirMontajeActivo();
  await exigirHerramientasDeRender();

  const errores = erroresDeMontaje(montaje.fragments, escenasParaValidar(material));
  if (errores.length > 0) throw new ErrorMontaje(409, errores.join(" "));

  const segundos = duracionTotalDeFragmentos(montaje.fragments);
  await exigirControlesDelMontaje(actor, montaje, material, segundos);

  const { ancho, alto } = resolucionDe(montaje);
  const subtitulos = subtitulosDeLaExportacion(montaje, material);

  return db().transaction(async (tx) => {
    // Se bloquea la fila del montaje: mientras se decide si hay que crear la exportación, nadie más puede
    // decidir lo mismo. Sin esto, dos clics a la vez pasarían los dos por el `select` y el segundo se estrellaría
    // contra el índice único en lugar de recibir la exportación que ya existe.
    await tx.execute(sql`select 1 from montages where id = ${montaje.id}::uuid for update`);
    const [viva] = await tx
      .select()
      .from(montageExports)
      .where(
        and(
          eq(montageExports.montageId, montaje.id),
          eq(montageExports.montageVersion, montaje.version),
          ne(montageExports.state, "fallido"),
        ),
      )
      .limit(1);
    if (viva) return { exportacion: viva, nueva: false };
    const [creada] = await tx
      .insert(montageExports)
      .values({
        projectId: material.proyecto.id,
        montageId: montaje.id,
        montageVersion: montaje.version,
        format: montaje.format,
        width: ancho,
        height: alto,
        labelApplied: montaje.labelVisible,
        labelPosition: montaje.labelPosition,
        burnedSubtitles: montaje.burnSubtitles && subtitulos.hay,
        subtitlesSrt: subtitulos.srt,
        subtitlesVtt: subtitulos.vtt,
      })
      .returning();
    if (!creada) throw new ErrorMontaje(500, "No se ha podido encolar la exportación.");
    return { exportacion: creada, nueva: true };
  });
}

/**
 * Subtítulos de la exportación, en los **dos** formatos y con los tiempos ya corridos por los recortes.
 *
 * Se calculan al pedir la exportación y se guardan con ella: los subtítulos de una escena se pueden editar
 * después, y el fichero adjunto de un vídeo ya exportado tiene que seguir siendo el que corresponde a ese vídeo.
 */
export function subtitulosDeLaExportacion(
  montaje: FilaMontaje,
  material: MaterialDelProyecto,
): { srt: string; vtt: string; hay: boolean } {
  const porEscena = material.escenas.map((e) => ({ escenaId: e.escena.id, subtitulos: e.subtitulos }));
  if (!tieneSubtitulos(montaje.fragments, porEscena)) return { srt: "", vtt: "", hay: false };
  const componer = (formato: FormatoSubtitulos) => subtitulosDelMontaje(montaje.fragments, porEscena, formato);
  return { srt: componer("srt"), vtt: componer("vtt"), hay: true };
}

/** Contenido del fichero de subtítulos de una exportación, tal como se guardó al exportar. */
export function subtitulosGuardados(exportacion: FilaExportacion, formato: FormatoSubtitulos): string {
  const contenido = formato === "srt" ? exportacion.subtitlesSrt : exportacion.subtitlesVtt;
  if (contenido.trim() === "") {
    throw new ErrorMontaje(
      404,
      "Esta exportación no lleva subtítulos: el montaje no tenía ninguno guardado cuando se hizo.",
    );
  }
  return contenido;
}
