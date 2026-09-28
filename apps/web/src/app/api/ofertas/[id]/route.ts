import { type ContextoId, exigirRitmoDeEscritura, leerCuerpo, leerId, manejador } from "@/server/anuncio/http";
import { actualizarOferta, borrarOferta, ofertaPropia, vistaDeOferta } from "@/server/anuncio/ofertas";

export const dynamic = "force-dynamic";

/** Una oferta propia. Una ajena responde 404, sin decir que existe. */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) =>
  Response.json(await vistaDeOferta(await ofertaPropia(actor, await leerId(contexto)))),
);

/**
 * Cambia lo que llegue: `{ productoId?, queSeDa?, precio?, garantia?, urgencia?, bonus? }`. Un campo opcional
 * enviado vacío se borra y deja de aparecer en el guion; uno que no se envía se queda como estaba.
 */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  await exigirRitmoDeEscritura(actor);
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(
    await actualizarOferta(actor, await leerId(contexto), {
      productoId: cuerpo.productoId,
      queSeDa: cuerpo.queSeDa,
      precio: cuerpo.precio,
      garantia: cuerpo.garantia,
      urgencia: cuerpo.urgencia,
      bonus: cuerpo.bonus,
    }),
  );
});

/**
 * Borra la oferta **en lógico**: deja de ofrecerse y los briefs que la citaban se quedan sin ella y lo dicen. No
 * se borra de verdad porque el guion que salió de ella ya existe.
 */
export const DELETE = manejador(async (_: Request, contexto: ContextoId, actor) => {
  await exigirRitmoDeEscritura(actor);
  await borrarOferta(actor, await leerId(contexto));
  return Response.json({ borrada: true });
});
