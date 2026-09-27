import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/asistente/http";
import { estadoDeProduccion } from "@/server/produccion/consulta";
import { leerConfirmacion } from "@/server/produccion/entrada";
import { producirProyecto } from "@/server/produccion/producir";

export const dynamic = "force-dynamic";

/**
 * Estado de producción del proyecto: sus escenas con su estado real, la etapa de cada trabajo, el coste estimado
 * y el consumido. Es **lectura**: no encola nada, no aparta presupuesto y no llama a ningún endpoint de pago.
 */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) =>
  Response.json(await estadoDeProduccion(actor, await leerId(contexto))),
);

/**
 * Produce el proyecto: encola los fotogramas de sus escenas aprobadas hasta el tope de escenas en vuelo.
 *
 * `{ derechos, sinTerceros, creditosConfirmados, selloEstimacion, claveIdempotencia, avisoUmbralAceptado?,
 * avisosConfirmados? }`. `creditosConfirmados` es lo que cuesta **un** fotograma (todas las escenas usan el mismo
 * modelo), y de la clave del navegador se derivan las de cada escena: repetir el mismo clic no encarga otra vez.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "producir");
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(await producirProyecto(actor, await leerId(contexto), leerConfirmacion(cuerpo)));
});
