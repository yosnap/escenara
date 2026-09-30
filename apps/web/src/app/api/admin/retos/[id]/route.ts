import { type ContextoId, exigirRitmoDeEscritura, leerCuerpo, manejador } from "@/server/comunidad/http";
import { borrarReto, editarReto } from "@/server/comunidad/retos";

export const dynamic = "force-dynamic";

/** Edita un reto (solo quien administra). */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  await exigirRitmoDeEscritura(actor);
  const c = await leerCuerpo(peticion);
  await editarReto(actor, (await contexto.params).id, {
    titulo: c.titulo,
    descripcion: c.descripcion,
    desde: c.desde,
    hasta: c.hasta,
    plantilla: c.plantilla,
  });
  return Response.json({ ok: true });
});

/** Borra un reto; sus participaciones siguen publicadas, sin reto. */
export const DELETE = manejador(async (_: Request, contexto: ContextoId, actor) => {
  await exigirRitmoDeEscritura(actor);
  await borrarReto(actor, (await contexto.params).id);
  return Response.json({ ok: true });
});
