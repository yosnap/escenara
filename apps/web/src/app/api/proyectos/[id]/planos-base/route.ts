import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/asistente/http";
import { encolarPlanosBase, planosBaseDe } from "@/server/automatico/planos-base";
import { leerConfirmacion } from "@/server/produccion/entrada";

export const dynamic = "force-dynamic";

/**
 * Planos base del vídeo completo: cuáles hacen falta, en qué punto está cada uno y lo que cuestan los que faltan.
 * Es **lectura**: no encola nada ni aparta presupuesto.
 */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) =>
  Response.json(await planosBaseDe(actor, await leerId(contexto))),
);

/**
 * Pide los planos base que faltan con una confirmación por el total: `{ derechos, sinTerceros, creditosConfirmados,
 * selloEstimacion, claveIdempotencia, avisoUmbralAceptado?, avisosConfirmados? }`. Antes registra, sin coste, a
 * quien no esté registrado con su voz. Repetir la misma confirmación no encarga nada más.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "producir");
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(await encolarPlanosBase(actor, await leerId(contexto), leerConfirmacion(cuerpo)));
});
