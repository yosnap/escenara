import { exigirRitmoDeEscritura, leerCuerpo, manejador } from "@/server/comunidad/http";
import { marcarCelebrados } from "@/server/comunidad/logros";

export const dynamic = "force-dynamic";

/** Marca logros propios como celebrados (`{ claves: [...] }`): el confeti sale una sola vez. */
export const POST = manejador(async (peticion: Request, _: unknown, actor) => {
  await exigirRitmoDeEscritura(actor);
  await marcarCelebrados(actor.id, (await leerCuerpo(peticion)).claves);
  return Response.json({ ok: true });
});
