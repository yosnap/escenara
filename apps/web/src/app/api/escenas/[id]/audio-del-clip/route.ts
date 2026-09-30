import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/asistente/http";
import { cambiarAudioDelClip } from "@/server/montaje/audio-del-clip";

export const dynamic = "force-dynamic";

/**
 * Quita o devuelve el audio propio del clip de una escena: `{ quitado: boolean }`. No cuesta nada y no toca el
 * archivo; cambia lo que se oye en el montaje y en el MP4. Devuelve los clips del proyecto ya actualizados.
 */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "audio-del-clip");
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(await cambiarAudioDelClip(actor, await leerId(contexto), cuerpo.quitado));
});
