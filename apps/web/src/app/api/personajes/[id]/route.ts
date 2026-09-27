import { borrarPersonaje, resumenBorrado } from "@/server/personajes/borrado";
import { obtenerPersonaje } from "@/server/personajes/consulta";
import { type ContextoId, leerCuerpo, leerId, manejador } from "@/server/personajes/http";
import { actualizarPersonaje } from "@/server/personajes/servicio";

export const dynamic = "force-dynamic";

/** Ficha completa: referencias y consentimiento. Lo ajeno responde 404 (el admin puede leerlo para revisar). */
export const GET = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  // `?borrado=1` devuelve solo qué se borraría, para poder enumerarlo en el diálogo de confirmación.
  if (new URL(peticion.url).searchParams.get("borrado") === "1") {
    return Response.json(await resumenBorrado(actor, id));
  }
  return Response.json(await obtenerPersonaje(actor, id));
});

/** Cambia nombre, tipo, especie o descripción (solo el dueño). */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(await actualizarPersonaje(actor, id, cuerpo));
});

/** Borra el personaje y sus derivados (medios generados con él), en el almacenamiento incluido. */
export const DELETE = manejador(async (_: Request, contexto: ContextoId, actor) => {
  return Response.json(await borrarPersonaje(actor, await leerId(contexto)));
});
