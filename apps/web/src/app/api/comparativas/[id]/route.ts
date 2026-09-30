import { type ContextoId, leerId, manejador } from "@/server/asistente/http";
import { verComparativa } from "@/server/comparativas/ab";

export const dynamic = "force-dynamic";

/** Una comparativa del usuario con el estado real de cada alternativa. Una ajena responde 404. */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) =>
  Response.json(await verComparativa(actor, await leerId(contexto))),
);
