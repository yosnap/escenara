import { DIALOGO_MAXIMO } from "@/lib/generacion";
import type { ModoVoz } from "@/lib/voz";

/**
 * Qué le toca decir al clip según el modo de voz del proyecto (RF08, 0.21.0).
 *
 * Vive aparte de la producción porque es **la regla que separa los dos modos**, y separarla es lo que permite
 * comprobarla sin montar una producción entera.
 */

/**
 * Lo que el clip tiene que decir:
 *
 * - modo `clip`: el diálogo de la escena, que es lo que el modelo de vídeo pone en boca del personaje con los
 *   labios sincronizados. Es lo que hacía la 0.19.0 y sigue siendo el modo de fábrica;
 * - modo `pista`: **cadena vacía**, así que el prompt pide solo sonido ambiente. El diálogo lo dirá la pista de
 *   voz que se genera aparte, y si el clip también lo dijera se oirían dos voces distintas diciendo lo mismo,
 *   que es exactamente el problema que el modo de pista viene a resolver.
 */
export function dialogoDelClip(escena: { scriptText: string }, proyecto: { voiceMode: ModoVoz }): string {
  if (proyecto.voiceMode === "pista") return "";
  return escena.scriptText.trim().slice(0, DIALOGO_MAXIMO);
}
