import { leerAjustes } from "@/server/ajustes";
import { listarPlantillas } from "@/server/prompts/consulta";
import { manejador } from "@/server/prompts/http";
import { vistaPublicaTrend } from "@/server/prompts/trends";

export const dynamic = "force-dynamic";

/** Vista pública en castellano. No serializa texto inglés, versiones internas ni referencias del admin. */
export const GET = manejador(async (_: Request, __: unknown, actor) => {
  const ajustes = await leerAjustes();
  if (!ajustes.trendsVisibles) return Response.json({ trends: [] });
  const todas = await listarPlantillas({ usuarioId: actor.id });
  return Response.json({
    trends: todas
      .filter((p) => p.kind === "trend" && p.deLaInstalacion && p.activa && p.trendStatus === "vigente")
      .map(vistaPublicaTrend),
  });
});
