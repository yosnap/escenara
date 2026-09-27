import { esTipoTrabajo } from "@/lib/generacion";
import { ErrorGeneracion } from "@/server/generacion/errores";
import { exigirMismoOrigen, leerCuerpo, manejador } from "@/server/generacion/http";
import { crearAnimacion, crearFotograma } from "@/server/generacion/servicio";
import { listarTrabajos } from "@/server/generacion/trabajos";

export const dynamic = "force-dynamic";

/** Historial de trabajos de quien pregunta, de lo más reciente a lo más antiguo. */
export const GET = manejador(async (_: Request, __: unknown, actor) =>
  Response.json({ trabajos: await listarTrabajos(actor.id) }),
);

/**
 * Crea un trabajo. Nada se envía al proveedor sin `creditosConfirmados` (los créditos que se mostraron),
 * sin `derechos` marcado y sin `claveIdempotencia`, que evita cobrar dos veces la misma confirmación.
 *
 * - fotograma: `{ tipo: "fotograma", medioId, prompt, creditosConfirmados, derechos, claveIdempotencia }`
 * - animación: `{ tipo: "animacion", trabajoPadreId, … }`
 *
 * `avisoUmbralAceptado` es obligatorio cuando la estimación pasa del aviso de Admin › Ajustes.
 */
export const POST = manejador(async (peticion: Request, _: unknown, actor) => {
  exigirMismoOrigen(peticion);
  const cuerpo = await leerCuerpo(peticion);
  if (!esTipoTrabajo(cuerpo.tipo)) throw new ErrorGeneracion(400, "Tipo de trabajo no válido.");
  const comun = {
    prompt: String(cuerpo.prompt ?? ""),
    creditosConfirmados: cuerpo.creditosConfirmados as number,
    derechos: cuerpo.derechos === true,
    avisoUmbralAceptado: cuerpo.avisoUmbralAceptado === true,
    claveIdempotencia: cuerpo.claveIdempotencia as string,
  };
  const envio =
    cuerpo.tipo === "fotograma"
      ? await crearFotograma(actor, { ...comun, medioId: cuerpo.medioId as string })
      : await crearAnimacion(actor, { ...comun, trabajoPadreId: cuerpo.trabajoPadreId as string });
  // 201 cuando el trabajo es nuevo; 200 si esta confirmación ya se había enviado (misma clave).
  return Response.json(envio.trabajo, { status: envio.nueva ? 201 : 200 });
});
