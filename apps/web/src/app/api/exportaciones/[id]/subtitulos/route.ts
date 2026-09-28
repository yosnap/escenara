import { esFormatoSubtitulos, MIME_SUBTITULOS } from "@/lib/voz";
import { type ContextoId, leerId, manejador } from "@/server/asistente/http";
import { ErrorMontaje } from "@/server/montaje/errores";
import { exportacionPropia, subtitulosGuardados } from "@/server/montaje/exportacion";

export const dynamic = "force-dynamic";

/**
 * Descarga de los subtítulos **de una exportación** (RF08, 0.32.0), en SRT (`?formato=srt`) o en WebVTT
 * (`?formato=vtt`).
 *
 * No se recomponen al descargarlos: se devuelven **tal como se guardaron al exportar**. Es la diferencia con
 * `/api/proyectos/[id]/voz/subtitulos`, que exporta los del proyecto vigente: los de una escena se pueden editar
 * después, y entonces el fichero adjunto ya no correspondería al vídeo que alguien descargó. Los tiempos son los
 * del montaje, corridos con los recortes de cada fragmento.
 */
export const GET = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const formato = new URL(peticion.url).searchParams.get("formato") ?? "srt";
  if (!esFormatoSubtitulos(formato)) {
    throw new ErrorMontaje(400, "Los subtítulos se descargan en «srt» o en «vtt».");
  }
  const exportacion = await exportacionPropia(actor, await leerId(contexto));
  const contenido = subtitulosGuardados(exportacion, formato);
  return new Response(contenido, {
    headers: {
      "Content-Type": MIME_SUBTITULOS[formato],
      // Nombre ASCII y con el identificador de la exportación: es el que la distingue de otra del mismo proyecto.
      "Content-Disposition": `attachment; filename="montaje-${exportacion.id}.${formato}"`,
      "Cache-Control": "no-store",
    },
  });
});
