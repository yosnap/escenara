import { exigirRitmoDeEscritura, leerCuerpo, manejador } from "@/server/comunidad/http";
import { crearReto } from "@/server/comunidad/retos";

export const dynamic = "force-dynamic";

/** Crea un reto (solo quien administra): `{ titulo, descripcion?, desde, hasta, plantilla? }`. */
export const POST = manejador(async (peticion: Request, _: unknown, actor) => {
  await exigirRitmoDeEscritura(actor);
  const c = await leerCuerpo(peticion);
  const reto = await crearReto(actor, {
    titulo: c.titulo,
    descripcion: c.descripcion,
    desde: c.desde,
    hasta: c.hasta,
    plantilla: c.plantilla,
  });
  return Response.json(reto, { status: 201 });
});
