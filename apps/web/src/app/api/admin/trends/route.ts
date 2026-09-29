import { listarPlantillas } from "@/server/prompts/consulta";
import { ErrorPreset } from "@/server/prompts/errores";
import { exigirRitmoDePresets, manejador } from "@/server/prompts/http";
import { crearPlantillaDeLaInstalacion, type DatosPlantilla } from "@/server/prompts/plantillas-admin";

export const dynamic = "force-dynamic";

export const GET = manejador(async (_: Request, __: unknown, actor) => {
  if (!actor.esAdmin) throw new ErrorPreset(403, "Solo la administración puede ver el editor de trends.");
  return Response.json({ trends: (await listarPlantillas()).filter((p) => p.kind === "trend") });
});

export const POST = manejador(async (peticion: Request, __: unknown, actor) => {
  if (!actor.esAdmin) throw new ErrorPreset(403, "Solo la administración puede crear trends.");
  await exigirRitmoDePresets(actor);
  const cuerpo = await peticion.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo))
    throw new ErrorPreset(400, "Envía los datos del trend en JSON.");
  const trend = await crearPlantillaDeLaInstalacion({ ...(cuerpo as DatosPlantilla), kind: "trend" }, actor.id);
  return Response.json({ trend }, { status: 201 });
});
