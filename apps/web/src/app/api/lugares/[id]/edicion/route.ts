import { exigirMismoOrigen, leerConfirmacionEncargo, leerCuerpo, manejador } from "@/server/generacion/http";
import { candidatoDeLugar, retirarPersonas } from "@/server/lugares/edicion";

export const dynamic = "force-dynamic";

type ContextoId = { params: Promise<{ id: string }> };

/**
 * Encarga una foto generada para un lugar, **con su coste confirmado**: `tipo: "retirar-personas"` (edición de una
 * de sus fotos, con `referenciaId`) o `tipo: "candidato"` (una imagen del lugar desde su descripción, real o
 * animado). Pasa por el mismo camino de dinero que cualquier fotograma; el resultado entra en el lugar al terminar,
 * como foto generada.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  const { id } = await contexto.params;
  const cuerpo = await leerCuerpo(peticion);
  const confirmacion = leerConfirmacionEncargo(cuerpo);
  const trabajo =
    cuerpo.tipo === "candidato"
      ? await candidatoDeLugar(actor, id, confirmacion)
      : await retirarPersonas(actor, id, cuerpo.referenciaId, confirmacion);
  return Response.json(trabajo, { status: 201 });
});
