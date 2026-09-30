import { type ContextoId, leerId, manejador } from "@/server/asistente/http";
import { resumenBorradoProyecto } from "@/server/datos/borrado-proyecto";

export const dynamic = "force-dynamic";

/** Qué desaparece al borrar el proyecto, para enumerarlo en el diálogo antes de confirmar. Uno ajeno responde 404. */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) =>
  Response.json(await resumenBorradoProyecto(actor, await leerId(contexto))),
);
