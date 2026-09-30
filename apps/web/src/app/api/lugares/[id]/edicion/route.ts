import { exigirMismoOrigen, leerAvisosConfirmados, leerCuerpo, manejador } from "@/server/generacion/http";
import { type ConfirmacionEdicion, candidatoAnimado, retirarPersonas } from "@/server/lugares/edicion";

export const dynamic = "force-dynamic";

type ContextoId = { params: Promise<{ id: string }> };

/**
 * Encarga una foto generada para un lugar, **con su coste confirmado**: `tipo: "retirar-personas"` (edición de una
 * de sus fotos, con `referenciaId`) o `tipo: "candidato"` (un maestro para un lugar animado). Pasa por el mismo
 * camino de dinero que cualquier fotograma; el resultado entra en el lugar al terminar, como foto generada.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  const { id } = await contexto.params;
  const cuerpo = await leerCuerpo(peticion);
  const confirmacion: ConfirmacionEdicion = {
    creditosConfirmados: cuerpo.creditosConfirmados as number,
    derechos: cuerpo.derechos === true,
    claveIdempotencia: cuerpo.claveIdempotencia as string,
    ...(typeof cuerpo.selloEstimacion === "string" ? { selloEstimacion: cuerpo.selloEstimacion } : {}),
    ...(typeof cuerpo.modelo === "string" ? { modelo: cuerpo.modelo } : {}),
    avisoUmbralAceptado: cuerpo.avisoUmbralAceptado === true,
    avisosConfirmados: leerAvisosConfirmados(cuerpo.avisosConfirmados),
  };
  const trabajo =
    cuerpo.tipo === "candidato"
      ? await candidatoAnimado(actor, id, confirmacion)
      : await retirarPersonas(actor, id, cuerpo.referenciaId, confirmacion);
  return Response.json(trabajo, { status: 201 });
});
