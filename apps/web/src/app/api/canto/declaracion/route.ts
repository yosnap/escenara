import { registrarDeclaracion, vistaDeDeclaracion } from "@/server/canto/declaracion";
import { exigirRitmoDeEscritura, leerCuerpo, manejador } from "@/server/canto/http";

export const dynamic = "force-dynamic";

/**
 * Registra la **declaración de derechos de un audio**: `{ medioId, tipo, referenciaLicencia?, aceptado: true }`.
 *
 * Va por **audio** y no por escena porque la afirmación es sobre el archivo: el mismo audio usado en seis escenas
 * se declara una vez, y un audio distinto pide otra (decisión del propietario, 2026-09-28).
 *
 * `aceptado` tiene que ser expresamente `true`: una declaración no se deduce de que la petición llegara. Se guarda
 * el **texto entero** que se aceptó, con su fecha, su IP y la cuenta, igual que el consentimiento de un personaje.
 * Con `tipo: "licenciada"` la referencia de la licencia es obligatoria.
 *
 * Declarar dos veces el mismo audio **sustituye** la declaración anterior: el usuario puede corregir el tipo o la
 * referencia, y lo que queda es la afirmación vigente con su fecha nueva.
 *
 * **No se comprueba si el ajuste del canto está encendido**: esto es una prueba de lo que alguien ha afirmado sobre
 * un archivo suyo, y tiene que poder registrarla y consultarla aunque la función se apague después.
 */
export const POST = manejador(async (peticion: Request, _contexto: unknown, actor) => {
  await exigirRitmoDeEscritura(actor);
  const cuerpo = await leerCuerpo(peticion);
  const fila = await registrarDeclaracion(
    actor,
    {
      medioId: cuerpo.medioId,
      tipo: cuerpo.tipo,
      referenciaLicencia: cuerpo.referenciaLicencia,
      aceptado: cuerpo.aceptado,
    },
    peticion,
  );
  return Response.json({ declaracion: vistaDeDeclaracion(fila) }, { status: 201 });
});
