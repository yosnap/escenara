import { eq } from "drizzle-orm";
import { leerObjeto } from "@/server/almacenamiento";
import { ErrorProyecto } from "@/server/asistente/errores";
import { exigirMismoOrigen, exigirRitmoDeEscritura, leerCuerpo, manejador } from "@/server/asistente/http";
import { db } from "@/server/db/cliente";
import { media } from "@/server/db/esquema";
import { avisoDeCamposSinLeer, extraerSeisC, motivoSinPermisoParaLeer } from "@/server/direccion/extraccion";
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
  // Leer campos llama a un servicio externo: el mismo ritmo que el resto de la escritura, para que un bucle de
  // reintentos del navegador no agote la cuota de quien paga el plan.
  await exigirRitmoDeEscritura(actor, "extraer");
  const cuerpo = await leerCuerpo(peticion);
  const medioId = typeof cuerpo.medioId === "string" ? cuerpo.medioId : "";
  if (medioId === "") throw new ErrorProyecto(400, "Falta la foto de la que leer los campos.");

  const [fila] = await db().select().from(media).where(eq(media.id, medioId)).limit(1);
  // Ni se dice que existe: una foto de otra persona no está para nadie más.
  if (!fila || fila.ownerId !== actor.id || fila.deletedAt !== null) {
    throw new ErrorProyecto(404, "Esa foto no existe.");
  }
  // De un vídeo no se leen campos: sin esto se cargaría el fichero entero en memoria para que `sharp` fallara
  // con un 500 mudo.
  if (!fila.mimeType.startsWith("image/")) {
    throw new ErrorProyecto(400, "De ese archivo no se pueden leer campos porque no es una imagen.");
  }

  /**
   * Puerta de privacidad: leer los campos **sube la foto** a un servicio de percepción externo. Si es la
   * referencia de un personaje real, manda su consentimiento; si es una foto suelta, decide el usuario con la
   * verdad delante, y sin su confirmación no sale nada de aquí.
   */
  const sinPermiso = await motivoSinPermisoParaLeer(medioId, cuerpo.confirmoEnvio === true);
  if (sinPermiso !== "") throw new ErrorProyecto(409, sinPermiso);

  const imagen = await imagenParaModelo(new Uint8Array(await leerObjeto(fila.storageKey).arrayBuffer()));
  const extraccion = await extraerSeisC({ usuarioId: actor.id, medioId, imagen });
  /**
   * Solo salen los **campos revisables** y el aviso de los que no se han podido leer. Los hechos en crudo que
   * devolvió la percepción se quedan en el servidor, como el resto del material de prompt (ADR-0022): lo que
   * el usuario necesita es lo que va a corregir, no la descripción en inglés de la que salió.
   */
  return Response.json({
    campos: extraccion.campos,
    aviso: avisoDeCamposSinLeer(extraccion.sinLeer),
    confirmada: extraccion.confirmada,
  });
});
