import type { ModeloVista } from "@/lib/catalogo";
import { CLIP } from "@/lib/generacion";
import { duracionParaModelo } from "@/lib/produccion";
import { type ContextoEntrada, ErrorCatalogo } from "../contrato";
import { resolucionDeUnidadDeCanto } from "./canto";
import { CAMPOS_DE_URL_DE_FAMILIA, familiaDe, varianteDeUnidad } from "./familias";
import {
  entradaAnimacion,
  entradaFotograma,
  promptAnimacion,
  promptCanto,
  promptEscenaHablada,
  promptFotograma,
} from "./modelos";

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
export const CAMPOS_DE_URL = [
  "image_urls",
  "input_urls",
  "image_url",
  // El audio del canto viaja por su propio campo (0.29.0) y su URL caduca igual que la de una imagen.
  "audio_url",
  // MiniMax H3 recibe las referencias y la muestra de voz por sus propios campos, y caducan igual (0.22.0).
  "reference_image_urls",
  "reference_audio_urls",
  // Y las familias del catálogo dinámico traen los suyos (0.23.0): nano banana 2 usa «image_input».
  ...CAMPOS_DE_URL_DE_FAMILIA,
] as const;

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

/**
 * Entrada de los modelos de **Gemini Omni**, que la comparten: con un personaje registrado la identidad y la voz
 * **son** `character_ids`, así que no se envía ninguna referencia. Enviar además `image_urls` sería darle dos
 * caras a la vez y pagar por que elija una; medido el 2026-09-28, con `character_ids` sola la cara es idéntica
 * entre escenas.
 */
const entradaOmni: Constructor = (contexto, modelo) => {
  /**
   * **Con referencias mandan las referencias** (0.26.0). `character_ids` e `image_urls` son excluyentes en
   * este modelo, así que cuando el trabajo trae imágenes que enviar —las fotos del personaje y las del
   * producto— la identidad registrada no se cita: enviar las dos cosas sería darle dos caras a la vez y pagar
   * por que elija una. Que se pierde la identidad registrada se avisa **antes** de cobrar, en la puerta de
   * controles (regla `producto-sin-identidad-registrada`).
   */
  if (contexto.personajesOmni && contexto.personajesOmni.length > 0 && contexto.urls.length === 0) {
    return conProporcion(modelo, {
      /**
       * **Con reparto, el prompt lleva los lados y los turnos** (0.28.0), y `character_ids` lleva exactamente los
       * que trae el contexto: **dos** en un dualcast y **uno** en cada clip de podcast. No se deduce nada aquí; lo
       * decidió y lo guardó quien encoló, que es quien sabe qué confirmó el usuario.
       */
      prompt: promptEscenaHablada(contexto.escena, contexto.dialogo, contexto.reparto),
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
};

/**
 * Entrada de los **modelos de canto** (capacidad `audio_to_video`, 0.29.0), que la comparten: un retrato, un
 * audio y un prompt que describe la interpretación. Campos leídos en la documentación de los dos modelos
 * (`kie.ai/infinitalk` y `kie.ai/kling-ai-avatar`, comprobados el 2026-09-29).
 *
 * Tres cosas que **no** se envían, y no por olvido:
 *
 * - **`aspect_ratio`**: ninguno de los dos lo acepta. El vertical lo fija el retrato, y por eso su proporción se
 *   valida antes de gastar en lugar de pedírsela aquí;
 * - **`duration`**: la duración del clip es la del audio. Pedir una distinta sería pedir que lo cortara;
 * - **el diálogo**: lo que se oye es el audio subido. Una frase aquí le daría dos cosas que decir a la vez.
 *
 * Sin audio **no se monta nada**: se lanza. Un lip-sync sin pista que sincronizar lo rechazaría el proveedor
 * después de haber cobrado la petición, y eso es exactamente lo que este error evita.
 */
const entradaCanto: Constructor = (contexto, modelo) => {
  const audio = contexto.audiosDeReferencia?.[0] ?? "";
  if (audio === "") {
    throw new ErrorCatalogo(
      409,
      `${modelo.nombre} canta a partir de un audio y no ha llegado ninguno, así que no se le ha pedido nada y no se te ha cobrado. Elige el audio de la escena y vuelve a pedir el clip.`,
    );
  }
  const retrato = contexto.urls[0] ?? "";
  if (retrato === "") {
    throw new ErrorCatalogo(
      409,
      `${modelo.nombre} necesita el retrato del personaje como imagen de partida y no ha llegado ninguno, así que no se le ha pedido nada y no se te ha cobrado. Comprueba que el personaje tiene su retrato y vuelve a pedir el clip.`,
    );
  }
  return {
    prompt: promptCanto(contexto.escena),
    image_url: retrato,
    audio_url: audio,
    // InfiniteTalk acepta `resolution`; Kling Standard no documenta ese campo y fija su salida en 720p.
    ...(modelo.modelo === "infinitalk/from-audio"
      ? { resolution: resolucionDeUnidadDeCanto(modelo.unidad) ?? primeraResolucion(modelo) }
      : {}),
  };
};

/** Un `Map` y no un objeto: así un nombre de modelo no puede resolverse por el prototipo de `Object`. */
const CONSTRUCTORES = new Map<string, Constructor>(
  Object.entries({
    /**
     * Los dos modelos de canto (0.29.0). Reciben exactamente lo mismo, así que comparten constructor; lo que
     * cambia entre ellos es la tarifa y las resoluciones que el proveedor publica para cada uno.
     */
    "infinitalk/from-audio": entradaCanto,

    "kling/v1-avatar-standard": entradaCanto,

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
    "gemini-omni-video": entradaOmni,

    /**
     * Gemini Omni 1.1 Flash (0.22.0), el predeterminado de las escenas habladas. Medido con dinero real el
     * 2026-09-28: 4 s en 9:16 a 720p costaron **63 créditos** —lo mismo que `gemini-omni-video`— y tardaron
     * **38 s en lugar de 59 s**, con el diálogo en español igual de exacto.
     *
     * Recibe lo mismo que su hermano y con los mismos tipos: `duration` y `resolution` **como texto**,
     * `aspect_ratio`, y `character_ids` cuando la escena la dice un personaje registrado. `first_frame_url` y
     * `last_frame_url` existen en su API pero **son excluyentes** con `image_urls`, `audio_ids` y
     * `character_ids`, así que esta versión no los usa: mezclar los dos caminos es pedir un clip que el
     * proveedor rechaza después de haber cobrado la petición.
     */
    "google/gemini-omni-flash-1-1": entradaOmni,

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

    /**
     * MiniMax H3 (0.22.0), el **segundo motor de escenas habladas**. Medido con dinero real el 2026-09-28: 5 s
     * en 9:16 a 768P costaron **40 créditos** y tardaron 143 s, con la cara fiel al retrato de referencia y el
     * diálogo en español exacto.
     *
     * No registra nada en el proveedor: la identidad son las **fotos del personaje** (`reference_image_urls`,
     * hasta 9) y la voz es una **muestra de la voz del proyecto** (`reference_audio_urls`, hasta 3), así que el
     * timbre es el del mapa de voz del usuario. `duration` va como **entero** (4–15), al revés que en Omni, que
     * lo quiere como texto.
     */
    "minimax-h3/reference-to-video": (contexto, modelo) =>
      conProporcion(modelo, {
        prompt: promptEscenaHablada(contexto.escena, contexto.dialogo),
        reference_image_urls: contexto.urls,
        ...(contexto.audiosDeReferencia && contexto.audiosDeReferencia.length > 0
          ? { reference_audio_urls: [...contexto.audiosDeReferencia] }
          : {}),
        duration: duracion(modelo, contexto),
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

/**
 * `true` si esta instalación sabe montar la entrada de ese modelo: o tiene constructor propio (los medidos con
 * dinero real) o pertenece a una **familia** del catálogo dinámico (0.23.0). Un modelo que no esté en ninguno
 * de los dos sitios se ve en el catálogo pero no se puede elegir.
 */
export const tieneEntrada = (modelo: string) => CONSTRUCTORES.has(modelo) || familiaDe(modelo) !== undefined;

/**
 * Modelos cuyas referencias **no son una galería**: lo que reciben son fotogramas del clip, y una imagen de
 * más no describe mejor la escena, la cambia. Veo 3.1 toma la segunda como **último fotograma**
 * (`FIRST_AND_LAST_FRAMES_2_VIDEO`, medido el 2026-09-27), y Hailuo 2.3 solo acepta `image_url`, una sola.
 *
 * Con estos modelos, las fotos de un producto **no viajan**: el producto se describe en el texto y se avisa
 * antes de pagar de que no va a llegar ninguna foto suya (regla `producto-referencias-no-caben`).
 */
const REFERENCIAS_QUE_SON_FOTOGRAMAS: Record<string, number> = {
  veo3_fast: 1,
  veo3_lite: 1,
  "hailuo/2-3-image-to-video-standard": 1,
};

/** Cuántas de las referencias de un modelo son galería de verdad. Por defecto, todas. */
export const referenciasDeGaleria = (modelo: ModeloVista): number =>
  REFERENCIAS_QUE_SON_FOTOGRAMAS[modelo.modelo] ?? modelo.parametros.maximoReferencias;

/** Entrada lista para `jobs/createTask` con los campos que espera ese modelo concreto. */
export function entradaDeModelo(modelo: ModeloVista, contexto: ContextoEntrada): Record<string, unknown> {
  return conProporcionPreferida(modelo, contexto, montarEntrada(modelo, contexto));
}

/**
 * Cambia `aspect_ratio` por la proporción preferida del contexto **solo si el modelo la admite**: una vista de
 * la cabeza en 9:16 deja la cara pequeña y descentrada, pero pedir una proporción que el modelo no admite haría
 * fallar la tarea. Si la entrada no lleva `aspect_ratio`, no se añade.
 */
function conProporcionPreferida(
  modelo: ModeloVista,
  contexto: ContextoEntrada,
  entrada: Record<string, unknown>,
): Record<string, unknown> {
  const preferida = contexto.proporcion;
  if (!preferida || !("aspect_ratio" in entrada)) return entrada;
  const admitida =
    modelo.parametros.proporciones.includes(preferida) ||
    (PROPORCIONES_DE_VISTA[modelo.modelo] ?? []).includes(preferida);
  return admitida ? { ...entrada, aspect_ratio: preferida } : entrada;
}

/**
 * Proporciones que un modelo admite **para las vistas y retratos de un personaje**, comprobadas en su
 * documentación (docs.kie.ai, 2026-09-28). Van aparte de `parametros.proporciones` a propósito: esa lista dice
 * qué formatos de preset admite «Crear», y añadir ahí 3:4 haría aceptar presets que luego se generarían en 9:16.
 */
const PROPORCIONES_DE_VISTA: Record<string, readonly string[]> = {
  "nano-banana-2-lite": ["3:4", "1:1"],
  "seedream/4.5-edit": ["3:4", "1:1"],
};

function montarEntrada(modelo: ModeloVista, contexto: ContextoEntrada): Record<string, unknown> {
  // Un modelo sin voz no recibe nunca lo que dice el personaje: lo dibujaría o lo ignoraría.
  const limpio: ContextoEntrada = { ...contexto, dialogo: modelo.conVoz ? contexto.dialogo : "" };
  const montar = CONSTRUCTORES.get(modelo.modelo);
  if (montar) return montar(limpio, modelo);
  const familia = familiaDe(modelo.modelo);
  if (!familia) {
    throw new ErrorCatalogo(
      503,
      `Esta instalación no sabe con qué parámetros pedirle nada a ${modelo.nombre}. Elige otro modelo.`,
    );
  }
  /**
   * La variante sale de la **unidad registrada**, que es la que se ha estimado y confirmado. Si esa unidad no
   * es ninguna de las que ofrece la familia, no se envía nada: se habría confirmado un precio y pedido otra
   * cosa, y eso lo paga el usuario.
   */
  const variante = varianteDeUnidad(modelo.unidad);
  const ofrecida = familia.variantes.find(
    (v) => v.resolucion === variante.resolucion && v.calidad === variante.calidad,
  );
  if (!ofrecida) {
    throw new ErrorCatalogo(
      409,
      `La unidad registrada de ${modelo.nombre} («${modelo.unidad}») no es ninguna de las que publica el proveedor. Vuelve a sincronizar sus precios antes de generar con él.`,
    );
  }
  return familia.montar(limpio, ofrecida, modelo.parametros);
}
