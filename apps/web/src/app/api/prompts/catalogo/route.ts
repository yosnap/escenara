import { esIdentificadorDeModelo } from "@/lib/catalogo";
import { esTipoTrabajo } from "@/lib/generacion";
import { catalogoParaCrear } from "@/server/prompts/catalogo-para-crear";
import { ErrorPreset } from "@/server/prompts/errores";
import { manejador } from "@/server/prompts/http";

export const dynamic = "force-dynamic";

/**
 * Presets y plantillas que este usuario puede usar, con **qué no admite el modelo elegido y por qué**
 * (`?tipo=fotograma|animacion&modelo=`). Se pide al cambiar de modelo, porque los formatos y las duraciones
 * que se pueden ofrecer son los del modelo.
 *
 * Es una lectura: no encola nada, no reserva presupuesto y no toca a ningún proveedor.
 */
export const GET = manejador(async (peticion: Request, _: unknown, actor) => {
  const parametros = new URL(peticion.url).searchParams;
  const tipo = parametros.get("tipo") ?? "fotograma";
  if (!esTipoTrabajo(tipo)) throw new ErrorPreset(400, "Tipo de trabajo no válido.");
  const modelo = parametros.get("modelo");
  // El identificador del modelo llega del navegador: se acota antes de buscarlo en el catálogo.
  if (modelo !== null && !esIdentificadorDeModelo(modelo)) throw new ErrorPreset(400, "Ese modelo no es válido.");
  return Response.json(await catalogoParaCrear(actor.id, tipo, modelo));
});
