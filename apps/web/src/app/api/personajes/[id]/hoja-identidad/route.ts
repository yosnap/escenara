import { cambiarEstadoDeHoja, generarHojaDeIdentidad } from "@/server/personajes/hoja-identidad";
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
    sinTerceros: cuerpo.sinTerceros === true,
    claveIdempotencia: String(cuerpo.claveIdempotencia ?? ""),
    ...(typeof cuerpo.selloEstimacion === "string" ? { selloEstimacion: cuerpo.selloEstimacion } : {}),
    ...(typeof cuerpo.modelo === "string" ? { modelo: cuerpo.modelo } : {}),
    ...(cuerpo.avisoUmbralAceptado === true ? { avisoUmbralAceptado: true } : {}),
    ...(Array.isArray(cuerpo.avisosConfirmados) ? { avisosConfirmados: cuerpo.avisosConfirmados.map(String) } : {}),
  });
  return Response.json(resultado, { status: 201 });
});

/**
 * Cambia el estado de la hoja: **descartarla** o hacerla la **referencia por defecto** del personaje.
 *
 * No cuesta nada: la hoja ya está generada y pagada. Lo que cambia es con qué se generará a partir de ahora,
 * y por eso lo decide su dueño y no un panel de métricas.
 */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(await cambiarEstadoDeHoja(actor, id, cuerpo.estado));
});
