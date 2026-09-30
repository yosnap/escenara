import { leerTramo } from "@/lib/demo-plantilla";
import { leerObjeto } from "@/server/almacenamiento";
import { archivoDeDemo } from "@/server/prompts/demos";
import { ErrorPreset } from "@/server/prompts/errores";
import { type ContextoId, exigirRitmoDeEjemplos, leerId, manejador } from "@/server/prompts/http";

export const dynamic = "force-dynamic";

/**
 * Archivo del ejemplo de una plantilla o de un trend, desde el mismo origen.
 *
 * Es la **única** puerta por la que un usuario ve un medio de quien administra: solo entrega el medio marcado como
 * ejemplo de una plantilla que a ese usuario se le ofrece (activa y, si es un trend, vigente), nunca uno cualquiera
 * de la biblioteca. Acepta `Range` porque los navegadores lo piden para reproducir y saltar en un vídeo.
 */
export const GET = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  await exigirRitmoDeEjemplos(actor);
  const demo = await archivoDeDemo(actor, await leerId(contexto));
  const objeto = leerObjeto(demo.clave);
  const info = await objeto.stat().catch(() => {
    throw new ErrorPreset(404, "El ejemplo no está en el almacenamiento.");
  });
  const cabeceras: Record<string, string> = {
    "Content-Type": demo.mime,
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  };
  const tramo = leerTramo(peticion.headers.get("range"), info.size);
  if (tramo === "fuera") {
    return new Response(null, { status: 416, headers: { ...cabeceras, "Content-Range": `bytes */${info.size}` } });
  }
  if (tramo === null) {
    return new Response(objeto.stream(), { headers: { ...cabeceras, "Content-Length": String(info.size) } });
  }
  return new Response(objeto.slice(tramo.inicio, tramo.fin + 1).stream(), {
    status: 206,
    headers: {
      ...cabeceras,
      "Content-Length": String(tramo.fin - tramo.inicio + 1),
      "Content-Range": `bytes ${tramo.inicio}-${tramo.fin}/${info.size}`,
    },
  });
});
