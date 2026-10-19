import { exigirMismoOrigen, exigirRitmoDeEscritura, manejador } from "@/server/asistente/http";
import { aprobarPlanoBase } from "@/server/automatico/planos-base";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string; personajeId: string }> };

/**
 * Da por bueno el plano base de un personaje: pasa a ser el fotograma aprobado de las escenas de ese plano que aún no
 * tienen clip. No gasta nada.
 */
export const POST = manejador(async (peticion: Request, contexto: Contexto, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "producir");
  const { id, personajeId } = await contexto.params;
  return Response.json(await aprobarPlanoBase(actor, id, personajeId));
});
