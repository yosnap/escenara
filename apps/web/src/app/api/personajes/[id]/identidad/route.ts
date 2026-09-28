import { esCorreccion } from "@/lib/coherencia";
import { comprobarIdentidad } from "@/server/coherencia/identidad";
import { corregirDecision } from "@/server/coherencia/registro";
import { filaPropia, vistaDePersonaje } from "@/server/personajes/consulta";
import { ErrorPersonaje } from "@/server/personajes/errores";
import { type ContextoId, exigirRitmoDeAnalisis, leerCuerpo, leerId, manejador } from "@/server/personajes/http";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Comprobación de **identidad** de una vista generada (0.24.0): si es la misma persona que la cara de referencia
 * del personaje.
 *
 * Dos acciones, las dos del dueño del personaje (uno ajeno responde 404, como siempre):
 *
 * - sin `decisionId`: comprueba la referencia indicada. Percibe las dos caras con el mapa del usuario (por cuota
 *   del plan, 0 créditos) y decide con Jev. En un personaje **real** hace falta que su consentimiento declare que
 *   su cara puede ir al servicio de coherencia; sin esa declaración no se envía nada y se dice qué falta;
 * - con `decisionId` y `correccion`: la persona dice si ese veredicto tiene razón o se equivoca.
 *
 * Devuelve la ficha completa, así que la pantalla nunca enseña una cobertura que ya no sea la vigente.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  const personaje = await filaPropia(actor, id);

  if (cuerpo.decisionId !== undefined) {
    if (typeof cuerpo.decisionId !== "string" || !UUID.test(cuerpo.decisionId)) {
      throw new ErrorPersonaje(400, "Esa comprobación de identidad no existe.");
    }
    if (!esCorreccion(cuerpo.correccion)) {
      throw new ErrorPersonaje(400, "Di si la comprobación tiene razón o se equivoca.");
    }
    if (!(await corregirDecision(actor.id, cuerpo.decisionId, cuerpo.correccion))) {
      throw new ErrorPersonaje(404, "Esa comprobación de identidad no existe.");
    }
    return Response.json({
      personaje: await vistaDePersonaje(personaje, actor, { completa: true, conReferencias: true }),
    });
  }

  const referenciaId = cuerpo.referenciaId;
  if (typeof referenciaId !== "string" || !UUID.test(referenciaId)) {
    throw new ErrorPersonaje(400, "Esa foto no está en el personaje.");
  }
  // Comprobar lee dos imágenes y llama a dos servicios: es lo bastante caro en CPU como para acotar su ritmo.
  await exigirRitmoDeAnalisis(actor);
  const resultado = await comprobarIdentidad(personaje, referenciaId);
  return Response.json({
    comprobada: resultado.comprobada,
    motivo: resultado.comprobada ? "" : resultado.motivo,
    veredicto: resultado.comprobada ? resultado.veredicto : null,
    evidencia: resultado.comprobada ? resultado.decision.evidencia : "",
    confianza: resultado.comprobada ? resultado.decision.confianza : 0,
    decisionId: resultado.comprobada ? resultado.decision.decisionId : "",
    personaje: await vistaDePersonaje(personaje, actor, { completa: true, conReferencias: true }),
  });
});
