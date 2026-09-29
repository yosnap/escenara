import { leerAjustes } from "@/server/ajustes";
import { listarPlantillas, plantillaUsable } from "@/server/prompts/consulta";
import { ErrorPreset } from "@/server/prompts/errores";
import { type ContextoId, leerId, manejador } from "@/server/prompts/http";
import { alternativaTrendVigente, motivoTrendNoDisponible, vistaPublicaTrend } from "@/server/prompts/trends";

export const dynamic = "force-dynamic";

/** Resuelve un enlace antiguo y ofrece la copia vigente sin revelar el prompt ni la URL del admin. */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) => {
  const plantilla = await plantillaUsable(actor.id, await leerId(contexto));
  if (plantilla.kind !== "trend" || plantilla.ownerId !== null) throw new ErrorPreset(404, "Ese trend no existe.");
  const ajustes = await leerAjustes();
  if (ajustes.trendsVisibles && plantilla.active && plantilla.trendStatus === "vigente") {
    const vista = (await listarPlantillas({ usuarioId: actor.id })).find((p) => p.id === plantilla.id);
    if (!vista) throw new ErrorPreset(404, "Ese trend no existe.");
    return Response.json({ trend: vistaPublicaTrend(vista) });
  }
  const alternativa =
    plantilla.trendStatus === "caducada" && ajustes.trendsVisibles ? await alternativaTrendVigente(plantilla.id) : null;
  return Response.json(
    {
      error: await motivoTrendNoDisponible(plantilla),
      alternativa: alternativa ? vistaPublicaTrend(alternativa) : null,
    },
    { status: 409 },
  );
});
