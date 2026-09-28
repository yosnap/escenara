import { eq } from "drizzle-orm";
import { leerObjeto } from "@/server/almacenamiento";
import { ErrorProyecto } from "@/server/asistente/errores";
import { exigirMismoOrigen, leerCuerpo, manejador } from "@/server/asistente/http";
import { db } from "@/server/db/cliente";
import { media } from "@/server/db/esquema";
import { extraerSeisC } from "@/server/direccion/extraccion";
import { imagenParaModelo } from "@/server/media/procesado";

export const dynamic = "force-dynamic";

/**
 * Lee las 6C de una foto de referencia del usuario y devuelve **campos revisables**.
 *
 * Es un `POST` porque llama a un servicio de percepción, aunque no cueste créditos (se paga por la cuota del
 * plan, como toda la percepción desde la 0.24.0). Devuelve `confirmada: false` y **no genera nada**: lo que
 * un modelo cree ver no es lo que el usuario quiere pedir, y darlo por bueno sin que lo mire sería gastarle
 * el dinero en la interpretación de otro.
 *
 * Solo se puede leer una foto **suya**: una de otro responde 404, como en toda la biblioteca.
 */
export const POST = manejador(async (peticion: Request, _contexto: unknown, actor) => {
  exigirMismoOrigen(peticion);
  const cuerpo = await leerCuerpo(peticion);
  const medioId = typeof cuerpo.medioId === "string" ? cuerpo.medioId : "";
  if (medioId === "") throw new ErrorProyecto(400, "Falta la foto de la que leer los campos.");

  const [fila] = await db().select().from(media).where(eq(media.id, medioId)).limit(1);
  // Ni se dice que existe: una foto de otra persona no está para nadie más.
  if (!fila || fila.ownerId !== actor.id || fila.deletedAt !== null) {
    throw new ErrorProyecto(404, "Esa foto no existe.");
  }
  const imagen = await imagenParaModelo(new Uint8Array(await leerObjeto(fila.storageKey).arrayBuffer()));
  const extraccion = await extraerSeisC({ usuarioId: actor.id, medioId, imagen });
  return Response.json(extraccion);
});
