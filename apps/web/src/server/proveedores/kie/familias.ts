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
    // Un modelo que solo admite una referencia la recibe suelta, no en una lista: son campos distintos.
    if (opciones.campoDeUrls === "image_url") entrada.image_url = urls[0] ?? "";
    else entrada[opciones.campoDeUrls] = urls;
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
  variantes: readonly VarianteFamilia[];
  montar: ConstructorFamilia;
  maximoReferencias: number;
  formatosReferencia?: readonly string[];
  proporciones?: readonly string[];
  notas: string;
}): Familia {
  return {
    nombre: familia.nombre,
    capacidades: ["image_edit"],
    variantes: familia.variantes,
    proporciones: familia.proporciones ?? PROPORCIONES,
    formatosReferencia: familia.formatosReferencia ?? FORMATOS,
    maximoReferencias: familia.maximoReferencias,
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
      variantes: variantesDe(["1K", "2K", "4K"]),
      montar: imagenConReferencia({ campoDeUrls: "input_urls", campoDeResolucion: "resolution" }),
      maximoReferencias: 1,
      notas: `${DOCS} (market/gpt/gpt-image-2-image-to-image). Recibe la referencia por «input_urls».`,
    }),

    "gpt-image-2-5-flare-image-to-image": familiaDeImagen({
      nombre: "GPT Image 2.5 Flare",
      variantes: variantesDe(["1K", "2K", "4K"]),
      montar: imagenConReferencia({ campoDeUrls: "input_urls", campoDeResolucion: "resolution" }),
      maximoReferencias: 1,
      notas: `${DOCS} (market/gpt/gpt-image-2-5-flare-image-to-image).`,
    }),

    "gpt-image-2-5-sunburst-image-to-image": familiaDeImagen({
      nombre: "GPT Image 2.5 Sunburst",
      variantes: variantesDe(["1K", "2K", "4K"]),
      montar: imagenConReferencia({ campoDeUrls: "input_urls", campoDeResolucion: "resolution" }),
      maximoReferencias: 1,
      notas: `${DOCS} (market/gpt/gpt-image-2-5-sunburst-image-to-image).`,
    }),

    /** GPT Image 1.5 cobra por **calidad** (`medium` o `high`), no por resolución. */
    "gpt-image/1.5-image-to-image": familiaDeImagen({
      nombre: "GPT Image 1.5",
      variantes: variantesPorCalidad(["medium", "high"]),
      montar: imagenConReferencia({ campoDeUrls: "input_urls", campoDeCalidad: "quality" }),
      maximoReferencias: 1,
      proporciones: ["2:3"],
      notas: `${DOCS} (market/gpt-image/1-5-image-to-image). Solo admite 1:1, 2:3 y 3:2, así que su vertical es 2:3.`,
    }),

    // ── Nano Banana ─────────────────────────────────────────────────────────────────────────────────────
    "nano-banana-2-lite": familiaDeImagen({
      nombre: "Nano Banana 2 Lite",
      variantes: variantesDe(["1K"]),
      montar: imagenConReferencia({ campoDeUrls: "image_urls" }),
      maximoReferencias: 10,
      notas: `${DOCS} (market/google/nano-banana-2-lite). Tarifa única: no cobra por resolución.`,
    }),

    /** Nano Banana 2 y Pro reciben las referencias por **`image_input`**, no por `image_urls`. */
    "nano-banana-2": familiaDeImagen({
      nombre: "Nano Banana 2",
      variantes: variantesDe(["1K", "2K", "4K"]),
      montar: imagenConReferencia({ campoDeUrls: "image_input", campoDeResolucion: "resolution" }),
      maximoReferencias: 10,
      notas: `${DOCS} (market/google/nanobanana2). Recibe las referencias por «image_input».`,
    }),

    "nano-banana-pro": familiaDeImagen({
      nombre: "Nano Banana Pro",
      variantes: variantesDe(["1K", "4K"]),
      montar: imagenConReferencia({ campoDeUrls: "image_input", campoDeResolucion: "resolution" }),
      maximoReferencias: 10,
      notas: `${DOCS} (market/google/pro-image-to-image). 1K y 2K cuestan lo mismo, así que solo se ofrece 1K.`,
    }),

    "google/nano-banana-edit": familiaDeImagen({
      nombre: "Nano Banana Edit",
      variantes: variantesDe([""]),
      montar: imagenConReferencia({ campoDeUrls: "image_urls" }),
      maximoReferencias: 10,
      notas: `${DOCS} (market/google/nano-banana-edit). Tarifa única.`,
    }),

    // ── Seedream ────────────────────────────────────────────────────────────────────────────────────────
    "seedream/4.5-edit": familiaDeImagen({
      nombre: "Seedream 4.5",
      variantes: [{ resolucion: "", calidad: "basic" }],
      montar: imagenConReferencia({ campoDeUrls: "image_urls", campoDeCalidad: "quality" }),
      maximoReferencias: 10,
      notas: `${DOCS} (market/seedream/4-5-edit). Tarifa única.`,
    }),

    "seedream/5-lite-image-to-image": familiaDeImagen({
      nombre: "Seedream 5.0 Lite",
      variantes: variantesPorCalidad(["basic", "high", "ultra"]),
      montar: imagenConReferencia({ campoDeUrls: "image_urls", campoDeCalidad: "quality" }),
      maximoReferencias: 10,
      notas: `${DOCS} (market/seedream-5-lite-image-to-image). Tarifa única para las tres calidades.`,
    }),

    "seedream/5-pro-image-to-image": familiaDeImagen({
      nombre: "Seedream 5.0 Pro",
      variantes: variantesDe(["1K", "2K"]),
      montar: imagenConReferencia({ campoDeUrls: "image_urls", campoDeResolucion: "resolution" }),
      maximoReferencias: 10,
      notas: `${DOCS} (market/seedream/5-pro-image-to-image).`,
    }),

    // ── Flux 2 ──────────────────────────────────────────────────────────────────────────────────────────
    "flux-2/pro-image-to-image": familiaDeImagen({
      nombre: "Flux 2 Pro",
      variantes: variantesDe(["1K", "2K"]),
      montar: imagenConReferencia({ campoDeUrls: "input_urls", campoDeResolucion: "resolution" }),
      maximoReferencias: 10,
      notas: `${DOCS} (market/flux2/pro-image-to-image). Recibe la referencia por «input_urls».`,
    }),

    "flux-2/flex-image-to-image": familiaDeImagen({
      nombre: "Flux 2 Flex",
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
      variantes: variantesPorCalidad(["TURBO", "BALANCED", "QUALITY"]),
      montar: imagenConReferencia({ campoDeUrls: "reference_image_urls", campoDeCalidad: "rendering_speed" }),
      maximoReferencias: 3,
      proporciones: [],
      notas: `${DOCS} (market/ideogram/character). No acepta «aspect_ratio»: la proporción sale de «image_size».`,
    }),

    "ideogram/character-remix": familiaDeImagen({
      nombre: "Ideogram Character Remix",
      variantes: variantesPorCalidad(["TURBO", "BALANCED", "QUALITY"]),
      montar: imagenConReferencia({ campoDeUrls: "reference_image_urls", campoDeCalidad: "rendering_speed" }),
      maximoReferencias: 3,
      proporciones: [],
      notas: `${DOCS} (market/ideogram/character-remix).`,
    }),

    // ── Qwen ────────────────────────────────────────────────────────────────────────────────────────────
    "qwen/image-edit": familiaDeImagen({
      nombre: "Qwen Image Edit",
      variantes: variantesDe([""]),
      montar: imagenConReferencia({ campoDeUrls: "image_url" }),
      maximoReferencias: 1,
      proporciones: [],
      notas: `${DOCS} (market/qwen/image-edit). Una sola referencia, por «image_url».`,
    }),

    "qwen2/image-edit": familiaDeImagen({
      nombre: "Qwen 2 Image Edit",
      variantes: variantesDe([""]),
      montar: imagenConReferencia({ campoDeUrls: "image_url" }),
      maximoReferencias: 1,
      proporciones: [],
      notas: `${DOCS} (market/qwen2/image-edit). Una sola referencia, por «image_url».`,
    }),

    "qwen3/image-to-image": familiaDeImagen({
      nombre: "Qwen Image 3.0",
      variantes: variantesDe(["1K", "2K"]),
      montar: imagenConReferencia({ campoDeUrls: "image_urls", campoDeResolucion: "resolution" }),
      maximoReferencias: 10,
      proporciones: [],
      notas: `${DOCS} (market/qwen3/image-to-image). Las dos resoluciones cuestan lo mismo.`,
    }),

    "qwen3/pro-image-to-image": familiaDeImagen({
      nombre: "Qwen Image 3.0 Pro",
      variantes: variantesDe(["1K", "2K"]),
      montar: imagenConReferencia({ campoDeUrls: "image_urls", campoDeResolucion: "resolution" }),
      maximoReferencias: 10,
      proporciones: [],
      notas: `${DOCS} (market/qwen3-pro/image-to-image).`,
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
