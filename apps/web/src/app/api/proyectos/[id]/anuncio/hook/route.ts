import { aplicarHook } from "@/server/anuncio/hook";
import { type ContextoId, exigirRitmoDeEscritura, leerCuerpo, leerId, manejador } from "@/server/anuncio/http";

export const dynamic = "force-dynamic";

/**
 * **Elegir el hook** (0.27.0): se escribe como primera frase del guion del proyecto y su arranque llega a la
 * dirección de la escena. `{ texto, camara?, gesto? }`.
 *
 * No cuesta nada: los hooks ya se pagaron al proponerlos, y elegir uno es una edición del guion. Es idempotente,
 * así que pulsar dos veces deja el mismo guion.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  await exigirRitmoDeEscritura(actor);
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(
    await aplicarHook(actor, id, { texto: cuerpo.texto, camara: cuerpo.camara, gesto: cuerpo.gesto }),
  );
});
