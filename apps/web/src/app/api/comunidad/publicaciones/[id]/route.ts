import { type ContextoId, exigirRitmoDeEscritura, leerCuerpo, manejador } from "@/server/comunidad/http";
import { editar, retirar } from "@/server/comunidad/publicar";

export const dynamic = "force-dynamic";

/** Edita una publicación propia (título, descripción, firma, reto). Vuelve a moderación. */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  await exigirRitmoDeEscritura(actor);
  const cuerpo = await leerCuerpo(peticion);
  const { id } = await contexto.params;
  return Response.json(
    await editar(actor, id, {
      titulo: cuerpo.titulo,
      descripcion: cuerpo.descripcion,
      firma: cuerpo.firma,
      reto: cuerpo.reto,
    }),
  );
});

/** Retira una publicación propia: la borra con su copia; el original no se toca. Retirar dos veces no falla. */
export const DELETE = manejador(async (_: Request, contexto: ContextoId, actor) => {
  await exigirRitmoDeEscritura(actor);
  return Response.json(await retirar(actor, (await contexto.params).id));
});
