/**
 * **El lugar en el prompt del fotograma**: el ancla C4 (Contexto). Con lugar, C4 deja de ser el preset de
 * localización y pasa a ser el sitio de la maestra, con su descripción congelada en la versión y el «dónde, dentro
 * del lugar» que eligió el usuario. C1, C2, C3, C5 y C6 no cambian, ni la regla de no embellecer a una persona real.
 *
 * Todo el texto es inglés de prompt (ADR-0022): lo compone el servidor y el usuario no lo ve nunca. Lo que el
 * usuario ve del lugar es su nombre, su descripción en castellano y el sitio que eligió.
 */

/** El lugar tal como entra en las 6C, ya traducido. */
export interface LugarEnPrompt {
  /** Descripción del lugar, en inglés. Puede ir vacía. */
  descripcion: string;
  /** Dónde, dentro del lugar, en inglés. Puede ir vacío. */
  sitio: string;
  /** `true` si la maestra viaja de verdad como referencia; `false` = el lugar va solo descrito. */
  conReferencia: boolean;
  /**
   * Plano del lugar solo: no sale nadie y la maestra es la **única** imagen (la de partida). Con `false`, la maestra
   * va la **última**, detrás de las fotos del personaje y del producto.
   */
  soloLugar: boolean;
}

const limpio = (texto: string): string => texto.trim().replace(/[.\s]+$/, "");

/** El bloque C4 con lugar. Sustituye al preset de localización; el texto libre de la escena se añade detrás. */
export function contextoDelLugar(lugar: LugarEnPrompt): string {
  const descripcion = limpio(lugar.descripcion);
  const sitio = limpio(lugar.sitio);
  const cual = lugar.soloLugar ? "the reference image" : "the last reference image";
  const ancla = lugar.conReferencia
    ? `The setting is the place shown in ${cual}: keep its architecture, walls and openings, materials, fixed furniture, layout and the direction of its light. It may be reframed from another angle, but it must not be redesigned or replaced by a different place`
    : "The setting is one specific place, described here; keep it consistent and do not turn it into a generic location";
  return [
    ancla,
    descripcion === "" ? "" : `The place: ${descripcion}`,
    sitio === "" ? "" : `Position within the place: ${sitio}`,
  ]
    .filter((parte) => parte !== "")
    .join(". ");
}

/**
 * Lo que se dice de la imagen del lugar cuando viaja junto a otras: que de ella solo se toma el sitio. Sin esto, la
 * regla de identidad («la persona es exactamente la de las imágenes de referencia») podría leer la foto del lugar
 * como una foto más de la persona.
 */
export const SOLO_EL_SITIO_DE_LA_IMAGEN =
  "The last reference image shows only the place: take the setting from it and nothing else, not any person, object or text that may appear in it";

/** C1 del plano del lugar solo: el sujeto es el sitio y en el plano no sale nadie. */
export const SUJETO_LUGAR_SOLO =
  "Nobody. The place itself is the subject: an empty establishing shot with no people, no animals and no characters in the frame";

/** Bloque del lugar cuando no hay seis C (el camino de «Crear» con plantilla): va detrás de lo que ponga ella. */
export const bloqueLugarSuelto = (lugar: LugarEnPrompt): string => {
  const texto = contextoDelLugar(lugar);
  const aviso = lugar.conReferencia && !lugar.soloLugar ? `. ${SOLO_EL_SITIO_DE_LA_IMAGEN}` : "";
  return `Place: ${texto}${aviso}.`;
};
