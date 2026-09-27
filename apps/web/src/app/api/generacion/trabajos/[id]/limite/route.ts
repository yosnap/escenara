import { autorizarLimite } from "@/server/cola/cancelar";
import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeConsultas,
  leerCuerpo,
  leerIdTrabajo,
  manejador,
} from "@/server/generacion/http";

export const dynamic = "force-dynamic";

/**
 * Autoriza un tope de créditos para un trabajo cuyo coste no se podía acotar (`esperando_limite`) y lo mete
 * en la cola. El cuerpo es `{ creditos: number }` y el tope autorizado es exactamente lo que se reserva.
 */
export const POST = manejador<ContextoId>(async (peticion: Request, contexto, actor) => {
  exigirMismoOrigen(peticion);
  const id = await leerIdTrabajo(contexto);
  await exigirRitmoDeConsultas(actor, "limite");
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(await autorizarLimite(actor.id, id, cuerpo.creditos));
});
