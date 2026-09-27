import { esCategoriaPreset } from "@/lib/presets";
import { ErrorPreset } from "@/server/prompts/errores";
import { type ContextoId, exigirRitmoDePresets, leerId, manejador } from "@/server/prompts/http";
import { borrarPresetPropio, editarPresetPropio } from "@/server/prompts/presets-admin";

export const dynamic = "force-dynamic";

/**
 * Edición y borrado de **tus** copias de presets. Un preset de la instalación responde 403 («duplícalo para
 * poder cambiarlo») y uno de otro usuario, 404: no se revela ni que existe.
 *
 * Exigen `Origin` del mismo sitio y llevan límite de ritmo, como todo lo que escribe.
 */

async function leerCuerpo(peticion: Request): Promise<Record<string, unknown>> {
  const cuerpo = await peticion.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== "object") throw new ErrorPreset(400, "Envía los datos en JSON.");
  return cuerpo as Record<string, unknown>;
}

/** `{ nombre, descripcion, prompt, activo }`. La categoría y la clave no se cambian. */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  await exigirRitmoDePresets(actor);
  // La categoría de la fila manda; la del cuerpo solo se acepta si coincide, y el servicio la ignora igual.
  const categoria = esCategoriaPreset(cuerpo.categoria) ? cuerpo.categoria : "especialidad";
  return Response.json(
    await editarPresetPropio(actor.id, id, {
      categoria,
      clave: "",
      nombre: String(cuerpo.nombre ?? ""),
      descripcion: String(cuerpo.descripcion ?? ""),
      prompt: String(cuerpo.prompt ?? ""),
      proporcion: typeof cuerpo.proporcion === "string" ? cuerpo.proporcion : undefined,
      segundos: typeof cuerpo.segundos === "number" ? cuerpo.segundos : undefined,
      orden: typeof cuerpo.orden === "number" ? cuerpo.orden : 100,
      activo: cuerpo.activo !== false,
    }),
  );
});

export const DELETE = manejador(async (_: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  await exigirRitmoDePresets(actor);
  await borrarPresetPropio(actor.id, id);
  return new Response(null, { status: 204 });
});
