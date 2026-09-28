import { esCorreccion } from "@/lib/coherencia";
import { ErrorAnuncio } from "@/server/anuncio/errores";
import { type ContextoId, leerCuerpo, leerId, manejador } from "@/server/anuncio/http";
import { proyectoPropio } from "@/server/asistente/consulta";
import { anguloFielGuardadoDe } from "@/server/coherencia/anuncio";
import { corregirDecision } from "@/server/coherencia/registro";

export const dynamic = "force-dynamic";

/**
 * **Corrección humana del veredicto `angulo_fiel`** (0.27.0): «tiene razón» o «se equivoca».
 *
 * Es la **única etiqueta de referencia** que hay para saber si la comprobación acierta, y por tanto lo que decide
 * si algún día pasa de sombra a decidir de verdad. Mismo trato que las demás correcciones (0.24.0): solo la pone
 * el dueño del proyecto, y `corregirDecision` filtra por él, así que la decisión de otra cuenta responde 404 sin
 * decir que existe.
 *
 * No cuesta nada y no llama a Jev: es una etiqueta sobre un veredicto que ya estaba escrito.
 */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  // Se comprueba el proyecto antes que la decisión: uno ajeno responde 404 aunque el cuerpo esté mal formado.
  const proyecto = await proyectoPropio(actor, id);
  const cuerpo = await leerCuerpo(peticion);
  if (typeof cuerpo.decisionId !== "string" || cuerpo.decisionId.trim() === "") {
    throw new ErrorAnuncio(400, "Falta cuál es el veredicto que estás corrigiendo.");
  }
  if (!esCorreccion(cuerpo.correccion)) {
    throw new ErrorAnuncio(400, "Di si el veredicto tiene razón o se equivoca.");
  }
  // Solo el veredicto de **este** proyecto: uno propio de otro proyecto no se etiqueta desde aquí.
  const actual = await anguloFielGuardadoDe(actor, proyecto.id);
  if (actual?.id !== cuerpo.decisionId || !(await corregirDecision(actor.id, cuerpo.decisionId, cuerpo.correccion))) {
    throw new ErrorAnuncio(404, "Ese veredicto del ángulo ya no existe: vuelve a comprobarlo y dilo otra vez.");
  }
  return Response.json({ decision: await anguloFielGuardadoDe(actor, proyecto.id), motivo: "" });
});
