import { cancelarTrabajo } from "@/server/cola/cancelar";
import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeConsultas,
  leerIdTrabajo,
  manejador,
} from "@/server/generacion/http";

export const dynamic = "force-dynamic";

/**
 * Cancela un trabajo que **todavía no ha salido** hacia el proveedor (en cola o esperando límite) y suelta
 * su reserva de presupuesto. Uno ya enviado responde 409: cancelarlo en el proveedor llega en 0.19.0, y solo
 * si el proveedor lo admite.
 */
export const POST = manejador<ContextoId>(async (peticion: Request, contexto, actor) => {
  exigirMismoOrigen(peticion);
  const id = await leerIdTrabajo(contexto);
  await exigirRitmoDeConsultas(actor, "cancelar");
  return Response.json(await cancelarTrabajo(actor.id, id));
});
