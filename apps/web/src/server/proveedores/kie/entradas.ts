import type { ModeloVista } from "@/lib/catalogo";
import { CLIP } from "@/lib/generacion";
import { type ContextoEntrada, ErrorCatalogo } from "../contrato";
import { entradaAnimacion, entradaFotograma, promptAnimacion, promptFotograma } from "./modelos";

export type { ContextoEntrada };

/**
 * Entrada que espera cada modelo de KIE. **Cada esquema está aquí porque se ejecutó de verdad** en la
 * comparativa del 2026-09-27 (`spikes/comparativa-modelos/comparativa.ts`): no hay dos modelos que reciban
 * los mismos campos y adivinarlos cuesta dinero.
 *
 * - `nano-banana-2-lite`: `image_urls`, `aspect_ratio`.
 * - `seedream/4.5-edit`: `image_urls`, `aspect_ratio`, `quality`.
 * - `gpt-image-2-5-flare-image-to-image`: **`input_urls`** (no `image_urls`) y `resolution` 1K/2K/4K.
 * - `veo3_lite`: `image_urls`, `generation_type`, `aspect_ratio`, `duration` (número), `resolution`.
 * - `hailuo/2-3-image-to-video-standard`: **`image_url`** (texto), `duration` y `resolution` como texto,
 *   **sin `aspect_ratio`** (toma el de la imagen).
 * - `kling/v3-turbo-image-to-video`: `image_urls`, `duration` y `resolution` como texto, sin
 *   `aspect_ratio`; solo acepta JPEG o PNG (la conversión la hace la generación antes de subir).
 *
 * Un modelo del catálogo sin constructor aquí no se puede enviar: mejor no generar que enviar a ciegas.
 */

type Constructor = (contexto: ContextoEntrada, modelo: ModeloVista) => Record<string, unknown>;

/** Campos por los que puede llegar una URL temporal del proveedor: nunca se guardan en el trabajo. */
export const CAMPOS_DE_URL = ["image_urls", "input_urls", "image_url"] as const;

/** Primer valor admitido por el modelo, o el de `CLIP` si el modelo no declara ninguno. */
const primeraResolucion = (modelo: ModeloVista) => modelo.parametros.resoluciones[0] ?? CLIP.resolucion;
const primeraDuracion = (modelo: ModeloVista) => modelo.parametros.duraciones[0] ?? CLIP.segundos;
const proporcion = (modelo: ModeloVista) => modelo.parametros.proporciones[0] ?? null;

/** Proporción solo si el modelo la acepta: Hailuo 2.3 rechaza `aspect_ratio`. */
function conProporcion(modelo: ModeloVista, entrada: Record<string, unknown>): Record<string, unknown> {
  const valor = proporcion(modelo);
  return valor ? { ...entrada, aspect_ratio: valor } : entrada;
}

/** Un `Map` y no un objeto: así un nombre de modelo no puede resolverse por el prototipo de `Object`. */
const CONSTRUCTORES = new Map<string, Constructor>(
  Object.entries({
    "nano-banana-2-lite": ({ escena, urls }) => entradaFotograma(escena, urls),

    "seedream/4.5-edit": ({ escena, urls }, modelo) =>
      conProporcion(modelo, { prompt: promptFotograma(escena), image_urls: urls, quality: "basic" }),

    "gpt-image-2-5-flare-image-to-image": ({ escena, urls }, modelo) =>
      conProporcion(modelo, {
        prompt: promptFotograma(escena),
        input_urls: urls,
        resolution: primeraResolucion(modelo),
      }),

    veo3_lite: ({ escena, dialogo, urls }) => entradaAnimacion(escena, dialogo, urls[0] ?? ""),

    "hailuo/2-3-image-to-video-standard": ({ escena, dialogo, urls }, modelo) =>
      conProporcion(modelo, {
        prompt: promptAnimacion(escena, dialogo),
        image_url: urls[0] ?? "",
        // Hailuo espera la duración y la resolución como texto.
        duration: String(primeraDuracion(modelo)),
        resolution: primeraResolucion(modelo),
      }),

    "kling/v3-turbo-image-to-video": ({ escena, dialogo, urls }, modelo) =>
      conProporcion(modelo, {
        prompt: promptAnimacion(escena, dialogo),
        image_urls: urls,
        duration: String(primeraDuracion(modelo)),
        resolution: primeraResolucion(modelo),
      }),
  }),
);

export const tieneEntrada = (modelo: string) => CONSTRUCTORES.has(modelo);

/** Entrada lista para `jobs/createTask` con los campos que espera ese modelo concreto. */
export function entradaDeModelo(modelo: ModeloVista, contexto: ContextoEntrada): Record<string, unknown> {
  const montar = CONSTRUCTORES.get(modelo.modelo);
  if (!montar) {
    throw new ErrorCatalogo(
      503,
      `Esta instalación no sabe con qué parámetros pedirle nada a ${modelo.nombre}. Elige otro modelo.`,
    );
  }
  // Un modelo sin voz no recibe nunca lo que dice el personaje: lo dibujaría o lo ignoraría.
  return montar({ ...contexto, dialogo: modelo.conVoz ? contexto.dialogo : "" }, modelo);
}
