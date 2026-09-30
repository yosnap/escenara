import type { Medio } from "./media/tipos";
import type { ModoVoz } from "./voz";

/**
 * **El audio de un clip ya producido** (lógica pura): si se oye su voz propia en el montaje y cómo ponerle voz en
 * off. Es una opción **por escena** e independiente del modo de voz del proyecto, que sigue siendo uno para todo
 * el proyecto:
 *
 * - quitar el audio del clip lo deja mudo en el montaje y en el MP4 (el archivo no se toca);
 * - la voz en off es la **pista de voz aparte** de siempre (modo `pista`), que se genera en «Voz y subtítulos»
 *   con su coste confirmado.
 *
 * Con varias escenas, la regla es la misma en cada una: la que tiene el audio quitado entra en silencio y las
 * demás suenan como suenen según el modo del proyecto.
 */

/** Un clip ya producido de una escena, tal como lo pinta el paso de escenas del proyecto. */
export interface ClipProducidoVista {
  escenaId: string;
  orden: number;
  medio: Medio;
  /** `true` si al clip se le pidió que dijera algo: trae voz propia dentro. */
  hablaEnElClip: boolean;
  /** `true` si su audio propio está quitado en el montaje y en la exportación. */
  audioQuitado: boolean;
  /** `true` si la escena ya tiene su pista de voz aparte generada. */
  conPistaDeVoz: boolean;
  /** `true` si la escena tiene diálogo escrito: sin él no hay nada que leer en la voz en off. */
  conDialogo: boolean;
}

/** Los clips producidos de un proyecto y el modo de voz con el que se van a oír. */
export interface ClipsDelProyecto {
  modoVoz: ModoVoz;
  clips: ClipProducidoVista[];
}

/**
 * Qué se va a oír de esta escena en el montaje, en una frase. Es lo que evita que alguien exporte con dos voces
 * diciendo lo mismo sin saberlo, o con una escena muda creyendo que tenía voz.
 */
export function comoSuenaLaEscena(clip: ClipProducidoVista, modo: ModoVoz): string {
  const pista = modo === "pista";
  if (clip.audioQuitado) {
    if (pista && clip.conPistaDeVoz)
      return "Se oirá solo su pista de voz aparte: el audio propio del clip está quitado.";
    return pista
      ? "Ahora mismo no se oirá ninguna voz: el audio del clip está quitado y la pista de voz de esta escena aún no está generada."
      : "Se oirá sin voz (solo la música del proyecto, si tiene): el audio propio del clip está quitado.";
  }
  if (pista && clip.hablaEnElClip && clip.conPistaDeVoz) {
    return "Cuidado: se oirán dos voces diciendo lo mismo, la del clip y la pista aparte. Quita el audio del clip.";
  }
  if (pista && clip.conPistaDeVoz) return "Se oirá su pista de voz aparte sobre el sonido ambiente del clip.";
  return clip.hablaEnElClip
    ? "Se oirá la voz que trae el propio clip."
    : "Se oirá el sonido que trae el clip, que no lleva diálogo.";
}

/**
 * Cómo ponerle voz en off a esta escena, o `null` si ya la tiene. La voz en off es la pista aparte del proyecto: no
 * hay otra, y se genera con su coste confirmado.
 */
export function comoPonerVozEnOff(clip: ClipProducidoVista, modo: ModoVoz): string | null {
  if (modo === "pista" && clip.conPistaDeVoz) return null;
  if (modo === "omni") {
    return "Este proyecto está en modo Omni, que genera la voz dentro del clip. Para una voz en off, cambia el modo a «Pista de voz aparte» en Voz y subtítulos.";
  }
  const pasos: string[] = [];
  if (!clip.conDialogo) pasos.push("escribe en la escena lo que se dice");
  if (modo !== "pista") pasos.push("elige «Pista de voz aparte» y una voz en Voz y subtítulos");
  pasos.push("genera la voz de esta escena confirmando su coste");
  const frase = pasos.join(", luego ");
  return `Para ponerle voz en off: ${frase}.${clip.hablaEnElClip ? " Quita también el audio del clip para que no se oigan dos voces." : ""}`;
}
