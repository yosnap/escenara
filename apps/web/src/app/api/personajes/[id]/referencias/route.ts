import { type ContextoId, exigirRitmoDeAnalisis, leerCuerpo, leerId, manejador } from "@/server/personajes/http";
import { anadirReferencias, ordenarReferencias, quitarReferencias } from "@/server/personajes/servicio";

export const dynamic = "force-dynamic";

/**
 * Añade fotos propias de la biblioteca: `{ referencias: [{ medioId, vista?, vistaClave?, caraRelativa?,
 * usarDeTodasFormas? }] }`. Cada foto pasa el control de calidad del servidor; si **ninguna** lo pasa responde
 * 422 con el detalle por foto, y si pasan unas y otras no, responde 200 con `rechazos`.
 *
 * Lleva límite de ritmo por usuario: es la única operación de personajes que decodifica imágenes.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  await exigirRitmoDeAnalisis(actor);
  return Response.json(await anadirReferencias(actor, id, cuerpo.referencias));
});

/** Reordena las referencias: `{ ids: [...] }` en el orden deseado. La primera es la portada. */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(await ordenarReferencias(actor, id, cuerpo.ids));
});

/** Quita referencias: `{ ids: [...] }`. Las fotos siguen en la biblioteca. */
export const DELETE = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(await quitarReferencias(actor, id, cuerpo.ids));
});
