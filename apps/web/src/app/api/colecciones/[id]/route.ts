import { borrarColeccion, renombrarColeccion } from "@/server/media/colecciones";
import { ErrorMedio } from "@/server/media/errores";
import { type ContextoId, leerId, manejador } from "@/server/media/http";

export const dynamic = "force-dynamic";

/** Renombra una colección propia: `{ nombre }`. */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const cuerpo = (await peticion.json().catch(() => null)) as { nombre?: unknown } | null;
  if (!cuerpo) throw new ErrorMedio(400, "Cuerpo JSON no válido.");
  await renombrarColeccion(actor, await leerId(contexto), cuerpo.nombre);
  return new Response(null, { status: 204 });
});

/** Borra una colección propia; los archivos siguen en la biblioteca. */
export const DELETE = manejador(async (_: Request, contexto: ContextoId, actor) => {
  await borrarColeccion(actor, await leerId(contexto));
  return new Response(null, { status: 204 });
});
