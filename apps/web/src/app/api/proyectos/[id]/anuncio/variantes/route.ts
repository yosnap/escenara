import { type ContextoId, leerCuerpo, leerId, manejador } from "@/server/anuncio/http";
import { crearVariantes, estimarVariantes, hermanosDelGrupo, MAXIMO_VARIANTES } from "@/server/anuncio/variantes";

export const dynamic = "force-dynamic";

/**
 * **Variantes por ángulo** (0.27.0): proyectos hermanos del mismo producto y la misma oferta, un ángulo cada uno.
 *
 * `GET` es la lectura de antes de gastar: qué ángulos se pueden elegir, cuáles ya tiene el grupo, lo que cuesta
 * **una** variante y los hermanos que ya existen. Con eso la pantalla enseña el total de lo que se va a confirmar.
 *
 * `POST` crea las variantes elegidas con **una sola confirmación agregada**: `{ angulos: [clave, …],
 * claveIdempotencia, creditosConfirmados, selloEstimacion, declaraVeracidad? }`. Lo que se crea son proyectos con
 * su brief y su guion en borrador: **no se genera ningún clip**.
 */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const [estimacion, hermanos] = await Promise.all([estimarVariantes(actor, id), hermanosDelGrupo(actor, id)]);
  return Response.json({
    ...estimacion,
    maximo: MAXIMO_VARIANTES,
    hermanos: hermanos.map((h) => ({ id: h.id, titulo: h.title, angulo: h.anglePresetKey })),
  });
});

export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  const creadas = await crearVariantes(
    actor,
    id,
    {
      angulos: cuerpo.angulos,
      claveIdempotencia: cuerpo.claveIdempotencia,
      creditosConfirmados: cuerpo.creditosConfirmados,
      selloEstimacion: cuerpo.selloEstimacion,
      declaraVeracidad: cuerpo.declaraVeracidad,
    },
    // La petición se pasa entera porque la declaración de veracidad guarda la IP desde la que se aceptó, igual
    // que el consentimiento: lo que hay que poder demostrar es quién lo afirmó y desde dónde.
    peticion,
  );
  return Response.json(creadas, { status: 201 });
});
