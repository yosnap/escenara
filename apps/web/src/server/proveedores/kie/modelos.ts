import { CLIP } from "@/lib/generacion";

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
  return `${escena}\n\n${SIN_TEXTO_IMAGEN}`;
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
  if (!dialogo) return `${escena}\n\n${AUDIO_SOLO_AMBIENTE}\n\n${SIN_TEXTO_VIDEO}`;
  return `${habla}${escena}\n\n${SIN_TEXTO_VIDEO} ${AUDIO_HABLADO}`;
}

export function entradaFotograma(escena: string, referencias: string[]): Record<string, unknown> {
  return { prompt: promptFotograma(escena), image_urls: referencias, aspect_ratio: CLIP.proporcion };
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
