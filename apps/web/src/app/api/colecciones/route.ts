import { crearColeccion, listarColecciones } from "@/server/media/colecciones";
import { ErrorMedio } from "@/server/media/errores";
import { leerPropietario, manejador } from "@/server/media/http";

export const dynamic = "force-dynamic";

/** Colecciones propias; el admin puede ver las de otro usuario con `?propietario=<id>` (solo lectura). */
export const GET = manejador(async (peticion: Request, _: unknown, actor) => {
  const propietario = leerPropietario(new URL(peticion.url).searchParams.get("propietario"));
  return Response.json(await listarColecciones(actor, propietario));
});

/** Crea una colección propia: `{ nombre }`. */
export const POST = manejador(async (peticion: Request, _: unknown, actor) => {
  const cuerpo = (await peticion.json().catch(() => null)) as { nombre?: unknown } | null;
  if (!cuerpo) throw new ErrorMedio(400, "Cuerpo JSON no válido.");
  return Response.json(await crearColeccion(actor, cuerpo.nombre), { status: 201 });
});
