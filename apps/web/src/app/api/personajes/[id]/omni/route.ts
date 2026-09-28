import { proyectoPropio } from "@/server/asistente/consulta";
import { obtenerPersonaje } from "@/server/personajes/consulta";
import { type ContextoId, leerCuerpo, leerId, manejador } from "@/server/personajes/http";
import { registrarPersonajeOmni, volverARegistrar } from "@/server/personajes/omni";
import { vozOmniDelProyecto } from "@/server/voz/omni";

export const dynamic = "force-dynamic";

/**
 * Registra al personaje en el proveedor para las escenas habladas de un proyecto:
 * `{ proyectoId, volverARegistrar? }`.
 *
 * **No cuesta créditos** (medido el 2026-09-28), pero envía su retrato al proveedor, así que exige
 * consentimiento vigente igual que generar. La voz con la que se registra es **la del proyecto**: no llega
 * ninguna en la petición, porque una voz por personaje volvería a cambiar el timbre entre proyectos.
 *
 * `volverARegistrar` es para cuando el proveedor ha caducado el identificador anterior: marca el viejo como
 * reemplazado y registra otro, tampoco con coste.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  const proyecto = await proyectoPropio(actor, cuerpo.proyectoId);
  const voz = vozOmniDelProyecto(proyecto);
  const audioId = voz?.audioId ?? "";
  if (cuerpo.volverARegistrar === true) {
    await volverARegistrar(
      actor,
      id,
      audioId,
      "El proveedor dejó de reconocer el personaje registrado, así que se registró de nuevo.",
    );
  } else {
    await registrarPersonajeOmni(actor, id, audioId);
  }
  return Response.json(await obtenerPersonaje(actor, id));
});
