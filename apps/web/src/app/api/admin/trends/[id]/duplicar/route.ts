import { ErrorPreset } from "@/server/prompts/errores";
import { type ContextoId, exigirRitmoDePresets, leerId, manejador } from "@/server/prompts/http";
import { duplicarTrend } from "@/server/prompts/plantillas-admin";

export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  if (!actor.esAdmin) throw new ErrorPreset(403, "Solo la administración puede duplicar trends.");
  await exigirRitmoDePresets(actor);
  const cuerpo = (await peticion.json().catch(() => null)) as { clave?: unknown } | null;
  if (typeof cuerpo?.clave !== "string") throw new ErrorPreset(400, "Indica la clave de la copia.");
  return Response.json({ trend: await duplicarTrend(await leerId(contexto), cuerpo.clave, actor.id) }, { status: 201 });
});
