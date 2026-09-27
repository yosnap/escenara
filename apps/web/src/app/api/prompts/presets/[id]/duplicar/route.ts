import { type ContextoId, exigirRitmoDePresets, leerId, manejador } from "@/server/prompts/http";
import { duplicarPreset } from "@/server/prompts/presets-admin";

export const dynamic = "force-dynamic";

/**
 * Duplica un preset de la instalación para hacerlo **tuyo**: la copia nace activa, con tu identificador de
 * dueño y apuntando al original. Editarla no toca la de la instalación, y nadie más la ve.
 *
 * Exige `Origin` del mismo sitio, como todo lo que cambia datos, y lleva límite de ritmo: escribe una fila y
 * nadie la borra sola.
 */
export const POST = manejador(async (_: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  await exigirRitmoDePresets(actor);
  return Response.json(await duplicarPreset(actor.id, id), { status: 201 });
});
