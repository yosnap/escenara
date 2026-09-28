import { type ContextoId, leerId, manejador } from "@/server/anuncio/http";
import { anguloFielGuardadoDe, comprobarAnguloDelAnuncio } from "@/server/coherencia/anuncio";

export const dynamic = "force-dynamic";

/**
 * **`angulo_fiel`** (0.27.0): si el guion del anuncio responde al ángulo elegido, no mezcla otros y dice la oferta
 * como se definió.
 *
 * `GET` devuelve el último veredicto guardado, sin comprobar nada nuevo. `POST` lo comprueba, que es lo que
 * consume el tope diario de Jev de la instalación.
 *
 * **En sombra no bloquea nada**: ni la aprobación del plan, ni la producción, ni pedir otro guion. Se registra con
 * su evidencia y la pantalla lo enseña con la etiqueta de que no decide.
 */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) => {
  return Response.json({ decision: await anguloFielGuardadoDe(actor, await leerId(contexto)) });
});

export const POST = manejador(async (_: Request, contexto: ContextoId, actor) => {
  return Response.json(await comprobarAnguloDelAnuncio(actor, await leerId(contexto)));
});
