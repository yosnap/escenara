import { listarAngulos } from "@/server/anuncio/catalogo";
import { exigirRitmoDeEscritura, leerCuerpo, manejador } from "@/server/anuncio/http";
import { crearOferta, listarOfertas } from "@/server/anuncio/ofertas";

export const dynamic = "force-dynamic";

/**
 * Ofertas propias (0.27.0). Solo salen las suyas: el listado filtra por el identificador de la sesión, no por lo
 * que pida el navegador.
 *
 * - `?productoId=…` devuelve solo las de ese producto suyo; uno ajeno responde 404, no una lista vacía;
 * - `?angulos=1` devuelve el catálogo de ángulos elegibles, que es lo que la pantalla del brief necesita junto a
 *   las ofertas y no merece una ruta aparte.
 */
export const GET = manejador(async (peticion: Request, _: unknown, actor) => {
  const parametros = new URL(peticion.url).searchParams;
  if (parametros.get("angulos") === "1") return Response.json(await listarAngulos());
  return Response.json(await listarOfertas(actor, parametros.get("productoId") ?? undefined));
});

/**
 * Crea una oferta atada a un producto propio:
 * `{ productoId, queSeDa, precio?, garantia?, urgencia?, bonus? }`.
 *
 * Solo `queSeDa` es obligatorio. Los demás, vacíos, se guardan como nulos y **no aparecen** en el guion.
 */
export const POST = manejador(async (peticion: Request, _: unknown, actor) => {
  await exigirRitmoDeEscritura(actor);
  const cuerpo = await leerCuerpo(peticion);
  const oferta = await crearOferta(actor, {
    productoId: cuerpo.productoId,
    queSeDa: cuerpo.queSeDa,
    precio: cuerpo.precio,
    garantia: cuerpo.garantia,
    urgencia: cuerpo.urgencia,
    bonus: cuerpo.bonus,
  });
  return Response.json(oferta, { status: 201 });
});
