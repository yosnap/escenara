import type { Capacidad, ParametrosModelo } from "@/lib/catalogo";
import type { ContextoEntrada } from "../contrato";
import type { VarianteTarifa } from "./correspondencia";
import { promptFotograma } from "./modelos";

/**
 * **Familias de modelos de KIE** (0.23.0): lo que esta instalación sabe de cada modelo del market al que le
 * puede pedir una imagen con referencia.
 *
 * Existe porque la tabla de precios pública dice **cuánto** cuesta un modelo pero no **cómo** se le pide: cada
 * familia recibe la referencia por un campo distinto (`image_urls`, `input_urls`, `image_url`, `image_input`,
 * `reference_image_urls`) y expresa la resolución o la calidad con su propio vocabulario. Todo lo que hay aquí
 * está leído en la documentación del modelo (`docs.kie.ai/market/...`, comprobada el 2026-09-28), que es la que
 * publica el `model` exacto de `jobs/createTask` y sus campos de `input`.
 *
 * La regla que la hace segura: **un modelo sin familia no se puede elegir**. Aparece en el catálogo con su
 * precio publicado y con el motivo a la vista, pero no se le envía nada. Adivinar los campos de un modelo
 * cuesta dinero de verdad, y un envío rechazado por el proveedor ya se ha cobrado la petición.
 *
 * Los modelos de vídeo siguen con su constructor en `entradas.ts`: los suyos están medidos con dinero real y
 * llevan su propia forma (duración como texto o como entero, personajes registrados, audios de referencia).
 */

/** Variante que esta instalación ofrece de una familia: es lo que se envía y lo que se cobra. */
export interface VarianteFamilia {
  /** Resolución con la grafía exacta del proveedor («1K», «2K»); vacío si su precio no depende de ella. */
  resolucion: string;
  /** Calidad o velocidad de render («QUALITY», «medium», «basic»); vacío si no aplica. */
  calidad: string;
}

export type ConstructorFamilia = (
  contexto: ContextoEntrada,
  variante: VarianteFamilia,
  parametros: ParametrosModelo,
) => Record<string, unknown>;

export interface Familia {
  /** Nombre legible para el catálogo («GPT Image 2»). */
  nombre: string;
  /**
   * Familia a la que pertenece el modelo («gpt-image-2»). Es lo que hermana **el mismo modelo en sus dos
   * formas**: con imagen de partida y sin ella. Cuando hay que generar sin foto se busca el gemelo de la
   * familia que el usuario tiene primero en su mapa, para que la imagen salga del mismo motor que ya eligió.
   */
  clave: string;
  capacidades: readonly Capacidad[];
  /**
   * Variantes que se pueden elegir, en el orden en que se enseñan. **La primera es la de por defecto**, y es
   * siempre la más barata: si alguien quiere gastar más por más resolución, que sea decidiéndolo.
   */
  variantes: readonly VarianteFamilia[];
  proporciones: readonly string[];
  formatosReferencia: readonly string[];
  maximoReferencias: number;
  montar: ConstructorFamilia;
  notas: string;
}

/** Formatos que aceptan casi todos los modelos de imagen del market; los que aceptan menos lo declaran. */
const FORMATOS = ["image/jpeg", "image/png", "image/webp"] as const;

/** Proporción con la que Escenara pide sus fotogramas. Vertical: es el formato de las escenas. */
const PROPORCIONES = ["9:16"] as const;

const variantesDe = (resoluciones: readonly string[]): VarianteFamilia[] =>
  resoluciones.map((resolucion) => ({ resolucion, calidad: "" }));

const variantesPorCalidad = (calidades: readonly string[]): VarianteFamilia[] =>
  calidades.map((calidad) => ({ resolucion: "", calidad }));

/** Proporción solo si la familia la declara: no todos los modelos aceptan `aspect_ratio`. */
function conProporcion(parametros: ParametrosModelo, entrada: Record<string, unknown>): Record<string, unknown> {
  const proporcion = parametros.proporciones[0];
  return proporcion ? { ...entrada, aspect_ratio: proporcion } : entrada;
}

/**
 * Constructor de una familia de imagen: el prompt, las referencias por el campo que espera ese modelo y, si su
 * precio depende de ellas, la resolución o la calidad de la variante elegida.
 *
 * `campoDeResolucion` y `campoDeCalidad` son los nombres reales de cada API: Ideogram llama `rendering_speed` a
 * lo que Seedream llama `quality`, y nano banana 2 recibe las referencias por `image_input` y no por
 * `image_urls`. Nada de esto se generaliza: se copia de la documentación de cada modelo.
 */
function imagenConReferencia(opciones: {
  /** Campo por el que viajan las referencias. `image_url` es el de los modelos que solo aceptan una. */
  campoDeUrls: "image_urls" | "input_urls" | "image_input" | "reference_image_urls" | "image_url";
  campoDeResolucion?: string;
  campoDeCalidad?: string;
}): ConstructorFamilia {
  return ({ escena, urls }, variante, parametros) => {
    const entrada: Record<string, unknown> = { prompt: promptFotograma(escena) };
    /**
     * Sin ninguna referencia **no se envía el campo**: los modelos que saben las dos cosas (nano banana) generan
     * a partir del texto cuando no lo reciben, y mandarlo vacío sería pedirles que editaran una imagen que no
     * existe. Un modelo que solo sabe editar nunca llega aquí sin referencia: su capacidad no lo permite.
     */
    if (urls.length > 0) {
      // Un modelo que solo admite una referencia la recibe suelta, no en una lista: son campos distintos.
      if (opciones.campoDeUrls === "image_url") entrada.image_url = urls[0] ?? "";
      else entrada[opciones.campoDeUrls] = urls;
    }
    if (opciones.campoDeResolucion && variante.resolucion !== "") {
      entrada[opciones.campoDeResolucion] = variante.resolucion;
    }
    if (opciones.campoDeCalidad && variante.calidad !== "") entrada[opciones.campoDeCalidad] = variante.calidad;
    return conProporcion(parametros, entrada);
  };
}

/** Familia de imagen ya montada, con lo que comparten casi todas. */
function familiaDeImagen(familia: {
  nombre: string;
  clave: string;
  variantes: readonly VarianteFamilia[];
  montar: ConstructorFamilia;
  maximoReferencias: number;
  formatosReferencia?: readonly string[];
  proporciones?: readonly string[];
  /** Capacidades del modelo; por defecto, solo edición con referencia. */
  capacidades?: readonly Capacidad[];
  notas: string;
}): Familia {
  return {
    nombre: familia.nombre,
    clave: familia.clave,
    capacidades: familia.capacidades ?? ["image_edit"],
    variantes: familia.variantes,
    proporciones: familia.proporciones ?? PROPORCIONES,
    formatosReferencia: familia.formatosReferencia ?? FORMATOS,
    maximoReferencias: familia.maximoReferencias,
    montar: familia.montar,
    notas: familia.notas,
  };
}

/**
 * Constructor de una familia **texto a imagen**: el prompt y, si su precio depende de ellas, la resolución o
 * la calidad. Sin ningún campo de referencia, que es justo lo que la distingue de su gemela de edición.
 *
 * `campoDeProporcion` existe porque no todos la llaman igual: Qwen la pide por `image_size` y los demás por
 * `aspect_ratio`. Nada de esto se generaliza: se copia de la documentación de cada modelo.
 */
function imagenDeTexto(opciones: {
  campoDeResolucion?: string;
  campoDeCalidad?: string;
  campoDeProporcion?: string;
}): ConstructorFamilia {
  return ({ escena }, variante, parametros) => {
    const entrada: Record<string, unknown> = { prompt: promptFotograma(escena) };
    if (opciones.campoDeResolucion && variante.resolucion !== "") {
      entrada[opciones.campoDeResolucion] = variante.resolucion;
    }
    if (opciones.campoDeCalidad && variante.calidad !== "") entrada[opciones.campoDeCalidad] = variante.calidad;
    if (opciones.campoDeProporcion) return entrada;
    return conProporcion(parametros, entrada);
  };
}

/** Familia que genera **sin imagen de partida**. No admite referencias: su tope es cero, y se nota. */
function familiaSinReferencia(familia: {
  nombre: string;
  clave: string;
  variantes: readonly VarianteFamilia[];
  montar: ConstructorFamilia;
  proporciones?: readonly string[];
  notas: string;
}): Familia {
  return {
    nombre: familia.nombre,
    clave: familia.clave,
    capacidades: ["text_to_image"],
    variantes: familia.variantes,
    proporciones: familia.proporciones ?? PROPORCIONES,
    formatosReferencia: [],
    maximoReferencias: 0,
    montar: familia.montar,
    notas: familia.notas,
  };
}

const DOCS = "Campos leídos en docs.kie.ai el 2026-09-28";

/**
 * Familias de imagen, por el identificador exacto de `jobs/createTask`. Un `Map` y no un objeto: así un nombre
 * de modelo no puede resolverse por el prototipo de `Object`.
 */
export const FAMILIAS = new Map<string, Familia>(
  Object.entries({
    // ── GPT Image ───────────────────────────────────────────────────────────────────────────────────────
    /** `prompt`, `input_urls` (no `image_urls`), `aspect_ratio` y `resolution` 1K/2K/4K. */
    "gpt-image-2-image-to-image": familiaDeImagen({
      nombre: "GPT Image 2",
      clave: "gpt-image-2",
      variantes: variantesDe(["1K", "2K", "4K"]),
      montar: imagenConReferencia({ campoDeUrls: "input_urls", campoDeResolucion: "resolution" }),
      maximoReferencias: 1,
      notas: `${DOCS} (market/gpt/gpt-image-2-image-to-image). Recibe la referencia por «input_urls».`,
    }),

    "gpt-image-2-5-flare-image-to-image": familiaDeImagen({
      nombre: "GPT Image 2.5 Flare",
      clave: "gpt-image-2-5-flare",
      variantes: variantesDe(["1K", "2K", "4K"]),
      montar: imagenConReferencia({ campoDeUrls: "input_urls", campoDeResolucion: "resolution" }),
      maximoReferencias: 1,
      notas: `${DOCS} (market/gpt/gpt-image-2-5-flare-image-to-image).`,
    }),

    "gpt-image-2-5-sunburst-image-to-image": familiaDeImagen({
      nombre: "GPT Image 2.5 Sunburst",
      clave: "gpt-image-2-5-sunburst",
      variantes: variantesDe(["1K", "2K", "4K"]),
      montar: imagenConReferencia({ campoDeUrls: "input_urls", campoDeResolucion: "resolution" }),
      maximoReferencias: 1,
      notas: `${DOCS} (market/gpt/gpt-image-2-5-sunburst-image-to-image).`,
    }),

    /** GPT Image 1.5 cobra por **calidad** (`medium` o `high`), no por resolución. */
    "gpt-image/1.5-image-to-image": familiaDeImagen({
      nombre: "GPT Image 1.5",
      clave: "gpt-image-1-5",
      variantes: variantesPorCalidad(["medium", "high"]),
      montar: imagenConReferencia({ campoDeUrls: "input_urls", campoDeCalidad: "quality" }),
      maximoReferencias: 1,
      proporciones: ["2:3"],
      notas: `${DOCS} (market/gpt-image/1-5-image-to-image). Solo admite 1:1, 2:3 y 3:2, así que su vertical es 2:3.`,
    }),

    // ── Nano Banana ─────────────────────────────────────────────────────────────────────────────────────
    "nano-banana-2-lite": familiaDeImagen({
      nombre: "Nano Banana 2 Lite",
      clave: "nano-banana-2-lite",
      variantes: variantesDe(["1K"]),
      montar: imagenConReferencia({ campoDeUrls: "image_urls" }),
      capacidades: ["image_edit", "text_to_image"],
      maximoReferencias: 10,
      notas: `${DOCS} (market/google/nano-banana-2-lite). Tarifa única: no cobra por resolución.`,
    }),

    /** Nano Banana 2 y Pro reciben las referencias por **`image_input`**, no por `image_urls`. */
    "nano-banana-2": familiaDeImagen({
      nombre: "Nano Banana 2",
      clave: "nano-banana-2",
      variantes: variantesDe(["1K", "2K", "4K"]),
      montar: imagenConReferencia({ campoDeUrls: "image_input", campoDeResolucion: "resolution" }),
      capacidades: ["image_edit", "text_to_image"],
      maximoReferencias: 10,
      notas: `${DOCS} (market/google/nanobanana2). Recibe las referencias por «image_input».`,
    }),

    "nano-banana-pro": familiaDeImagen({
      nombre: "Nano Banana Pro",
      clave: "nano-banana-pro",
      variantes: variantesDe(["1K", "4K"]),
      montar: imagenConReferencia({ campoDeUrls: "image_input", campoDeResolucion: "resolution" }),
      capacidades: ["image_edit", "text_to_image"],
      maximoReferencias: 10,
      notas: `${DOCS} (market/google/pro-image-to-image). 1K y 2K cuestan lo mismo, así que solo se ofrece 1K.`,
    }),

    "google/nano-banana-edit": familiaDeImagen({
      nombre: "Nano Banana Edit",
      clave: "nano-banana-edit",
      variantes: variantesDe([""]),
      montar: imagenConReferencia({ campoDeUrls: "image_urls" }),
      maximoReferencias: 10,
      notas: `${DOCS} (market/google/nano-banana-edit). Tarifa única.`,
    }),

    // ── Seedream ────────────────────────────────────────────────────────────────────────────────────────
    "seedream/4.5-edit": familiaDeImagen({
      nombre: "Seedream 4.5",
      clave: "seedream-4-5",
      variantes: [{ resolucion: "", calidad: "basic" }],
      montar: imagenConReferencia({ campoDeUrls: "image_urls", campoDeCalidad: "quality" }),
      maximoReferencias: 10,
      notas: `${DOCS} (market/seedream/4-5-edit). Tarifa única.`,
    }),

    "seedream/5-lite-image-to-image": familiaDeImagen({
      nombre: "Seedream 5.0 Lite",
      clave: "seedream-5-lite",
      variantes: variantesPorCalidad(["basic", "high", "ultra"]),
      montar: imagenConReferencia({ campoDeUrls: "image_urls", campoDeCalidad: "quality" }),
      maximoReferencias: 10,
      notas: `${DOCS} (market/seedream-5-lite-image-to-image). Tarifa única para las tres calidades.`,
    }),

    "seedream/5-pro-image-to-image": familiaDeImagen({
      nombre: "Seedream 5.0 Pro",
      clave: "seedream-5-pro",
      variantes: variantesDe(["1K", "2K"]),
      montar: imagenConReferencia({ campoDeUrls: "image_urls", campoDeResolucion: "resolution" }),
      maximoReferencias: 10,
      notas: `${DOCS} (market/seedream/5-pro-image-to-image).`,
    }),

    // ── Flux 2 ──────────────────────────────────────────────────────────────────────────────────────────
    "flux-2/pro-image-to-image": familiaDeImagen({
      nombre: "Flux 2 Pro",
      clave: "flux-2-pro",
      variantes: variantesDe(["1K", "2K"]),
      montar: imagenConReferencia({ campoDeUrls: "input_urls", campoDeResolucion: "resolution" }),
      maximoReferencias: 10,
      notas: `${DOCS} (market/flux2/pro-image-to-image). Recibe la referencia por «input_urls».`,
    }),

    "flux-2/flex-image-to-image": familiaDeImagen({
      nombre: "Flux 2 Flex",
      clave: "flux-2-flex",
      variantes: variantesDe(["1K", "2K"]),
      montar: imagenConReferencia({ campoDeUrls: "input_urls", campoDeResolucion: "resolution" }),
      maximoReferencias: 10,
      notas: `${DOCS} (market/flux2/flex-image-to-image).`,
    }),

    // ── Ideogram ────────────────────────────────────────────────────────────────────────────────────────
    /**
     * Ideogram Character está pensado justo para esto: mantener a **la misma persona** entre imágenes a partir
     * de sus fotos. Cobra por velocidad de render, que es lo que aquí llamamos calidad.
     *
     * `ideogram/v3-edit` y `ideogram/character-edit` **no** están: su API exige `mask_url` (la zona que hay que
     * repintar) y Escenara no dibuja máscaras, así que no se podría montar su entrada.
     */
    "ideogram/character": familiaDeImagen({
      nombre: "Ideogram Character",
      clave: "ideogram-character",
      variantes: variantesPorCalidad(["TURBO", "BALANCED", "QUALITY"]),
      montar: imagenConReferencia({ campoDeUrls: "reference_image_urls", campoDeCalidad: "rendering_speed" }),
      maximoReferencias: 3,
      proporciones: [],
      notas: `${DOCS} (market/ideogram/character). No acepta «aspect_ratio»: la proporción sale de «image_size».`,
    }),

    "ideogram/character-remix": familiaDeImagen({
      nombre: "Ideogram Character Remix",
      clave: "ideogram-character-remix",
      variantes: variantesPorCalidad(["TURBO", "BALANCED", "QUALITY"]),
      montar: imagenConReferencia({ campoDeUrls: "reference_image_urls", campoDeCalidad: "rendering_speed" }),
      maximoReferencias: 3,
      proporciones: [],
      notas: `${DOCS} (market/ideogram/character-remix).`,
    }),

    // ── Qwen ────────────────────────────────────────────────────────────────────────────────────────────
    "qwen/image-edit": familiaDeImagen({
      nombre: "Qwen Image Edit",
      clave: "qwen-image-edit",
      variantes: variantesDe([""]),
      montar: imagenConReferencia({ campoDeUrls: "image_url" }),
      maximoReferencias: 1,
      proporciones: [],
      notas: `${DOCS} (market/qwen/image-edit). Una sola referencia, por «image_url».`,
    }),

    "qwen2/image-edit": familiaDeImagen({
      nombre: "Qwen 2 Image Edit",
      clave: "qwen-2",
      variantes: variantesDe([""]),
      montar: imagenConReferencia({ campoDeUrls: "image_url" }),
      maximoReferencias: 1,
      proporciones: [],
      notas: `${DOCS} (market/qwen2/image-edit). Una sola referencia, por «image_url».`,
    }),

    "qwen3/image-to-image": familiaDeImagen({
      nombre: "Qwen Image 3.0",
      clave: "qwen-3",
      variantes: variantesDe(["1K", "2K"]),
      montar: imagenConReferencia({ campoDeUrls: "image_urls", campoDeResolucion: "resolution" }),
      maximoReferencias: 10,
      proporciones: [],
      notas: `${DOCS} (market/qwen3/image-to-image). Las dos resoluciones cuestan lo mismo.`,
    }),

    "qwen3/pro-image-to-image": familiaDeImagen({
      nombre: "Qwen Image 3.0 Pro",
      clave: "qwen-3-pro",
      variantes: variantesDe(["1K", "2K"]),
      montar: imagenConReferencia({ campoDeUrls: "image_urls", campoDeResolucion: "resolution" }),
      maximoReferencias: 10,
      proporciones: [],
      notas: `${DOCS} (market/qwen3-pro/image-to-image).`,
    }),
    // ── Texto a imagen (0.23.4) ─────────────────────────────────────────────────────────────────────────
    /**
     * Los gemelos **texto a imagen** de las mismas familias. Existen porque hay generaciones que no parten de
     * ninguna foto —el retrato candidato de un personaje inventado, o «Crear» sin imagen— y pedírselo a un
     * modelo de edición sin referencia es pedirle que edite algo que no existe.
     *
     * Cada identificador es el `model` que publica la documentación de su página (docs.kie.ai, comprobado el
     * 2026-09-28) y coincide con el `?model=` de la tabla pública de precios. Reciben lo mismo que su gemelo
     * de edición **menos las referencias**.
     */
    "gpt-image-2-text-to-image": familiaSinReferencia({
      nombre: "GPT Image 2 (texto a imagen)",
      clave: "gpt-image-2",
      variantes: variantesDe(["1K", "2K", "4K"]),
      montar: imagenDeTexto({ campoDeResolucion: "resolution" }),
      notas: `${DOCS} (market/gpt/gpt-image-2-text-to-image).`,
    }),

    "gpt-image-2-5-flare-text-to-image": familiaSinReferencia({
      nombre: "GPT Image 2.5 Flare (texto a imagen)",
      clave: "gpt-image-2-5-flare",
      variantes: variantesDe(["1K", "2K", "4K"]),
      montar: imagenDeTexto({ campoDeResolucion: "resolution" }),
      notas: `${DOCS} (market/gpt/gpt-image-2-5-flare-text-to-image).`,
    }),

    "gpt-image-2-5-sunburst-text-to-image": familiaSinReferencia({
      nombre: "GPT Image 2.5 Sunburst (texto a imagen)",
      clave: "gpt-image-2-5-sunburst",
      variantes: variantesDe(["1K", "2K", "4K"]),
      montar: imagenDeTexto({ campoDeResolucion: "resolution" }),
      notas: `${DOCS} (market/gpt/gpt-image-2-5-sunburst-text-to-image).`,
    }),

    "gpt-image/1.5-text-to-image": familiaSinReferencia({
      nombre: "GPT Image 1.5 (texto a imagen)",
      clave: "gpt-image-1-5",
      variantes: variantesPorCalidad(["medium", "high"]),
      montar: imagenDeTexto({ campoDeCalidad: "quality" }),
      proporciones: ["2:3"],
      notas: `${DOCS} (market/gpt-image/1-5-text-to-image). Solo admite 1:1, 2:3 y 3:2: su vertical es 2:3.`,
    }),

    "seedream/4.5-text-to-image": familiaSinReferencia({
      nombre: "Seedream 4.5 (texto a imagen)",
      clave: "seedream-4-5",
      // El proveedor publica una sola tarifa, sin calificador: la variante es «la imagen» y la calidad se
      // fija en «basic», que es su valor por defecto documentado.
      variantes: variantesDe([""]),
      montar: (contexto, _variante, parametros) =>
        imagenDeTexto({ campoDeCalidad: "quality" })(contexto, { resolucion: "", calidad: "basic" }, parametros),
      notas: `${DOCS} (market/seedream/4-5-text-to-image). Tarifa única.`,
    }),

    "seedream/5-lite-text-to-image": familiaSinReferencia({
      nombre: "Seedream 5.0 Lite (texto a imagen)",
      clave: "seedream-5-lite",
      // El proveedor publica una sola tarifa, sin calificador: la variante es «la imagen» y la calidad se
      // fija en «basic», que es su valor por defecto documentado.
      variantes: variantesDe([""]),
      montar: (contexto, _variante, parametros) =>
        imagenDeTexto({ campoDeCalidad: "quality" })(contexto, { resolucion: "", calidad: "basic" }, parametros),
      notas: `${DOCS} (market/seedream/5-lite-text-to-image). Tarifa única.`,
    }),

    /**
     * Seedream 5 Pro publica su precio por resolución (1K y 2K) pero su API lo pide por **calidad**: `basic`
     * saca 1K y `high` saca 2K (docs.kie.ai/market/seedream/5-pro-text-to-image). La variante se guarda por
     * resolución, que es como se cobra, y el constructor la traduce a la palabra que espera el modelo.
     */
    "seedream/5-pro-text-to-image": familiaSinReferencia({
      nombre: "Seedream 5.0 Pro (texto a imagen)",
      clave: "seedream-5-pro",
      variantes: variantesDe(["1K", "2K"]),
      montar: (contexto, variante, parametros) =>
        imagenDeTexto({ campoDeCalidad: "quality" })(
          contexto,
          { resolucion: "", calidad: variante.resolucion === "2K" ? "high" : "basic" },
          parametros,
        ),
      notas: `${DOCS} (market/seedream/5-pro-text-to-image). 1K se pide con «basic» y 2K con «high».`,
    }),

    "flux-2/pro-text-to-image": familiaSinReferencia({
      nombre: "Flux 2 Pro (texto a imagen)",
      clave: "flux-2-pro",
      variantes: variantesDe(["1K", "2K"]),
      montar: imagenDeTexto({ campoDeResolucion: "resolution" }),
      notas: `${DOCS} (market/flux2/pro-text-to-image).`,
    }),

    "flux-2/flex-text-to-image": familiaSinReferencia({
      nombre: "Flux 2 Flex (texto a imagen)",
      clave: "flux-2-flex",
      variantes: variantesDe(["1K", "2K"]),
      montar: imagenDeTexto({ campoDeResolucion: "resolution" }),
      notas: `${DOCS} (market/flux2/flex-text-to-image).`,
    }),

    "qwen3/text-to-image": familiaSinReferencia({
      nombre: "Qwen Image 3.0 (texto a imagen)",
      clave: "qwen-3",
      variantes: variantesDe(["1K", "2K"]),
      montar: imagenDeTexto({ campoDeResolucion: "resolution", campoDeProporcion: "image_size" }),
      proporciones: [],
      notas: `${DOCS} (market/qwen3/text-to-image). La proporción va por «image_size».`,
    }),

    "qwen3/pro-text-to-image": familiaSinReferencia({
      nombre: "Qwen Image 3.0 Pro (texto a imagen)",
      clave: "qwen-3-pro",
      variantes: variantesDe(["1K", "2K"]),
      montar: imagenDeTexto({ campoDeResolucion: "resolution", campoDeProporcion: "image_size" }),
      proporciones: [],
      notas: `${DOCS} (market/qwen3-pro/text-to-image). La proporción va por «image_size».`,
    }),

    "qwen2/text-to-image": familiaSinReferencia({
      nombre: "Qwen 2 (texto a imagen)",
      clave: "qwen-2",
      variantes: variantesDe([""]),
      montar: imagenDeTexto({ campoDeProporcion: "image_size" }),
      proporciones: [],
      notas: `${DOCS} (market/qwen2/text-to-image). Tarifa única; la proporción va por «image_size».`,
    }),

    /**
     * Ideogram v3 no acepta `aspect_ratio` ni una proporción libre: su formato son nombres propios
     * (`portrait_16_9` es el vertical), así que se envía ese y la familia no declara proporciones.
     */
    "ideogram/v3-text-to-image": familiaSinReferencia({
      nombre: "Ideogram v3 (texto a imagen)",
      clave: "ideogram-v3",
      variantes: variantesPorCalidad(["TURBO", "BALANCED", "QUALITY"]),
      montar: (contexto, variante) => ({
        prompt: promptFotograma(contexto.escena),
        image_size: "portrait_16_9",
        ...(variante.calidad === "" ? {} : { rendering_speed: variante.calidad }),
      }),
      proporciones: [],
      notas: `${DOCS} (market/ideogram/v3-text-to-image). El formato vertical es «portrait_16_9».`,
    }),
  }),
);

/** Campos por los que una familia de imagen puede recibir URL temporales del proveedor. */
export const CAMPOS_DE_URL_DE_FAMILIA = ["image_input", "reference_image_urls"] as const;

export const familiaDe = (modelo: string): Familia | undefined => FAMILIAS.get(modelo);

/**
 * Variante que corresponde a una tarifa publicada, o `null` si esta instalación no ofrece esa. Compara sin
 * distinguir mayúsculas porque KIE escribe la misma resolución de las dos formas («1k» y «1K») según el modelo.
 */
export function varianteDeTarifa(familia: Familia, tarifa: VarianteTarifa): VarianteFamilia | null {
  const igual = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return (
    familia.variantes.find((v) => igual(v.resolucion, tarifa.resolucion) && igual(v.calidad, tarifa.calidad)) ?? null
  );
}

/**
 * Unidad con la que se registra el precio de una variante: es lo que se ve en la ficha («imagen a 2K») y lo que
 * distingue una tarifa de otra en el registro de precios, que está unívoco por proveedor, modelo y unidad.
 */
export function unidadDeVariante(variante: VarianteFamilia): string {
  if (variante.resolucion !== "") return `imagen a ${variante.resolucion}`;
  if (variante.calidad !== "") return `imagen en calidad ${variante.calidad}`;
  return "imagen";
}

/** Parámetros del catálogo para una familia y la variante que tiene elegida. */
export function parametrosDeFamilia(familia: Familia, variante: VarianteFamilia): ParametrosModelo {
  return {
    duraciones: [],
    proporciones: [...familia.proporciones],
    resoluciones: variante.resolucion === "" ? [] : [variante.resolucion],
    formatosReferencia: [...familia.formatosReferencia],
    maximoReferencias: familia.maximoReferencias,
  };
}

/**
 * Variante que nombra una unidad registrada. Es la inversa exacta de {@link unidadDeVariante}: la unidad es lo
 * que se ha cobrado y lo que se ha confirmado, así que es ella la que manda sobre lo que se envía.
 */
export function varianteDeUnidad(unidad: string): VarianteFamilia {
  const resolucion = /^imagen a (.+)$/.exec(unidad.trim());
  if (resolucion?.[1]) return { resolucion: resolucion[1], calidad: "" };
  const calidad = /^imagen en calidad (.+)$/.exec(unidad.trim());
  if (calidad?.[1]) return { resolucion: "", calidad: calidad[1] };
  return { resolucion: "", calidad: "" };
}

/**
 * **Gemelo texto a imagen** de un modelo: el mismo motor, pero sin imagen de partida.
 *
 * Es lo que se usa cuando hay que generar sin foto (el retrato de un personaje inventado, «Crear» sin
 * imagen): en lugar de saltar a un modelo cualquiera, se busca el hermano de la familia que el usuario ya
 * tenía elegida, para que la imagen salga del motor que él escogió. Un modelo que ya sabe generar sin
 * referencia (nano banana) es su propio gemelo.
 */
export function gemeloDeTextoAImagen(modelo: string): string | null {
  const familia = familiaDe(modelo);
  if (!familia) return null;
  if (familia.capacidades.includes("text_to_image")) return modelo;
  for (const [id, otra] of FAMILIAS) {
    if (otra.clave === familia.clave && otra.capacidades.includes("text_to_image")) return id;
  }
  return null;
}

/**
 * **Familias de vídeo con duración tarifada** (0.23.4). Su entrada la monta el constructor medido de
 * `entradas.ts`; lo que declaran aquí es **qué duraciones admiten y a qué resolución las publica el
 * proveedor**, que es lo que permite registrar una tarifa por duración en lugar de una sola.
 *
 * Por qué importa: hasta la 0.23.3 el catálogo solo tenía la duración medida (4 s en Gemini Omni) y el resto
 * de la interfaz seguía hablando de clips de 8 s. Con la tabla publicada, cada duración tiene su precio
 * exacto —63, 84, 105 y 126 créditos a 4, 6, 8 y 10 s en 720p, comprobado el 2026-09-28— y los 63 de 4 s son
 * **los mismos que se pagaron de verdad**. Así se pueden ofrecer las cuatro sin inventar ninguna tarifa.
 */
export interface FamiliaDeVideo {
  nombre: string;
  clave: string;
  capacidades: readonly Capacidad[];
  /** Resolución cuyas tarifas se importan, con la grafía del proveedor. */
  resolucion: string;
  /** Duraciones que admite el modelo y que la tabla publicada tarifa una a una. */
  duraciones: readonly number[];
  notas: string;
}

export const FAMILIAS_DE_VIDEO = new Map<string, FamiliaDeVideo>(
  Object.entries({
    "google/gemini-omni-flash-1-1": {
      nombre: "Gemini Omni 1.1 Flash",
      clave: "gemini-omni-flash-1-1",
      capacidades: ["image_to_video", "text_to_video"] as const,
      resolucion: "720p",
      duraciones: [4, 6, 8, 10] as const,
      notas:
        "Duraciones y tarifas publicadas por KIE el 2026-09-28 (kie.ai/gemini-omni-1-1-flash): 63, 84, 105 y 126 créditos a 4, 6, 8 y 10 s en 720p. Los 63 de 4 s coinciden con lo que cobró de verdad.",
    },
    "gemini-omni-video": {
      nombre: "Gemini Omni",
      clave: "gemini-omni-video",
      capacidades: ["image_to_video", "text_to_video"] as const,
      resolucion: "720p",
      duraciones: [4, 6, 8, 10] as const,
      notas:
        "Duraciones y tarifas publicadas por KIE el 2026-09-28 (kie.ai/gemini-omni): las mismas cifras que su hermano Flash, con los 63 de 4 s medidos con dinero real.",
    },
  }),
);

export const familiaDeVideoDe = (modelo: string): FamiliaDeVideo | undefined => FAMILIAS_DE_VIDEO.get(modelo);

/** Unidad con la que se registra el precio de un clip de esa duración. Es lo que se cobra y lo que se confirma. */
export const unidadDeClip = (segundos: number, resolucion: string): string =>
  resolucion === "" ? `clip de ${segundos} s` : `clip de ${segundos} s a ${resolucion}`;
