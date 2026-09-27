import { CLIP } from "@/lib/generacion";

/**
 * Entrada de cada modelo de KIE que usa esta versión. Los parámetros se comprobaron en
 * https://docs.kie.ai/ el 2026-09-27 y coinciden con lo que el prototipo de la 0.3.0 ejecutó de verdad
 * (`spikes/prototipo/run.ts`), que es la única prueba de que el proveedor los acepta.
 *
 * - `nano-banana-2-lite`: `prompt` (hasta 20.000 caracteres), `aspect_ratio` (admite `9:16`) y
 *   `image_urls` (hasta 10 referencias JPEG, PNG o WebP).
 * - `veo3_lite`: `prompt`, `image_urls` (1 o 2), `generation_type`
 *   (`TEXT_2_VIDEO`, `FIRST_AND_LAST_FRAMES_2_VIDEO`, `REFERENCE_2_VIDEO`), `aspect_ratio` (`9:16`),
 *   `duration` (4, 6 u 8 s) y `resolution` (`720p`, `1080p`). Con una sola imagen,
 *   `FIRST_AND_LAST_FRAMES_2_VIDEO` la usa como primer fotograma.
 *
 * Duración, proporción y resolución son fijas en esta versión (decisión del propietario): configurables
 * en 0.19.0 y 0.26.0.
 */

export function entradaFotograma(prompt: string, referencias: string[]): Record<string, unknown> {
  return { prompt, image_urls: referencias, aspect_ratio: CLIP.proporcion };
}

export function entradaAnimacion(prompt: string, primerFotograma: string): Record<string, unknown> {
  return {
    prompt,
    image_urls: [primerFotograma],
    generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO",
    aspect_ratio: CLIP.proporcion,
    duration: CLIP.segundos,
    resolution: CLIP.resolucion,
  };
}
