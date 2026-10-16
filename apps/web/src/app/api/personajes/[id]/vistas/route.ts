import { type ContextoId, leerCuerpo, leerId, manejador } from "@/server/personajes/http";
import { pedirVistasQueFaltan } from "@/server/personajes/vista-sintetica";

export const dynamic = "force-dynamic";

/**
 * Encola de una vez **las vistas que le faltan** al personaje (0.22.1). El cuerpo es el de una vista suelta con
 * `vistas` en lugar de `vista`: la lista que el usuario confirmó. Qué falta lo decide el servidor, y nunca encarga
 * una vista que no esté en esa lista.
 *
 * Cada vista se encola por el camino de siempre, con su reserva, su clave de idempotencia derivada de esta
 * confirmación y sus controles previos. La respuesta dice cuáles han salido y cuáles no, con su motivo:
 * las que no salen **no se cobran**.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  const encargadas = await pedirVistasQueFaltan(actor, id, {
    vistas: cuerpo.vistas,
    creditosConfirmados: cuerpo.creditosConfirmados,
    derechos: cuerpo.derechos,
    sinTerceros: cuerpo.sinTerceros,
    avisoUmbralAceptado: cuerpo.avisoUmbralAceptado,
    claveIdempotencia: cuerpo.claveIdempotencia,
    modelo: cuerpo.modelo,
    selloEstimacion: cuerpo.selloEstimacion,
    avisosConfirmados: cuerpo.avisosConfirmados,
  });
  return Response.json(encargadas, { status: 201 });
});
