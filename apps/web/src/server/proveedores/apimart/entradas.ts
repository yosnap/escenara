import type { ModeloVista } from "@/lib/catalogo";
import { type ContextoEntrada, ErrorCatalogo } from "../contrato";

/**
 * Entrada que espera cada modelo de APIMart. **Cada esquema está aquí porque se ejecutó de verdad** en el
 * spike del 2026-10-04 (`spikes/apimart/probe.ts`): no hay dos modelos que reciban los mismos campos y
 * adivinarlos cuesta dinero de verdad.
 *
 * - `gemini-omni-1.1-flash-ext`: `image_urls`, `prompt` (el diálogo va **en** el prompt, no traducido),
 *   `duration` (4/6/8/10; 5 no existe, verificado), `resolution`, `aspect_ratio`.
 * - `veo3.1-lite-ext`: los mismos campos que el omni; solo existe a 8 s.
 * - `MiniMax-Hailuo-2.3-Fast`: `first_frame_image` (una sola), `prompt`, `duration`, `resolution` (768p).
 *   Sin audio, como el hailuo de KIE.
 * - `gpt-image-2.5-flare`: `image_urls`, `prompt`, `size` (proporción), `resolution` («1k»), `n`.
 *
 * El texto del prompt reutiliza la técnica medida con dinero real: la prohibición de subtítulos va al final
 * y el diálogo en español entre comillas («saying in Spanish: …») es lo que hace que el modelo diga la frase
 * exacta en lugar de parafrasearla.
 */

const SIN_TEXTO_VIDEO = "No subtitles, no captions, no text, no on-screen words, no watermarks, no logos.";
const AUDIO_HABLADO = "Spoken audio only.";
const AUDIO_SOLO_AMBIENTE =
  "Audio: the natural ambient sound of this place, a quiet room tone and the soft sounds of the movements in the scene.";

const sinTexto = (prohibicion: string, escena: string): string =>
  escena.includes("text") || escena.includes("subtitle") ? `${prohibicion}` : `${escena}\n\n${prohibicion}`;

/**
 * Prompt de una **escena hablada** (omni): el diálogo va en el prompt entre comillas y **no se traduce**; es
 * lo que se va a oír. Lo que se midió el 2026-10-04 contra la API real: dijo la frase exacta en español.
 */
function promptEscenaHablada(escena: string, dialogo: string): string {
  const habla =
    dialogo.trim() === "" ? "" : `The character looks at the camera, saying in Spanish: "${dialogo.trim()}"\n\n`;
  if (habla === "") return `${escena}\n\n${AUDIO_SOLO_AMBIENTE}\n\n${sinTexto(SIN_TEXTO_VIDEO, escena)}`;
  return `${habla}${escena}\n\n${sinTexto(SIN_TEXTO_VIDEO, escena)} ${AUDIO_HABLADO}`;
}

/** Prompt de un **clip con voz** (Veo 3.1 Lite): el diálogo se indica con labios sincronizados. */
function promptAnimacion(escena: string, dialogo: string): string {
  const habla = dialogo
    ? `La persona mira a cámara y dice en español, con voz natural y labios sincronizados: ${dialogo}\n\n`
    : "";
  if (!dialogo) return `${escena}\n\n${AUDIO_SOLO_AMBIENTE}\n\n${sinTexto(SIN_TEXTO_VIDEO, escena)}`;
  return `${habla}${escena}\n\n${sinTexto(SIN_TEXTO_VIDEO, escena)} ${AUDIO_HABLADO}`;
}

/**
 * Duración que se envía: la que eligió el proyecto (`contexto.segundos`) si el modelo la admite, y si no, la
 * primera del modelo. Pedir una duración que el modelo no admite haría fallar la tarea —y no se paga, pero sí
 * se espera—, así que nunca se pide una que no está en su lista.
 */
function duracion(modelo: ModeloVista, contexto: ContextoEntrada): number {
  const elegida = contexto.segundos;
  return elegida && modelo.parametros.duraciones.includes(elegida) ? elegida : (modelo.parametros.duraciones[0] ?? 6);
}

/** Proporción que se envía: la preferida del contexto si el modelo la admite; si no, la primera del modelo. */
function proporcion(modelo: ModeloVista, contexto: ContextoEntrada): string {
  const preferida = contexto.proporcion;
  return preferida && modelo.parametros.proporciones.includes(preferida)
    ? preferida
    : (modelo.parametros.proporciones[0] ?? "9:16");
}

type Constructor = (contexto: ContextoEntrada, modelo: ModeloVista) => Record<string, unknown>;

const CONSTRUCTORES = new Map<string, Constructor>([
  [
    "gemini-omni-1.1-flash-ext",
    (contexto, modelo) => ({
      model: "gemini-omni-1.1-flash-ext",
      prompt: promptEscenaHablada(contexto.escena, contexto.dialogo),
      image_urls: contexto.urls,
      duration: duracion(modelo, contexto),
      resolution: "720p",
      aspect_ratio: proporcion(modelo, contexto),
    }),
  ],
  [
    "veo3.1-lite-ext",
    (contexto, modelo) => ({
      model: "veo3.1-lite-ext",
      prompt: promptAnimacion(contexto.escena, contexto.dialogo),
      image_urls: contexto.urls,
      duration: duracion(modelo, contexto),
      resolution: "720p",
      aspect_ratio: proporcion(modelo, contexto),
    }),
  ],
  [
    "MiniMax-Hailuo-2.3-Fast",
    (contexto, modelo) => ({
      model: "MiniMax-Hailuo-2.3-Fast",
      prompt: `${contexto.escena}\n\n${sinTexto(SIN_TEXTO_VIDEO, contexto.escena)}`,
      first_frame_image: contexto.urls[0] ?? "",
      duration: duracion(modelo, contexto),
      resolution: "768p",
    }),
  ],
  [
    "gpt-image-2.5-flare",
    (contexto, modelo) => ({
      model: "gpt-image-2.5-flare",
      prompt: contexto.escena,
      image_urls: contexto.urls,
      size: proporcion(modelo, contexto),
      resolution: "1k",
      n: 1,
    }),
  ],
]);

/** Monta la entrada exacta que espera ese modelo, o dice que esta instalación no sabe pedírsela. */
export function entradaDeModelo(modelo: ModeloVista, contexto: ContextoEntrada): Record<string, unknown> {
  // Un modelo sin voz no recibe nunca lo que dice el personaje: lo dibujaría o lo ignoraría.
  const limpio: ContextoEntrada = { ...contexto, dialogo: modelo.conVoz ? contexto.dialogo : "" };
  const montar = CONSTRUCTORES.get(modelo.modelo);
  if (!montar) {
    throw new ErrorCatalogo(
      503,
      `Esta instalación no sabe montar una tarea de APIMart para ${modelo.nombre}: no se le envía nada a ciegas.`,
    );
  }
  return montar(limpio, modelo);
}

export function tieneEntrada(modelo: string): boolean {
  return CONSTRUCTORES.has(modelo);
}

/** Campos de la entrada que llevan la URL temporal de la referencia: se usan para no guardarla en el trabajo. */
export const CAMPOS_DE_URL = ["image_urls", "first_frame_image"] as const;
