import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/asistente/http";
import { aprobarPlan } from "@/server/asistente/plan";

export const dynamic = "force-dynamic";

/**
 * Aprueba el plan del proyecto: `{ presupuestoCreditos, totalConfirmado }`.
 *
 * No encola nada y no llama a ningún proveedor: lo que hace es **autorizar**. Producir las escenas aprobadas
 * llega en 0.19.0 y pasará por `exigirEscenaAprobada`, que es la puerta que esta aprobación abre.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "aprobar");
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(
    await aprobarPlan(actor, await leerId(contexto), {
      presupuestoCreditos: Number(cuerpo.presupuestoCreditos),
      totalConfirmado: Number(cuerpo.totalConfirmado),
    }),
  );
});
