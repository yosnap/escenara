import { RETRATOS_HOJA_IDENTIDAD } from "@/lib/direccion";
import { ANCLAJES_REALISMO, IDENTIDAD_DE_REFERENCIA } from "./ingles";

/**
 * **Hoja de identidad 3×3**: una sola imagen con nueve retratos del mismo personaje —frente, perfiles, tres
 * cuartos, miradas y expresiones— generada desde sus fotos de referencia.
 *
 * Para qué sirve: a un modelo de imagen se le pueden dar varias referencias, pero cada una gasta un hueco y
 * ninguna le dice cómo es la cara **desde otro ángulo**. Una hoja con las nueve vistas se lo dice en una sola
 * imagen. Esa es la hipótesis; si es verdad o no lo dice la métrica, no este comentario.
 *
 * **No sustituye a las vistas sueltas por decreto** (decisión firme del propietario, 2026-09-28). Nace
 * `candidata`, se registra con qué referencia se generó cada clip (`identityReferenceKind`) y Jev compara las
 * dos en sombra. Pasa a `por_defecto` solo si gana en esa métrica y el propietario lo aprueba.
 */

/**
 * Prompt de la hoja, en inglés como el resto.
 *
 * Tres cosas que no se negocian, por el mismo motivo que en el resto de la versión:
 *
 * - **la identidad sale de las referencias** y no se retoca ni se embellece, aunque sea una hoja de estudio;
 * - **la rejilla se describe casilla a casilla**: pedir «nueve retratos» a secas devuelve un collage con la
 *   misma pose repetida, que no aporta nada que no aporte una sola foto;
 * - **los anclajes cierran**, y con ellos la línea de que no haya texto: una hoja con rótulos («front»,
 *   «profile») sería una imagen con letras dentro, justo lo que el resto del producto evita.
 */
export function promptHojaIdentidad(descripcionDelPersonaje: string): string {
  const sujeto = descripcionDelPersonaje.trim();
  return [
    `A character identity sheet: one single image divided into a clean ${Math.sqrt(RETRATOS_HOJA_IDENTIDAD)} by ${Math.sqrt(RETRATOS_HOJA_IDENTIDAD)} grid of ${RETRATOS_HOJA_IDENTIDAD} portraits of the same person.`,
    sujeto === "" ? "" : `Subject: ${sujeto}.`,
    IDENTIDAD_DE_REFERENCIA,
    "Top row, left to right: straight-on front view, head turned three-quarters to the left, full left profile.",
    "Middle row, left to right: full right profile, head turned three-quarters to the right, front view looking slightly up.",
    "Bottom row, left to right: neutral expression, a soft natural smile, a serious concentrated expression.",
    "Every portrait is the same person, with the same hair, the same age and the same skin, on a plain neutral background, evenly lit, framed from the shoulders up.",
    "The grid is even and the portraits do not overlap.",
    ANCLAJES_REALISMO,
  ]
    .filter((linea) => linea !== "")
    .join("\n");
}

/** Lo que se le dice al usuario al ofrecerle generarla. Dice lo que cuesta y lo que **no** cambia. */
export const AVISO_HOJA_IDENTIDAD =
  "Generar la hoja de identidad cuesta lo mismo que un fotograma y se confirma como cualquier otra generación. Nace como candidata: no se usa por defecto hasta que se compruebe, con datos, que da mejor parecido que sus fotos sueltas.";

/** Por qué no se puede generar todavía. Vacío cuando sí se puede. */
export function motivoSinHoja(referencias: number, minimo: number): string {
  if (referencias < minimo) {
    return `Para componer la hoja de identidad hacen falta al menos ${minimo} fotos suyas utilizables y ahora mismo hay ${referencias}. Añade más y vuelve a intentarlo.`;
  }
  return "";
}
