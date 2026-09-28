import type { ModeloVista } from "@/lib/catalogo";
import { CLIP } from "@/lib/generacion";
import { duracionParaModelo } from "@/lib/produccion";
import { type ContextoEntrada, ErrorCatalogo } from "../contrato";
import { entradaAnimacion, entradaFotograma, promptAnimacion, promptEscenaHablada, promptFotograma } from "./modelos";

export type { ContextoEntrada };

/**
 * Entrada que espera cada modelo de KIE. **Cada esquema está aquí porque se ejecutó de verdad** en la
 * comparativa del 2026-09-27 (`spikes/comparativa-modelos/comparativa.ts`): no hay dos modelos que reciban
 * los mismos campos y adivinarlos cuesta dinero.
 *
 * - `nano-banana-2-lite`: `image_urls`, `aspect_ratio`.
 * - `seedream/4.5-edit`: `image_urls`, `aspect_ratio`, `quality`.
 * - `gpt-image-2-5-flare-image-to-image`: **`input_urls`** (no `image_urls`) y `resolution` 1K/2K/4K.
 * - `veo3_fast` y `veo3_lite`: `image_urls`, `generation_type`, `aspect_ratio`, `duration` (número),
 *   `resolution`. Reciben exactamente lo mismo, comprobado con dinero real el 2026-09-27.
 * - `hailuo/2-3-image-to-video-standard`: **`image_url`** (texto), `duration` y `resolution` como texto,
 *   **sin `aspect_ratio`** (toma el de la imagen).
 * - `kling/v3-turbo-image-to-video`: `image_urls`, `duration` y `resolution` como texto, sin
 *   `aspect_ratio`; solo acepta JPEG o PNG (la conversión la hace la generación antes de subir).
 * - `gemini-omni-video`: `image_urls` (hasta 7), `duration` y `resolution` como texto, `aspect_ratio`; y, en las
 *   escenas habladas de 0.22.0, `character_ids` **en lugar de** `image_urls`.
 * - `grok-imagine/text-to-video` y `grok-imagine/image-to-video`: `mode`, `duration` y `resolution` como texto,
 *   `aspect_ratio`, y `image_urls` solo la segunda. **Prompt solo en inglés y sin diálogo.**
 *
 * Un modelo del catálogo sin constructor aquí no se puede enviar: mejor no generar que enviar a ciegas.
 */

type Constructor = (contexto: ContextoEntrada, modelo: ModeloVista) => Record<string, unknown>;

/** Campos por los que puede llegar una URL temporal del proveedor: nunca se guardan en el trabajo. */
export const CAMPOS_DE_URL = ["image_urls", "input_urls", "image_url"] as const;

/** Primer valor admitido por el modelo, o el de `CLIP` si el modelo no declara ninguno. */
const primeraResolucion = (modelo: ModeloVista) => modelo.parametros.resoluciones[0] ?? CLIP.resolucion;
const proporcion = (modelo: ModeloVista) => modelo.parametros.proporciones[0] ?? null;

/**
 * Duración que se le pide al modelo: la del clip del proyecto si la admite y, si no, la primera que declare. Sin
 * proyecto (el camino rápido de «Crear») manda la del modelo, y `CLIP` es el último recurso.
 */
const duracion = (modelo: ModeloVista, contexto: ContextoEntrada) =>
  duracionParaModelo(
    modelo.parametros.duraciones,
    contexto.segundos ?? modelo.parametros.duraciones[0] ?? CLIP.segundos,
  );

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

    veo3_fast: (contexto, modelo) =>
      entradaAnimacion(contexto.escena, contexto.dialogo, contexto.urls[0] ?? "", duracion(modelo, contexto)),

    veo3_lite: (contexto, modelo) =>
      entradaAnimacion(contexto.escena, contexto.dialogo, contexto.urls[0] ?? "", duracion(modelo, contexto)),

    "hailuo/2-3-image-to-video-standard": (contexto, modelo) =>
      conProporcion(modelo, {
        prompt: promptAnimacion(contexto.escena, contexto.dialogo),
        image_url: contexto.urls[0] ?? "",
        // Hailuo espera la duración y la resolución como texto.
        duration: String(duracion(modelo, contexto)),
        resolution: primeraResolucion(modelo),
      }),

    /**
     * Voz a partir del diálogo de la escena (capacidad `tts`, 0.21.0). Campos documentados en
     * https://docs.kie.ai/market/elevenlabs/text-to-speech-multilingual-v2 (comprobado el 2026-09-28, sin llamar a
     * la API con ninguna clave): `text`, `voice`, `stability`, `similarity_boost`, `style` y `speed`.
     *
     * `language_code` se fija en español: el diálogo se escribe en español y **no se traduce nunca** (es lo que se
     * va a oír). `timestamps` se pide para que, cuando el proveedor los devuelva, los subtítulos puedan alinearse
     * con lo que de verdad se ha dicho en lugar de repartir el tiempo a ojo.
     */
    "elevenlabs/text-to-speech-multilingual-v2": ({ dialogo, voz }) => {
      if (!voz) {
        throw new ErrorCatalogo(
          409,
          "No hay ninguna voz fijada para este proyecto. Elige la voz antes de generar su pista de audio.",
        );
      }
      return {
        text: dialogo,
        voice: voz.voz,
        stability: voz.parametros.estabilidad,
        similarity_boost: voz.parametros.similitud,
        style: voz.parametros.estilo,
        speed: voz.parametros.velocidad,
        language_code: "es",
        timestamps: true,
      };
    },

    /**
     * Gemini Omni 1.1 Flash (0.21.1). Medido con dinero real el 2026-09-28: 4 s en 9:16 a 720p costaron **63
     * créditos** y tardaron 59 s, y **dijo el diálogo en español con exactitud**, que es justo lo que hace falta
     * para una escena con personaje hablando.
     *
     * La duración y la resolución van **como texto**, y acepta hasta siete referencias por `image_urls` (la
     * primera hace de fotograma inicial). Desde la 0.22.0 **sí se expone `character_ids`**, porque hay
     * consentimiento y registro detrás: un personaje registrado lleva su cara y su voz guardadas en el proveedor,
     * y citarlo es lo que hace que todas las escenas del proyecto salgan iguales. `audio_ids` sigue sin exponerse
     * aquí: la voz viaja dentro del personaje registrado, no suelta por escena.
     */
    "gemini-omni-video": (contexto, modelo) => {
      /**
       * Escena hablada (0.22.0): con un personaje registrado, la identidad y la voz **son** `character_ids`, así
       * que no se envía ninguna referencia. Enviar además `image_urls` sería darle dos caras a la vez y pagar por
       * que elija una; medido el 2026-09-28, con `character_ids` sola la cara es idéntica entre escenas.
       */
      if (contexto.personajesOmni && contexto.personajesOmni.length > 0) {
        return conProporcion(modelo, {
          prompt: promptEscenaHablada(contexto.escena, contexto.dialogo),
          duration: String(duracion(modelo, contexto)),
          resolution: primeraResolucion(modelo),
          character_ids: [...contexto.personajesOmni],
        });
      }
      return conProporcion(modelo, {
        prompt: promptAnimacion(contexto.escena, contexto.dialogo),
        image_urls: contexto.urls,
        duration: String(duracion(modelo, contexto)),
        resolution: primeraResolucion(modelo),
      });
    },

    // Gemini Omni 1.1 Flash: los mismos campos que Gemini Omni (medido el 2026-09-28, mismo precio y más rápido).
    "google/gemini-omni-flash-1-1": (contexto, modelo) =>
      conProporcion(modelo, {
        prompt: promptAnimacion(contexto.escena, contexto.dialogo),
        image_urls: contexto.urls,
        duration: String(duracion(modelo, contexto)),
        resolution: primeraResolucion(modelo),
      }),

    /**
     * Grok Imagine (0.21.1), en sus dos variantes. Medido con dinero real el 2026-09-28: 6 s en 9:16 a 480p
     * costaron **14,4 créditos** y tardaron 38 s, con audio.
     *
     * **Su prompt va solo en inglés**, así que depende de la traducción del servidor, y no lleva diálogo: está
     * pensado para animación, dibujo y anuncios **sin personaje hablando**. Su ficha del catálogo lo dice.
     *
     * `mode` se fija en `normal` a propósito: el proveedor admite además un modo «spicy» que esta instalación no
     * ofrece.
     */
    "grok-imagine/text-to-video": (contexto, modelo) =>
      conProporcion(modelo, {
        prompt: promptAnimacion(contexto.escena, ""),
        mode: "normal",
        duration: String(duracion(modelo, contexto)),
        resolution: primeraResolucion(modelo),
      }),

    "grok-imagine/image-to-video": (contexto, modelo) =>
      conProporcion(modelo, {
        prompt: promptAnimacion(contexto.escena, ""),
        image_urls: contexto.urls,
        mode: "normal",
        duration: String(duracion(modelo, contexto)),
        resolution: primeraResolucion(modelo),
      }),

    "kling/v3-turbo-image-to-video": (contexto, modelo) =>
      conProporcion(modelo, {
        prompt: promptAnimacion(contexto.escena, contexto.dialogo),
        image_urls: contexto.urls,
        duration: String(duracion(modelo, contexto)),
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
