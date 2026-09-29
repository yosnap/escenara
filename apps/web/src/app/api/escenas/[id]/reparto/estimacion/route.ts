import { type ContextoId, leerId, manejador } from "@/server/asistente/http";
import { estimacionDeRepartoPropia } from "@/server/omni/estimacion-reparto";

export const dynamic = "force-dynamic";

/**
 * **Lo que costaría producir esta escena con su reparto**, sin gastar nada (0.28.0).
 *
 * Es una lectura: ni se llama al proveedor de generación ni se aparta un crédito. Devuelve un clip por cada clip
 * que de verdad se va a pedir —uno en dualcast, dos en podcast—, el total que hay que confirmar, el sello del
 * precio con el que se ha estimado, los avisos confirmables (el diálogo que no cabe en la duración, el diálogo sin
 * repartir) y los impedimentos (a quién le falta el registro en el proveedor).
 *
 * Una escena ajena responde 404, sin decir que existe.
 */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) =>
  Response.json(await estimacionDeRepartoPropia(actor, await leerId(contexto))),
);
