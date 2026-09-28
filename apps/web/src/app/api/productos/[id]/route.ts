import { borrarProducto, resumenBorrado } from "@/server/productos/borrado";
import { obtenerProducto } from "@/server/productos/consulta";
import { type ContextoId, exigirRitmoDeEscritura, leerCuerpo, leerId, manejador } from "@/server/productos/http";
import {
  actualizarProducto,
  anadirFotos,
  cambiarPapel,
  leerFotosPedidas,
  quitarFoto,
} from "@/server/productos/servicio";

export const dynamic = "force-dynamic";

/** Ficha completa con sus fotos. Uno ajeno responde 404, sin decir que existe. */
export const GET = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  // `?borrado=1` devuelve solo qué se borraría, para poder enumerarlo en el diálogo de confirmación.
  if (new URL(peticion.url).searchParams.get("borrado") === "1") {
    return Response.json(await resumenBorrado(actor, id));
  }
  return Response.json(await obtenerProducto(actor, id));
});

/**
 * Cambia el producto o sus fotos. Una sola ruta con `accion` porque las tres son la misma cosa —editar el
 * producto— y separarlas en tres rutas solo multiplicaría el envoltorio:
 *
 * - sin `accion`: cambia nombre, descripción, tipo o la declaración de marca;
 * - `anadir-fotos`: añade fotos de la biblioteca con su papel;
 * - `papel`: cambia el papel de una foto ya añadida;
 * - `quitar-foto`: quita la relación (la foto sigue en la biblioteca).
 */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  await exigirRitmoDeEscritura(actor);
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  switch (cuerpo.accion) {
    case "anadir-fotos":
      return Response.json(await anadirFotos(actor, id, leerFotosPedidas(cuerpo.fotos)));
    case "papel":
      return Response.json(await cambiarPapel(actor, id, cuerpo.referenciaId, cuerpo.papel));
    case "quitar-foto":
      return Response.json(await quitarFoto(actor, id, cuerpo.referenciaId));
    default:
      return Response.json(
        await actualizarProducto(actor, id, {
          nombre: cuerpo.nombre,
          descripcion: cuerpo.descripcion,
          tipo: cuerpo.tipo,
          marcaVisible: cuerpo.marcaVisible,
        }),
      );
  }
});

/** Borra el producto y sus derivados (medios generados con él), en el almacenamiento incluido. */
export const DELETE = manejador(async (_: Request, contexto: ContextoId, actor) =>
  Response.json(await borrarProducto(actor, await leerId(contexto))),
);
