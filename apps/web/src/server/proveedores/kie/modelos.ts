import { CLIP } from "@/lib/generacion";

/**
 * Entrada y prompt de cada modelo de KIE que usa esta versión. Los parámetros se comprobaron en
 * https://docs.kie.ai/ el 2026-09-27 y coinciden con lo que el prototipo de la 0.3.0 y la comparativa de
 * modelos ejecutaron de verdad, que es la única prueba de que el proveedor los acepta.
 *
 * - `nano-banana-2-lite`: `prompt` (hasta 20.000 caracteres), `aspect_ratio` (admite `9:16`) y
 *   `image_urls` (hasta 10 referencias JPEG, PNG o WebP).
 * - `veo3_lite` (Veo 3.1 Lite): `prompt`, `image_urls` (1 o 2), `generation_type`
 *   (`TEXT_2_VIDEO`, `FIRST_AND_LAST_FRAMES_2_VIDEO`, `REFERENCE_2_VIDEO`), `aspect_ratio` (`9:16`),
 *   `duration` (4, 6 u 8 s) y `resolution` (`720p`, `1080p`). Con una sola imagen,
 *   `FIRST_AND_LAST_FRAMES_2_VIDEO` la usa como primer fotograma.
 *
 * Duración, proporción y resolución son fijas en esta versión (decisión del propietario): configurables
 * en 0.19.0 y 0.26.0.
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

const SIN_TEXTO_VIDEO =
  "No subtitles, no captions, no text, no on-screen words, no watermarks, no logos. Spoken audio only.";

/** Prompt del fotograma: solo la descripción visual. */
export function promptFotograma(escena: string): string {
  return `${escena}\n\n${SIN_TEXTO_IMAGEN}`;
}

/**
 * Prompt del clip: la frase que dice el personaje (si la hay) primero, luego la escena y al final los
 * negativos. Sin diálogo, el clip es solo movimiento y sonido ambiente.
 */
export function promptAnimacion(escena: string, dialogo = ""): string {
  const habla = dialogo
    ? `La persona mira a cámara y dice en español, con voz natural y labios sincronizados: ${dialogo}\n\n`
    : "";
  return `${habla}${escena}\n\n${SIN_TEXTO_VIDEO}`;
}

export function entradaFotograma(escena: string, referencias: string[]): Record<string, unknown> {
  return { prompt: promptFotograma(escena), image_urls: referencias, aspect_ratio: CLIP.proporcion };
}

export function entradaAnimacion(escena: string, dialogo: string, primerFotograma: string): Record<string, unknown> {
  return {
    prompt: promptAnimacion(escena, dialogo),
    image_urls: [primerFotograma],
    generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO",
    aspect_ratio: CLIP.proporcion,
    duration: CLIP.segundos,
    resolution: CLIP.resolucion,
  };
}
