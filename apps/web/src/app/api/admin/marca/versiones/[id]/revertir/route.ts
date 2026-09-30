import { type ContextoId, manejador } from "@/server/marca/http";
import { revertirA } from "@/server/marca/instalacion";

export const dynamic = "force-dynamic";

/**
 * Vuelve a publicar una versión del historial tal como era. Si ya no cumple el contraste de hoy, responde
 * `{ borrador, motivos }`: queda restaurada como borrador, sin publicar, con cada par que falla.
 */
export const POST = manejador(async (_: Request, contexto: ContextoId, actor) => {
  const { id } = await contexto.params;
  return Response.json(await revertirA(actor, id));
});
