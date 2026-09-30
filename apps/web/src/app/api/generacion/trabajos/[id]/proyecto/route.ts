import { convertirEnProyecto, estadoDelClip } from "@/server/conversion/servicio";
import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeConsultas,
  leerIdTrabajo,
  manejador,
} from "@/server/generacion/http";

export const dynamic = "force-dynamic";

/**
 * Si este clip de «Crear» se puede convertir en proyecto, por qué no, o a qué proyecto ya pertenece. Es una
 * lectura: no crea nada. Un clip ajeno responde 404.
 */
export const GET = manejador<ContextoId>(async (_: Request, contexto, actor) => {
  const id = await leerIdTrabajo(contexto);
  return Response.json(await estadoDelClip(actor, id));
});

/**
 * Convierte el clip en un proyecto de una escena que lo reutiliza como clip producido. **No cobra nada**: no llama a
 * ningún proveedor. 201 con el proyecto nuevo; 200 con el que ya existía si el clip ya estaba convertido.
 */
export const POST = manejador<ContextoId>(async (peticion: Request, contexto, actor) => {
  exigirMismoOrigen(peticion);
  const id = await leerIdTrabajo(contexto);
  await exigirRitmoDeConsultas(actor, "convertir");
  const convertido = await convertirEnProyecto(actor, id);
  return Response.json(convertido, { status: convertido.nuevo ? 201 : 200 });
});
