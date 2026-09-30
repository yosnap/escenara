import { type ContextoId, exigirRitmoDeEscritura, manejador } from "@/server/comunidad/http";
import { usarPublicacion } from "@/server/comunidad/usar";

export const dynamic = "force-dynamic";

/** Usa un trend o una plantilla compartidos: registra el uso (atribución) y devuelve a dónde ir en «Crear». */
export const POST = manejador(async (_: Request, contexto: ContextoId, actor) => {
  await exigirRitmoDeEscritura(actor);
  return Response.json(await usarPublicacion(actor, (await contexto.params).id));
});
