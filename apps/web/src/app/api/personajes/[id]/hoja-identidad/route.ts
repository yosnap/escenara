import { generarHojaDeIdentidad } from "@/server/personajes/hoja-identidad";
import { type ContextoId, leerCuerpo, leerId, manejador } from "@/server/personajes/http";

export const dynamic = "force-dynamic";

/**
 * Encarga la **hoja de identidad 3×3** del personaje: una imagen con nueve retratos suyos.
 *
 * **Cuesta lo que un fotograma** y pasa por el mismo camino de dinero que cualquier otra generación
 * (estimación, confirmación de créditos, sello del precio, motor de controles, reserva e idempotencia): lo
 * hace `crearFotograma`, aquí no hay ningún atajo.
 *
 * La hoja nace **candidata** y no se usa por defecto: primero se compara con las vistas sueltas.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  const resultado = await generarHojaDeIdentidad(actor, id, {
    creditosConfirmados: Number(cuerpo.creditosConfirmados),
    derechos: cuerpo.derechos === true,
    claveIdempotencia: String(cuerpo.claveIdempotencia ?? ""),
    ...(typeof cuerpo.selloEstimacion === "string" ? { selloEstimacion: cuerpo.selloEstimacion } : {}),
    ...(typeof cuerpo.modelo === "string" ? { modelo: cuerpo.modelo } : {}),
    ...(cuerpo.avisoUmbralAceptado === true ? { avisoUmbralAceptado: true } : {}),
    ...(Array.isArray(cuerpo.avisosConfirmados) ? { avisosConfirmados: cuerpo.avisosConfirmados.map(String) } : {}),
  });
  return Response.json(resultado, { status: 201 });
});
