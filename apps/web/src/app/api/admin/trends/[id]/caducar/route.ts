import { ErrorPreset } from "@/server/prompts/errores";
import { type ContextoId, exigirRitmoDePresets, leerId, manejador } from "@/server/prompts/http";
import { caducarTrend } from "@/server/prompts/plantillas-admin";

export const POST = manejador(async (_: Request, contexto: ContextoId, actor) => {
  if (!actor.esAdmin) throw new ErrorPreset(403, "Solo la administración puede caducar trends.");
  await exigirRitmoDePresets(actor);
  return Response.json({ trend: await caducarTrend(await leerId(contexto)) });
});
