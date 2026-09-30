import { listarLugares } from "@/server/lugares/consulta";
import { exigirRitmoDeEscritura, leerCuerpo, manejador } from "@/server/lugares/http";
import { crearLugar } from "@/server/lugares/servicio";

export const dynamic = "force-dynamic";

/** Lugares propios. Solo salen los suyos: el listado filtra por la sesión, no por lo que pida el navegador. */
export const GET = manejador(async (_: Request, __: unknown, actor) => Response.json(await listarLugares(actor)));

/** Crea un lugar: `{ nombre, descripcion?, estilo? }`. Sin `estilo` es un lugar real; nace sin fotos. */
export const POST = manejador(async (peticion: Request, _: unknown, actor) => {
  await exigirRitmoDeEscritura(actor);
  const cuerpo = await leerCuerpo(peticion);
  const lugar = await crearLugar(actor, {
    nombre: cuerpo.nombre,
    descripcion: cuerpo.descripcion,
    estilo: cuerpo.estilo,
  });
  return Response.json(lugar, { status: 201 });
});
