import { anadirAColeccion, quitarDeColeccion } from "@/server/media/colecciones";
import { ErrorMedio } from "@/server/media/errores";
import { type ContextoId, leerId, manejador } from "@/server/media/http";

export const dynamic = "force-dynamic";

async function ids(peticion: Request): Promise<unknown> {
  const cuerpo = (await peticion.json().catch(() => null)) as { ids?: unknown } | null;
  if (!cuerpo) throw new ErrorMedio(400, "Cuerpo JSON no válido.");
  return cuerpo.ids;
}

/** Añade archivos propios: `{ ids: [...] }`. */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const anadidos = await anadirAColeccion(actor, await leerId(contexto), await ids(peticion));
  return Response.json({ anadidos });
});

/** Quita archivos de la colección (no los borra): `{ ids: [...] }`. */
export const DELETE = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  await quitarDeColeccion(actor, await leerId(contexto), await ids(peticion));
  return new Response(null, { status: 204 });
});
