import { type ContextoId, manejador } from "@/server/marca/http";
import { revertirA } from "@/server/marca/instalacion";

export const dynamic = "force-dynamic";

/** Vuelve a publicar una versión del historial tal como era. */
export const POST = manejador(async (_: Request, contexto: ContextoId, actor) => {
  const { id } = await contexto.params;
  return Response.json({ publicada: await revertirA(actor, id) });
});
