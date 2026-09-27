import { esIdentificadorDeModelo } from "@/lib/catalogo";
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
 * `modelo` y `selloEstimacion` son opcionales: sin ellos se usa el modelo predeterminado de la capacidad.
 * Con ellos, el modelo tiene que estar en el catálogo y el sello ser el del precio vigente.
 *
 * - fotograma: `{ tipo: "fotograma", medioId | personajeId, prompt, creditosConfirmados, derechos,
 *   claveIdempotencia }`. Con `personajeId` se envían varias referencias del personaje y hace falta además
 *   `sinTerceros` (la revisión de referencias de ADR-0009); el personaje tiene que tener consentimiento
 *   vigente y referencias suficientes, o se rechaza con 409.
 * - animación: `{ tipo: "animacion", trabajoPadreId, dialogo?, … }` (`dialogo` es lo que dice el personaje,
 *   que solo se usa en el clip: en el fotograma los modelos lo dibujarían como texto)
 *
 * `avisoUmbralAceptado` es obligatorio cuando la estimación pasa del aviso de Admin › Ajustes.
 */
export const POST = manejador(async (peticion: Request, _: unknown, actor) => {
  exigirMismoOrigen(peticion);
  const cuerpo = await leerCuerpo(peticion);
  if (!esTipoTrabajo(cuerpo.tipo)) throw new ErrorGeneracion(400, "Tipo de trabajo no válido.");
  if (cuerpo.modelo !== undefined && !esIdentificadorDeModelo(cuerpo.modelo)) {
    throw new ErrorGeneracion(400, "Ese modelo no es válido.");
  }
  const sello = cuerpo.selloEstimacion;
  if (sello !== undefined && (typeof sello !== "string" || sello.length > 200)) {
    throw new ErrorGeneracion(400, "La estimación confirmada no es válida.");
  }
  const comun = {
    prompt: String(cuerpo.prompt ?? ""),
    creditosConfirmados: cuerpo.creditosConfirmados as number,
    derechos: cuerpo.derechos === true,
    avisoUmbralAceptado: cuerpo.avisoUmbralAceptado === true,
    claveIdempotencia: cuerpo.claveIdempotencia as string,
    modelo: cuerpo.modelo,
    selloEstimacion: sello,
  };
  const envio =
    cuerpo.tipo === "fotograma"
      ? await crearFotograma(actor, {
          ...comun,
          medioId: cuerpo.medioId as string | undefined,
          personajeId: cuerpo.personajeId as string | undefined,
          sinTerceros: cuerpo.sinTerceros === true,
        })
      : await crearAnimacion(actor, {
          ...comun,
          trabajoPadreId: cuerpo.trabajoPadreId as string,
          // Como el resto de los campos: si llega, tiene que ser texto.
          dialogo: cuerpo.dialogo === undefined ? "" : (cuerpo.dialogo as string),
          // Obligatoria si el fotograma del que sale el clip se hizo con un personaje.
          sinTerceros: cuerpo.sinTerceros === true,
        });
  // 201 cuando el trabajo es nuevo; 200 si esta confirmación ya se había enviado (misma clave).
  return Response.json(envio.trabajo, { status: envio.nueva ? 201 : 200 });
});
