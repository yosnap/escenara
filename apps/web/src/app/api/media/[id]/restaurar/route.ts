import { type ContextoId, leerId, manejador } from "@/server/media/http";
import { restaurarMedio } from "@/server/media/servicio";

export const dynamic = "force-dynamic";

export const POST = manejador(async (_: Request, contexto: ContextoId, actor) => {
  return Response.json(await restaurarMedio(actor, await leerId(contexto)));
});
