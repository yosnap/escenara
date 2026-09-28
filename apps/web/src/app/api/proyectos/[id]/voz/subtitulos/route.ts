import { esFormatoSubtitulos, MIME_SUBTITULOS } from "@/lib/voz";
import { ErrorProyecto } from "@/server/asistente/errores";
import { type ContextoId, leerId, manejador } from "@/server/asistente/http";
import { exportarSubtitulos } from "@/server/voz/subtitulos";

export const dynamic = "force-dynamic";

/**
 * Descarga del fichero de subtítulos del proyecto (RF08, 0.21.0), en SRT (`?formato=srt`) o en WebVTT
 * (`?formato=vtt`).
 *
 * Se compone **desde los subtítulos editados**, nunca desde la transcripción cruda: lo que se publica es lo que la
 * persona ha corregido. Es lectura: no genera nada y no cuesta nada.
 */
export const GET = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const formato = new URL(peticion.url).searchParams.get("formato") ?? "srt";
  if (!esFormatoSubtitulos(formato)) {
    throw new ErrorProyecto(400, "Los subtítulos se descargan en «srt» o en «vtt».");
  }
  const { nombre, contenido } = await exportarSubtitulos(actor, await leerId(contexto), formato);
  return new Response(contenido, {
    headers: {
      "Content-Type": MIME_SUBTITULOS[formato],
      "Content-Disposition": `attachment; filename="${nombre}"`,
      // Un fichero de subtítulos cambia en cuanto alguien edita una línea: no se cachea en ningún sitio.
      "Cache-Control": "no-store",
    },
  });
});
