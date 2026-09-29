import { esIdentificadorDeModelo } from "@/lib/catalogo";
import { esTipoTrabajo } from "@/lib/generacion";
import { ErrorGeneracion } from "@/server/generacion/errores";
import { estimar } from "@/server/generacion/estimacion";
import { exigirRitmoDeConsultas, manejador } from "@/server/generacion/http";
import { plantillaUsable } from "@/server/prompts/consulta";
import { exigirTrendVigente } from "@/server/prompts/trends";

export const dynamic = "force-dynamic";

/**
 * Coste estimado y saldo del usuario: `?tipo=fotograma|animacion` y, opcionalmente:
 *
 * - `&modelo=` para pedir la estimación de otro modelo del catálogo (sin él se usa el del mapa del usuario);
 * - `&sinImagen=1` cuando no hay ninguna imagen de partida: entonces el modelo es de **texto a imagen** y el
 *   precio es el suyo, no el del modelo de edición (0.23.4);
 * - `&segundos=` para la duración del clip: cada duración es una tarifa distinta, así que la que se estima
 *   tiene que ser la que se va a pedir.
 * - `&plantillaId=` cuando se estima un trend: exige vigencia y usa su duración objetivo. La confirmación
 *   posterior vuelve a comprobar la plantilla, el sello y los créditos antes de reservar.
 *
 * El saldo se cachea 30 s por usuario.
 */
export const GET = manejador(async (peticion: Request, _: unknown, actor) => {
  const parametros = new URL(peticion.url).searchParams;
  const tipo = parametros.get("tipo");
  if (!esTipoTrabajo(tipo)) throw new ErrorGeneracion(400, "Tipo de trabajo no válido.");
  const modelo = parametros.get("modelo");
  // El identificador del modelo llega del navegador: se acota antes de buscarlo en el catálogo.
  if (modelo !== null && !esIdentificadorDeModelo(modelo)) {
    throw new ErrorGeneracion(400, "Ese modelo no es válido.");
  }
  const sinReferencia = parametros.get("sinImagen") === "1";
  const pedidos = parametros.get("segundos");
  let segundos = pedidos === null ? undefined : Number(pedidos);
  const plantillaId = parametros.get("plantillaId");
  if (plantillaId) {
    const plantilla = await plantillaUsable(actor.id, plantillaId);
    await exigirTrendVigente(plantilla);
    if (tipo !== "animacion") throw new ErrorGeneracion(400, "Un trend solo puede generar un clip.");
    if (segundos !== undefined && segundos !== plantilla.targetSeconds)
      throw new ErrorGeneracion(
        409,
        `El trend «${plantilla.name}» requiere ${plantilla.targetSeconds} s. Revisa el coste para esa duración.`,
      );
    segundos = plantilla.targetSeconds ?? undefined;
  }
  if (segundos !== undefined && (!Number.isInteger(segundos) || segundos < 1 || segundos > 600)) {
    throw new ErrorGeneracion(400, "Esa duración no es válida.");
  }
  await exigirRitmoDeConsultas(actor, "estimacion");
  return Response.json(
    await estimar(actor.id, tipo, undefined, modelo, {
      sinReferencia,
      ...(segundos === undefined ? {} : { segundos }),
    }),
  );
});
