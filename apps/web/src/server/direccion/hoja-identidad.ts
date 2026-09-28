import { createHash } from "node:crypto";
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

/**
 * Reparto del experimento de la hoja de identidad 3×3 (0.25.0): si **esta** generación sale con la hoja o con
 * las fotos sueltas del personaje.
 *
 * **Solo se reparte si su dueño ha activado la prueba** (decisión firme del propietario, 2026-09-28). Que
 * exista una hoja candidata no basta: repartir cambia lo que se genera y lo que se paga —la escena del grupo
 * de la hoja sale **solo** con ella, no con sus fotos—, y eso no se decide a espaldas de quien paga. Sin el
 * interruptor, siempre las fotos sueltas.
 *
 * Cuando sí está activado, el reparto es **determinista** por el asunto que se genera (la escena, o la clave
 * de idempotencia si no hay escena): repetir el mismo envío cae siempre del mismo lado, así que un reintento
 * no cambia de grupo ni ensucia la medida. No es aleatorio a propósito: un `Math.random()` haría que dos
 * ejecuciones del mismo trabajo usaran referencias distintas.
 *
 * Con la hoja `por_defecto` no hay experimento: esa ya es la referencia del personaje, y también la eligió él.
 */
export function conHojaDeIdentidad(
  personaje: { identitySheetMediaId: string | null; identitySheetStatus: string; identitySheetTrial: boolean },
  asunto: string,
): boolean {
  if (!personaje.identitySheetMediaId) return false;
  if (personaje.identitySheetStatus === "por_defecto") return true;
  if (personaje.identitySheetStatus !== "candidata" || !personaje.identitySheetTrial) return false;
  // Paridad de una huella estable del asunto: mitad y mitad, y siempre la misma para el mismo asunto.
  const huella = createHash("sha256").update(asunto).digest();
  return (huella[0] ?? 0) % 2 === 0;
}
