import { ErrorProyecto } from "@/server/asistente/errores";
import { exigirMismoOrigen, exigirRitmoDeEscritura, manejador } from "@/server/asistente/http";
import { recalibrar, vistaDeCalibracion } from "@/server/calibracion/calibrar";

export const dynamic = "force-dynamic";

/**
 * Calibración de umbrales (solo quien administra). A cualquier otra cuenta se le responde 404, como si no existiera:
 * el conjunto etiquetado es de la instalación y no se enseña ni se exporta.
 *
 * - `GET`: el conjunto de ahora y el último cálculo de cada pregunta;
 * - `POST`: reconstruye el conjunto con las revisiones humanas registradas y vuelve a calibrar. **No activa nada** ni
 *   llama a ningún proveedor: solo lee lo que ya está en la base de datos.
 */
export const GET = manejador(async (_: Request, __: unknown, actor) => {
  if (!actor.esAdmin) throw new ErrorProyecto(404, "No existe.");
  return Response.json(await vistaDeCalibracion());
});

export const POST = manejador(async (peticion: Request, __: unknown, actor) => {
  if (!actor.esAdmin) throw new ErrorProyecto(404, "No existe.");
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "calibracion");
  await recalibrar();
  return Response.json(await vistaDeCalibracion());
});
