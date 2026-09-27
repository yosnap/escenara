import { registrarConsentimiento, revocarConsentimiento } from "@/server/personajes/consentimiento";
import { type ContextoId, leerCuerpo, leerId, manejador } from "@/server/personajes/http";

export const dynamic = "force-dynamic";

/**
 * Registra el consentimiento: `{ titular, mayoriaDeEdad, alcance?, documentoId? }`. La declaración de
 * mayoría de edad es obligatoria y el titular `tercero` exige documento firmado.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(
    await registrarConsentimiento(actor, id, {
      titular: cuerpo.titular,
      mayoriaDeEdad: cuerpo.mayoriaDeEdad,
      alcance: cuerpo.alcance,
      documentoId: cuerpo.documentoId,
    }),
  );
});

/** Revoca el consentimiento vigente: `{ motivo? }`. El personaje queda bloqueado al momento. */
export const DELETE = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await peticion.json().catch(() => ({}));
  return Response.json(await revocarConsentimiento(actor, id, (cuerpo as { motivo?: unknown }).motivo));
});
