import { esVozOfrecida } from "@/lib/voz";
import { ErrorProyecto } from "@/server/asistente/errores";
import { exigirMismoOrigen, exigirRitmoDeEscritura, leerCuerpo, manejador } from "@/server/asistente/http";
import { leerConfirmacionVoz, leerParametrosVoz } from "@/server/voz/entrada";
import { pedirMuestra } from "@/server/voz/muestra";

export const dynamic = "force-dynamic";

/**
 * Muestra de una voz (RF08, 0.21.0). **Cuesta créditos la primera vez y ninguna las siguientes**: si el usuario ya
 * ha oído esa voz con esos parámetros, se le devuelve la que ya pagó y no se llama a nadie.
 *
 * No es una ruta de proyecto: una muestra no pertenece a ninguno, se paga con la clave del usuario y su audio queda
 * en su biblioteca.
 */
export const POST = manejador(async (peticion: Request, _contexto: unknown, actor) => {
  exigirMismoOrigen(peticion);
  const cuerpo = await leerCuerpo(peticion);
  if (!esVozOfrecida(cuerpo.voz))
    throw new ErrorProyecto(400, "Esa voz no está entre las que ofrece esta instalación.");
  await exigirRitmoDeEscritura(actor, "voz:muestra");
  const { trabajo, medio } = await pedirMuestra(
    actor,
    cuerpo.voz,
    leerParametrosVoz(cuerpo.parametros),
    leerConfirmacionVoz(cuerpo),
  );
  // `medio` viene relleno cuando la muestra ya estaba pagada; `trabajoId`, cuando hay que esperar a que termine.
  return Response.json({ medio, trabajoId: trabajo?.id ?? null });
});
