import { listarProductos } from "@/server/productos/consulta";
import { exigirRitmoDeEscritura, leerCuerpo, manejador } from "@/server/productos/http";
import { crearProducto } from "@/server/productos/servicio";

export const dynamic = "force-dynamic";

/**
 * Productos propios. Solo salen los suyos: el listado filtra por el identificador de la sesión, no por lo que
 * pida el navegador.
 */
export const GET = manejador(async (_: Request, __: unknown, actor) => Response.json(await listarProductos(actor)));

/** Crea un producto: `{ nombre, descripcion?, tipo, marcaVisible? }`. Nace sin fotos. */
export const POST = manejador(async (peticion: Request, _: unknown, actor) => {
  await exigirRitmoDeEscritura(actor);
  const cuerpo = await leerCuerpo(peticion);
  const producto = await crearProducto(actor, {
    nombre: cuerpo.nombre,
    descripcion: cuerpo.descripcion,
    tipo: cuerpo.tipo,
    marcaVisible: cuerpo.marcaVisible,
  });
  return Response.json(producto, { status: 201 });
});
