import { plantillaDeLaInstalacion } from "@/server/prompts/consulta";
import { ErrorPreset } from "@/server/prompts/errores";
import { type ContextoId, exigirRitmoDePresets, leerId, manejador } from "@/server/prompts/http";
import { type DatosPlantilla, editarPlantillaDeLaInstalacion } from "@/server/prompts/plantillas-admin";

export const dynamic = "force-dynamic";

export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  if (!actor.esAdmin) throw new ErrorPreset(403, "Solo la administración puede editar trends.");
  await exigirRitmoDePresets(actor);
  const id = await leerId(contexto);
  const anterior = await plantillaDeLaInstalacion(id);
  if (anterior.kind !== "trend") throw new ErrorPreset(404, "Ese trend no existe.");
  const cuerpo = await peticion.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo))
    throw new ErrorPreset(400, "Envía los datos del trend en JSON.");
  const trend = await editarPlantillaDeLaInstalacion(id, { ...(cuerpo as DatosPlantilla), kind: "trend" }, actor.id);
  return Response.json({ trend });
});
