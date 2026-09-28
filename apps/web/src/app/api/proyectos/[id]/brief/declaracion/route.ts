import { registrarDeclaracion } from "@/server/anuncio/declaracion";
import { type ContextoId, exigirRitmoDeEscritura, leerCuerpo, leerId, manejador } from "@/server/anuncio/http";
import { puedePedirGuion } from "@/server/anuncio/puerta-guion";

export const dynamic = "force-dynamic";

/**
 * Registra la **declaración de veracidad** del ángulo elegido: `{ angulo, aceptado: true }`.
 *
 * `aceptado` tiene que ser expresamente `true`: una declaración no se deduce de que la petición llegara. Se guarda
 * el texto aceptado entero, con su fecha, su IP y la cuenta, como el consentimiento de un personaje.
 *
 * No se comprueba aquí si el ajuste del brief está encendido: esto es una **prueba** de lo que alguien afirmó, y
 * si tiene un brief con un ángulo que la exige, tiene que poder aceptarla.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  await exigirRitmoDeEscritura(actor);
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  const fila = await registrarDeclaracion(actor, id, cuerpo.angulo, cuerpo.aceptado, peticion);
  return Response.json(
    {
      declaracion: {
        angulo: fila.anglePresetKey,
        textoAceptado: fila.acceptedText,
        aceptado: fila.acceptedAt.toISOString(),
      },
      puerta: await puedePedirGuion(fila.projectId),
    },
    { status: 201 },
  );
});
