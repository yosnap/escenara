import { esIdentificadorDeModelo } from "@/lib/catalogo";
import { esTipoTrabajo } from "@/lib/generacion";
import { ErrorGeneracion } from "@/server/generacion/errores";
import { estimar } from "@/server/generacion/estimacion";
import { exigirRitmoDeConsultas, manejador } from "@/server/generacion/http";

export const dynamic = "force-dynamic";

/**
 * Coste estimado y saldo del usuario: `?tipo=fotograma|animacion` y, opcionalmente, `&modelo=` para pedir
 * la estimación de otro modelo del catálogo (solo `compatible` o `validado`; sin `modelo` se usa el
 * predeterminado de la capacidad). El saldo se cachea 30 s por usuario.
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
  await exigirRitmoDeConsultas(actor, "estimacion");
  return Response.json(await estimar(actor.id, tipo, undefined, modelo));
});
