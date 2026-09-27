import { revisarConsentimiento } from "@/server/personajes/consentimiento";
import { type ContextoId, leerCuerpo, leerId, manejador } from "@/server/personajes/http";

export const dynamic = "force-dynamic";

/**
 * Revisión del documento de consentimiento de un tercero: `{ aceptado, nota? }`. Solo para quien administra
 * la instalación; a cualquier otro se le responde como si el personaje no existiera.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(await revisarConsentimiento(actor, id, cuerpo.aceptado, cuerpo.nota));
});
