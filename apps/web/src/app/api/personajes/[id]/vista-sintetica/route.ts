import { type ContextoId, leerCuerpo, leerId, manejador } from "@/server/personajes/http";
import { pedirVistaSintetica } from "@/server/personajes/vista-sintetica";

export const dynamic = "force-dynamic";

/**
 * Encola la generación de una vista que le falta al personaje:
 * `{ vista, creditosConfirmados, derechos, sinTerceros, claveIdempotencia, modelo?, selloEstimacion?,
 * avisoUmbralAceptado? }`.
 *
 * No hay atajo de dinero ni de consentimiento: por dentro es un fotograma normal de la cola, con su reserva
 * de presupuesto, su confirmación de coste y las mismas puertas que «Crear». La indicación que se le manda al
 * proveedor la escribe el servidor a partir de la vista; el navegador no puede enviar texto libre por aquí.
 *
 * 201 si el trabajo es nuevo, 200 si esa misma confirmación ya se había encolado.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  const { trabajo, nueva, vista } = await pedirVistaSintetica(actor, id, {
    vista: cuerpo.vista,
    creditosConfirmados: cuerpo.creditosConfirmados,
    derechos: cuerpo.derechos,
    sinTerceros: cuerpo.sinTerceros,
    avisoUmbralAceptado: cuerpo.avisoUmbralAceptado,
    claveIdempotencia: cuerpo.claveIdempotencia,
    modelo: cuerpo.modelo,
    selloEstimacion: cuerpo.selloEstimacion,
  });
  return Response.json({ trabajo, vista }, { status: nueva ? 201 : 200 });
});
