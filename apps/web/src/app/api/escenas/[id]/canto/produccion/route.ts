import { falloConCoste } from "@/lib/produccion";
import { vistaDelCanto } from "@/server/canto/consulta";
import { ErrorCanto } from "@/server/canto/errores";
import { escenaDeCantoPropia, producirEscenaCantada } from "@/server/canto/escena";
import { type ContextoId, leerCuerpo, leerId, manejador } from "@/server/canto/http";
import { marcarEnProduccion } from "@/server/produccion/cierre";
import { estadoDeProduccion, ultimoTrabajoDeEscena } from "@/server/produccion/consulta";
import { leerConfirmacion } from "@/server/produccion/entrada";

export const dynamic = "force-dynamic";

/**
 * Encola el **clip cantado** de una escena: un solo trabajo, sin fotograma que aprobar antes.
 *
 * Lleva la confirmación de coste de siempre —créditos confirmados, sello de la tarifa y clave de idempotencia—, y la
 * lee el mismo validador que la producción normal: repetir la confirmación devuelve el trabajo que ya existe y no
 * encarga un segundo clip.
 *
 * **Aquí no se decide nada del gasto**: lo decide el servicio con el motor de controles, que es el único sitio donde
 * se decide si algo se puede generar. Si falta la declaración de derechos del audio, si el audio se pasa del tope, si
 * el retrato es horizontal o si el consentimiento del personaje no lo permite, se responde con la causa concreta y
 * **no se ha reservado ni un crédito**.
 *
 * El ritmo de escritura no se aplica a esto: el del gasto es el de siempre (`exigirRitmo`), dentro del servicio.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const cuerpo = await leerCuerpo(peticion);
  const confirmacion = leerConfirmacion(cuerpo);
  const id = await leerId(contexto);
  const { escena, proyecto } = await escenaDeCantoPropia(actor, id);
  const anterior = await ultimoTrabajoDeEscena(escena.id, "animacion");
  const reintentoDeEscena = anterior?.state === "fallido" && falloConCoste(anterior.failureReason);
  if (reintentoDeEscena && escena.retriesUsed >= escena.retryBudget) {
    throw new ErrorCanto(
      409,
      `El clip anterior pudo haberse cobrado. Autoriza un reintento para esta escena antes de pedir otro (llevas ${escena.retriesUsed} de ${escena.retryBudget}). No se ha reservado nada.`,
    );
  }
  const { trabajo, nueva } = await producirEscenaCantada(actor, escena, proyecto, {
    derechos: confirmacion.derechos,
    sinTerceros: confirmacion.sinTerceros,
    creditosConfirmados: confirmacion.creditosConfirmados,
    selloEstimacion: confirmacion.selloEstimacion,
    claveIdempotencia: confirmacion.claveIdempotencia,
    avisoUmbralAceptado: confirmacion.avisoUmbralAceptado,
    avisosConfirmados: confirmacion.avisosConfirmados,
    reintentoDeEscena,
  });
  // El proyecto pasa a estar en producción, igual que con cualquier otra escena que se encola.
  await marcarEnProduccion(proyecto.id);
  return Response.json({
    // `nueva` en falso significa que esta confirmación ya se había encolado: no se ha cobrado dos veces.
    nueva,
    trabajoId: trabajo.id,
    canto: await vistaDelCanto(actor, escena, proyecto),
    produccion: await estadoDeProduccion(actor, proyecto.id),
  });
});
