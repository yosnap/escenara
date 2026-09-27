import { componerHojaDePersonaje } from "@/server/personajes/hoja";
import { type ContextoId, exigirRitmoDeAnalisis, leerId, manejador } from "@/server/personajes/http";

export const dynamic = "force-dynamic";

/**
 * Compone (o recompone) la hoja de personaje de la versión vigente: un montaje de sus referencias hecho **en
 * el servidor, sin IA y sin coste**, guardado en la biblioteca del usuario. No hay confirmación de gasto
 * porque no hay gasto que confirmar.
 *
 * Solo el dueño: es un montaje con las fotos de una persona. Lleva el mismo límite de ritmo que añadir
 * referencias, porque es la otra operación de personajes que decodifica imágenes con `sharp`.
 */
export const POST = manejador(async (_: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  await exigirRitmoDeAnalisis(actor);
  return Response.json(await componerHojaDePersonaje(actor, id), { status: 201 });
});
