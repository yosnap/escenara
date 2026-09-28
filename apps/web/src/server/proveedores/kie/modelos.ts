import { CLIP } from "@/lib/generacion";
import { EXCEPCION_TEXTO_PRODUCTO, REGLA_ETIQUETA_PRODUCTO } from "../../direccion/producto";

/**
 * Entrada y prompt de cada modelo de KIE que usa esta versión. Los parámetros se comprobaron en
 * https://docs.kie.ai/ el 2026-09-27 y coinciden con lo que el prototipo de la 0.3.0 y la comparativa de
 * modelos ejecutaron de verdad, que es la única prueba de que el proveedor los acepta.
 *
 * - `nano-banana-2-lite`: `prompt` (hasta 20.000 caracteres), `aspect_ratio` (admite `9:16`) y
 *   `image_urls` (hasta 10 referencias JPEG, PNG o WebP).
 * - `veo3_fast` (Veo 3.1 Fast) y `veo3_lite` (Veo 3.1 Lite), que reciben lo mismo: `prompt`, `image_urls`
 *   (1 o 2), `generation_type` (`TEXT_2_VIDEO`, `FIRST_AND_LAST_FRAMES_2_VIDEO`, `REFERENCE_2_VIDEO`),
 *   `aspect_ratio` (`9:16`), `duration` (4 u 8 s) y `resolution` (`720p`, `1080p`). Con una sola imagen,
 *   `FIRST_AND_LAST_FRAMES_2_VIDEO` la usa como primer fotograma, comprobado con dinero real el 2026-09-27.
 *
 * La duración sale del proyecto (4 u 8 s, que cuestan lo mismo); la proporción y la resolución siguen fijas en
 * esta versión y llegan en 0.26.0.
 */

/**
 * Lo que dice el personaje va **solo** al modelo de vídeo, y nunca al de imagen: en la comparativa del
 * 2026-09-27 los tres modelos de imagen dibujaron la frase en el fotograma (subtítulo, bocadillo o rótulo)
 * y el clip la heredaba.
 *
 * Los negativos van en inglés a propósito: es la forma documentada por Google y la que reconocen estos
 * modelos («no subtitles, no text, no captions»). El diálogo se indica con **dos puntos y sin comillas**,
 * que es lo que menos texto incrustado provoca en Veo, y se pone al principio del prompt.
 */
const SIN_TEXTO_IMAGEN =
  "No text, no captions, no subtitles, no speech bubbles, no watermarks, no logos, no written words anywhere in the image.";

const SIN_TEXTO_VIDEO = "No subtitles, no captions, no text, no on-screen words, no watermarks, no logos.";

/**
 * La prohibición de texto va la última y el modelo la obedece por encima de todo: con un producto en la escena
 * borraría su etiqueta. Por eso, cuando la escena lleva la regla de la etiqueta, la excepción va detrás.
 */
const sinTexto = (prohibicion: string, escena: string): string =>
  escena.includes(REGLA_ETIQUETA_PRODUCTO) ? `${prohibicion} ${EXCEPCION_TEXTO_PRODUCTO}` : prohibicion;

/**
 * Qué se tiene que oír, en inglés como el resto de los negativos. Veo siempre genera audio y **falla sin cobrar**
 * («The Google model was unable to generate audio for this request») cuando no sabe qué sonido poner. Medido con
 * dinero real el 2026-09-27: sin frase que decir se cae, y **prohibir la voz** («nobody speaks, no voice…») se cae
 * igual; lo que funciona es describir en positivo sonidos concretos del lugar.
 */
const AUDIO_HABLADO = "Spoken audio only.";
const AUDIO_SOLO_AMBIENTE =
  "Audio: the natural ambient sound of this place, a quiet room tone and the soft sounds of the movements in the scene.";

/** Prompt del fotograma: solo la descripción visual. */
export function promptFotograma(escena: string): string {
  return `${escena}\n\n${sinTexto(SIN_TEXTO_IMAGEN, escena)}`;
}

/**
 * Prompt del clip: la frase que dice el personaje (si la hay) primero, luego la escena y al final los
 * negativos. Sin diálogo se describe el sonido ambiente en positivo, justo después de la escena: dejarlo sin
 * decir, o solo prohibir la voz, es lo que hace que Veo se caiga por no saber qué audio generar.
 */
export function promptAnimacion(escena: string, dialogo = ""): string {
  const habla = dialogo
    ? `La persona mira a cámara y dice en español, con voz natural y labios sincronizados: ${dialogo}\n\n`
    : "";
  if (!dialogo) return `${escena}\n\n${AUDIO_SOLO_AMBIENTE}\n\n${sinTexto(SIN_TEXTO_VIDEO, escena)}`;
  return `${habla}${escena}\n\n${sinTexto(SIN_TEXTO_VIDEO, escena)} ${AUDIO_HABLADO}`;
}

/**
 * Prompt de una **escena hablada** de Gemini Omni (0.22.0), donde la identidad y la voz no van en el texto sino
 * en `character_ids`: lo único que hay que decirle es qué se ve y qué dice.
 *
 * El diálogo se indica con la forma `saying in Spanish: "…"`, que es la que se midió con dinero real el
 * 2026-09-28: el personaje dijo la frase **exacta** en español, comprobado transcribiendo el clip. Va entre
 * comillas a propósito, al revés que en Veo: aquí las comillas son lo que delimita lo que hay que decir, y sin
 * ellas el modelo parafrasea.
 *
 * El diálogo **no se traduce nunca**: es lo que se va a oír. La descripción de la escena sí llega ya en inglés.
 */
export function promptEscenaHablada(escena: string, dialogo: string): string {
  const habla =
    dialogo.trim() === "" ? "" : `The character looks at the camera, saying in Spanish: "${dialogo.trim()}"\n\n`;
  if (habla === "") return `${escena}\n\n${AUDIO_SOLO_AMBIENTE}\n\n${sinTexto(SIN_TEXTO_VIDEO, escena)}`;
  return `${habla}${escena}\n\n${sinTexto(SIN_TEXTO_VIDEO, escena)} ${AUDIO_HABLADO}`;
}

export function entradaFotograma(escena: string, referencias: string[]): Record<string, unknown> {
  return {
    prompt: promptFotograma(escena),
    /**
     * **Sin referencias no se envía el campo** (0.23.4): nano banana genera a partir del texto cuando no lo
     * recibe (docs.kie.ai/market/google/nano-banana-2-lite, comprobado el 2026-09-28: «omite image_urls para
     * texto a imagen»), y mandarlo vacío sería pedirle que editara una imagen que no existe.
     */
    ...(referencias.length > 0 ? { image_urls: referencias } : {}),
    aspect_ratio: CLIP.proporcion,
  };
}

/** `segundos` es la duración del clip del proyecto, ya comprobada contra las que admite el modelo. */
export function entradaAnimacion(
  escena: string,
  dialogo: string,
  primerFotograma: string,
  segundos: number,
): Record<string, unknown> {
  return {
    prompt: promptAnimacion(escena, dialogo),
    image_urls: [primerFotograma],
    generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO",
    aspect_ratio: CLIP.proporcion,
    duration: segundos,
    resolution: CLIP.resolucion,
  };
}
