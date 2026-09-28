import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/asistente/http";
import { borrarDireccion, renombrarDireccion } from "@/server/direccion/guardadas";

export const dynamic = "force-dynamic";

/**
 * Renombrar y borrar una dirección guardada. **Solo la suya**: el dueño va en el mismo `where` que el
 * identificador, así que la de otra persona responde 404 y ni se dice que existe.
 */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "direcciones");
  const guardada = await renombrarDireccion(actor.id, await leerId(contexto), await leerCuerpo(peticion));
  return Response.json(guardada);
});

export const DELETE = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "direcciones");
  return Response.json(await borrarDireccion(actor.id, await leerId(contexto)));
});
