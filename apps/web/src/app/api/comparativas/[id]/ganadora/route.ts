import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/asistente/http";
import { elegirGanadora } from "@/server/comparativas/ab";

export const dynamic = "force-dynamic";

/**
 * Elige la alternativa ganadora (`trabajoId`): pasa a ser el clip de la escena con todas las puertas de elegir una
 * versión. No cuesta nada ni llama a ningún proveedor. Una comparativa ajena responde 404.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "comparativa:ganadora");
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(await elegirGanadora(actor, await leerId(contexto), cuerpo.trabajoId));
});
