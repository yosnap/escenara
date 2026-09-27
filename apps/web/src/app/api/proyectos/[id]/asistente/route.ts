import { escribirGuion } from "@/server/asistente/generar";
import { type ContextoId, exigirMismoOrigen, leerCuerpo, leerId, manejador } from "@/server/asistente/http";

export const dynamic = "force-dynamic";

/**
 * Pide al asistente un concepto y un guion por escenas:
 * `{ claveIdempotencia, creditosConfirmados, selloEstimacion, escenas? }`.
 *
 * **Es el único POST de esta versión que gasta dinero.** Exige `Origin` del mismo sitio, la estimación
 * confirmada con su sello y una clave de idempotencia: repetir la confirmación devuelve el proyecto tal como
 * está y no vuelve a llamar al proveedor. El límite de ritmo está en el servicio, junto a la reserva.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(
    await escribirGuion(actor, await leerId(contexto), {
      claveIdempotencia: cuerpo.claveIdempotencia,
      creditosConfirmados: cuerpo.creditosConfirmados,
      selloEstimacion: cuerpo.selloEstimacion,
      escenas: cuerpo.escenas,
    }),
  );
});
