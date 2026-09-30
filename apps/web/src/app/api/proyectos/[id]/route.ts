import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/asistente/http";
import { detalleProyecto } from "@/server/asistente/plan";
import { borrarProyecto, editarProyecto } from "@/server/asistente/proyectos";

export const dynamic = "force-dynamic";

/** Proyecto completo: escenas, afirmaciones y plan con su coste estimado. Un proyecto ajeno responde 404. */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) => {
  return Response.json(await detalleProyecto(actor, await leerId(contexto)));
});

/** Cambia título, formato, idea, concepto, protagonista, presupuesto autorizado o duración del clip (solo el dueño). */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "editar");
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(await editarProyecto(actor, await leerId(contexto), cuerpo));
});

/** Borra el proyecto con sus derivados (escenas, trabajos, lo generado, montajes y paquetes). El gasto se conserva. */
export const DELETE = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await borrarProyecto(actor, await leerId(contexto));
  return Response.json({ ok: true });
});
