import { crearEscena, reordenarEscenas } from "@/server/asistente/escenas";
import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/asistente/http";
import { detalleProyecto } from "@/server/asistente/plan";

export const dynamic = "force-dynamic";

/** Añade una escena al final: `{ texto?, accion?, segundos? }`. */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "escena");
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  await crearEscena(actor, id, cuerpo);
  return Response.json(await detalleProyecto(actor, id), { status: 201 });
});

/** Reordena las escenas: `{ orden: [id, ...] }` con **todas** las del proyecto en el orden nuevo. */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "escena");
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  await reordenarEscenas(actor, id, cuerpo.orden);
  return Response.json(await detalleProyecto(actor, id));
});
