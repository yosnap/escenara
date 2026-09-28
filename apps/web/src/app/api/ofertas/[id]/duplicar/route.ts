import { type ContextoId, exigirRitmoDeEscritura, leerCuerpo, leerId, manejador } from "@/server/anuncio/http";
import { duplicarOferta } from "@/server/anuncio/ofertas";

export const dynamic = "force-dynamic";

/**
 * Duplica la oferta a **otro producto propio**: `{ productoId }`. Crea una fila nueva y no toca la original, cuyo
 * anuncio sigue vivo. Duplicarla al mismo producto del que ya es se rechaza con su motivo.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  await exigirRitmoDeEscritura(actor);
  const cuerpo = await leerCuerpo(peticion);
  const copia = await duplicarOferta(actor, await leerId(contexto), cuerpo.productoId);
  return Response.json(copia, { status: 201 });
});
