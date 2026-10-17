import { exigirMismoOrigen, leerConfirmacionEncargo, leerCuerpo, manejador } from "@/server/generacion/http";
import { generarVistaDeProducto } from "@/server/productos/generacion";

export const dynamic = "force-dynamic";

type ContextoId = { params: Promise<{ id: string }> };

/**
 * Encarga una **vista generada** del producto (`papel`: frontal, envase, detalle o el producto solo) desde la
 * descripción de su ficha, **con su coste confirmado**. Pasa por el mismo camino de dinero que cualquier fotograma;
 * el resultado entra en el producto al terminar, con ese papel y marcado como generado.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  const { id } = await contexto.params;
  const cuerpo = await leerCuerpo(peticion);
  const trabajo = await generarVistaDeProducto(actor, id, cuerpo.papel, leerConfirmacionEncargo(cuerpo));
  return Response.json(trabajo, { status: 201 });
});
