import { estimacionDeFichaConIA, proponerFichaConIA } from "@/server/personajes/asistente-ficha";
import { filaPropia } from "@/server/personajes/consulta";
import { type ContextoId, leerCuerpo, leerId, manejador } from "@/server/personajes/http";

export const dynamic = "force-dynamic";

/**
 * Lo que costaría completar la ficha con IA y con qué modelo se haría. Es una **lectura**: no llama a ningún
 * proveedor y no reserva nada. Se comprueba antes que el personaje es suyo: si no, responde 404 igual que el
 * resto de la ficha.
 */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) => {
  await filaPropia(actor, await leerId(contexto));
  return Response.json(await estimacionDeFichaConIA(actor.id));
});

/**
 * Propone los campos de la ficha con el modelo de texto del mapa del usuario:
 * `{ claveIdempotencia, creditosConfirmados?, selloEstimacion? }`.
 *
 * **No guarda nada.** Devuelve la propuesta para que se revise campo a campo; aceptarla es la edición de ficha
 * de siempre (`PATCH /api/personajes/[id]`), con su versión y su motivo.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  const propuesta = await proponerFichaConIA(actor, id, {
    claveIdempotencia: cuerpo.claveIdempotencia,
    creditosConfirmados: cuerpo.creditosConfirmados,
    selloEstimacion: cuerpo.selloEstimacion,
  });
  return Response.json(propuesta);
});
