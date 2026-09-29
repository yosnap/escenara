import { elegirAudioDeCanto, quitarAudioDeCanto } from "@/server/canto/audio";
import { cantoDeLaEscena, vistaDelCanto } from "@/server/canto/consulta";
import { type ContextoId, exigirRitmoDeEscritura, leerCuerpo, leerId, manejador } from "@/server/canto/http";

export const dynamic = "force-dynamic";

/**
 * Estado del canto de una escena propia: el audio elegido con su duración medida, su declaración de derechos, el
 * retrato de partida con su proporción, lo que costaría el clip y **todo lo que impide pedirlo**.
 *
 * Los impedimentos salen del mismo motor de reglas que cierra la puerta al generar, así que lo que esta respuesta
 * dice que falta es exactamente lo que el botón de pagar va a exigir. Una escena ajena responde 404.
 */
export const GET = manejador(async (_peticion: Request, contexto: ContextoId, actor) => {
  return Response.json({ canto: await cantoDeLaEscena(actor, await leerId(contexto)) });
});

/**
 * Elige el audio con el que canta la escena: `{ medioId }`.
 *
 * No cuesta nada. Lo que sí hace es comprobar antes de guardar que el audio es suyo (uno ajeno responde 404), que
 * es audio de un formato admitido y que **cabe en el tope de duración**: enterarse de que la canción no cabe justo
 * antes de pagar es enterarse tarde.
 */
export const PUT = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  await exigirRitmoDeEscritura(actor);
  const cuerpo = await leerCuerpo(peticion);
  const { escena, proyecto } = await elegirAudioDeCanto(actor, await leerId(contexto), cuerpo.medioId);
  return Response.json({ canto: await vistaDelCanto(actor, escena, proyecto) });
});

/**
 * Quita el audio de la escena. **No borra el archivo** de la biblioteca ni su declaración de derechos: son del
 * usuario y puede usarlos en otra escena.
 */
export const DELETE = manejador(async (_peticion: Request, contexto: ContextoId, actor) => {
  await exigirRitmoDeEscritura(actor);
  const { escena, proyecto } = await quitarAudioDeCanto(actor, await leerId(contexto));
  return Response.json({ canto: await vistaDelCanto(actor, escena, proyecto) });
});
