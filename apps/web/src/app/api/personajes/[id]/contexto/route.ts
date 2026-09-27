import { esIdentificadorDeModelo } from "@/lib/catalogo";
import { contextoAplicado } from "@/server/personajes/contexto";
import { ErrorPersonaje } from "@/server/personajes/errores";
import { type ContextoId, leerId, manejador } from "@/server/personajes/http";

export const dynamic = "force-dynamic";

/**
 * Contexto que se le añadirá al prompt y referencias que se enviarán, para poder **verlo antes de confirmar**
 * (petición del propietario, 2026-09-27). `?modelo=` acota el número de referencias al tope de ese modelo;
 * sin él se usa el predeterminado de la capacidad.
 *
 * Es una lectura: no encola nada, no reserva presupuesto y no toca a ningún proveedor. Un personaje ajeno
 * responde 404.
 */
export const GET = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const modelo = new URL(peticion.url).searchParams.get("modelo");
  // El identificador del modelo llega del navegador: se acota antes de buscarlo en el catálogo.
  if (modelo !== null && !esIdentificadorDeModelo(modelo)) throw new ErrorPersonaje(400, "Ese modelo no es válido.");
  return Response.json(await contextoAplicado(actor, id, modelo));
});
