import { archivoDeDemo } from "@/server/prompts/demos";
import { ErrorPreset } from "@/server/prompts/errores";
import { type ContextoId, exigirRitmoDeEjemplos, leerId, manejador } from "@/server/prompts/http";
import { responderArchivo } from "@/server/servir-archivo";

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
  return await responderArchivo(
    peticion,
    demo.clave,
    demo.mime,
    () => new ErrorPreset(404, "El ejemplo no está en el almacenamiento."),
  );
});
