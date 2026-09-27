import { esCategoriaPreset, recortarPresetVisible } from "@/lib/presets";
import { ErrorPreset } from "@/server/prompts/errores";
import { type ContextoId, exigirRitmoDePresets, leerId, manejador } from "@/server/prompts/http";
import { borrarPresetPropio, editarPresetPropio } from "@/server/prompts/presets-admin";

export const dynamic = "force-dynamic";

/**
 * Edición y borrado de **tus** copias de presets. Un preset de la instalación responde 403 («duplícalo para
 * poder cambiarlo») y uno de otro usuario, 404: no se revela ni que existe.
 *
 * Exigen `Origin` del mismo sitio y llevan límite de ritmo, como todo lo que escribe.
 *
 * **Lo que devuelven va recortado** (`recortarPresetVisible`, ADR-0022): el fragmento en inglés que entra en el
 * prompt no sale hacia el navegador, ni siquiera en la respuesta de una edición del propio usuario.
 */

async function leerCuerpo(peticion: Request): Promise<Record<string, unknown>> {
  const cuerpo = await peticion.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== "object") throw new ErrorPreset(400, "Envía los datos en JSON.");
  return cuerpo as Record<string, unknown>;
}

/**
 * `{ nombre, descripcion, activo }`. La categoría y la clave no se cambian, y **el fragmento del prompt solo se
 * toca si llega con contenido**: desde «Crear» no llega, y mandar una cadena vacía borraría el que tenía la copia.
 */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  await exigirRitmoDePresets(actor);
  // La categoría de la fila manda; la del cuerpo solo se acepta si coincide, y el servicio la ignora igual.
  const categoria = esCategoriaPreset(cuerpo.categoria) ? cuerpo.categoria : "especialidad";
  const editado = await editarPresetPropio(actor.id, id, {
    categoria,
    clave: "",
    nombre: String(cuerpo.nombre ?? ""),
    descripcion: String(cuerpo.descripcion ?? ""),
    // Solo si llega de verdad: sin esto, editar el nombre desde «Crear» vaciaría el fragmento del prompt.
    ...(typeof cuerpo.prompt === "string" && cuerpo.prompt.trim() !== "" ? { prompt: cuerpo.prompt } : {}),
    proporcion: typeof cuerpo.proporcion === "string" ? cuerpo.proporcion : undefined,
    segundos: typeof cuerpo.segundos === "number" ? cuerpo.segundos : undefined,
    orden: typeof cuerpo.orden === "number" ? cuerpo.orden : 100,
    activo: cuerpo.activo !== false,
  });
  return Response.json(recortarPresetVisible(editado));
});

export const DELETE = manejador(async (_: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  await exigirRitmoDePresets(actor);
  await borrarPresetPropio(actor.id, id);
  return new Response(null, { status: 204 });
});
