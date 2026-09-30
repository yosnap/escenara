import { ErrorComunidad } from "@/server/comunidad/errores";
import { type ContextoId, exigirRitmoDeEscritura, leerCuerpo, manejador } from "@/server/comunidad/http";
import { moderar } from "@/server/comunidad/moderacion";

export const dynamic = "force-dynamic";

/**
 * Aprueba o rechaza **una revisión concreta** de una publicación: `{ accion: "aprobar" | "rechazar", revision, motivo? }`.
 * Solo quien administra (al resto, 404) y nunca sobre lo suyo (403).
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  if (!actor.esAdmin) throw new ErrorComunidad(404, "No existe.");
  await exigirRitmoDeEscritura(actor);
  const cuerpo = await leerCuerpo(peticion);
  const { id } = await contexto.params;
  if (cuerpo.accion === "aprobar")
    return Response.json(await moderar(actor, id, cuerpo.revision, { accion: "aprobar" }));
  if (cuerpo.accion === "rechazar") {
    const motivo = typeof cuerpo.motivo === "string" ? cuerpo.motivo : "";
    return Response.json(await moderar(actor, id, cuerpo.revision, { accion: "rechazar", motivo }));
  }
  throw new ErrorComunidad(400, "Indica si apruebas o rechazas.");
});
