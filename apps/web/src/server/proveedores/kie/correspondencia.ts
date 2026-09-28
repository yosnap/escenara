import type { TarifaKie } from "./precios-publicos";

/**
 * De la **descripción** de una tarifa pública al **identificador de la API** y a la variante concreta que se
 * está pagando (0.23.0).
 *
 * El problema que resuelve: `modelDescription` («gpt image 2, image-to-image, 1k») no es lo que espera
 * `jobs/createTask`. La correspondencia sale de dos sitios, los dos comprobados contra `docs.kie.ai` el
 * 2026-09-28:
 *
 * 1. el parámetro `model` del `anchor` **es** el identificador de la API (`?model=seedream%2F4.5-edit` →
 *    `seedream/4.5-edit`). Cubre 215 de los 379 registros de imagen y vídeo y es la fuente preferente;
 * 2. para los registros cuyo `anchor` no lo lleva, una tabla corta de **página del market → identificador**,
 *    escrita a partir del `model` que publica la documentación de cada modelo.
 *
 * Lo que no se resuelve por ninguna de las dos **no se importa**: un identificador adivinado se enviaría a
 * `jobs/createTask` y lo pagaría el usuario.
 */

/** Variante que se está pagando: lo que hace que un mismo modelo tenga varios precios. */
export interface VarianteTarifa {
  /** Resolución con la grafía del proveedor («1K», «768p»); vacío si su precio no depende de ella. */
  resolucion: string;
  /** Calidad o velocidad de render («QUALITY», «medium», «basic»); vacío si no aplica. */
  calidad: string;
  /** Duración en segundos que publica el registro; `0` si no la dice. */
  segundos: number;
}

/**
 * Clase de trabajo que describe la tarifa. **No decide la capacidad del modelo**: eso lo declara la familia
 * (`familias.ts`), que es lo que de verdad se ha leído en la documentación. Aquí solo sirve para dos cosas:
 * distinguir «texto a imagen» de «imagen a imagen» —desde la 0.23.4 las dos se importan, porque hay
 * generaciones que no parten de ninguna foto— y elegir la entrada correcta cuando una página del market
 * ofrece varias.
 */
export const OPERACIONES = ["image-to-image", "text-to-image", "image-to-video", "text-to-video"] as const;
export type Operacion = (typeof OPERACIONES)[number];

/** Una tarifa pública ya traducida a lenguaje de Escenara. */
export interface TarifaTraducida {
  /** Identificador exacto de `jobs/createTask`. */
  modelo: string;
  operacion: Operacion;
  variante: VarianteTarifa;
  /** Créditos por la unidad que publica el proveedor (no por trabajo: eso lo resuelve el importador). */
  creditos: number;
  /** «per image», «per second», «per video»… tal cual lo publica KIE. */
  unidadPublicada: string;
  /** Nombre legible que da KIE al modelo («gpt image 2»). */
  nombre: string;
  ancla: string;
}

/**
 * Páginas del market cuyo `anchor` no lleva `model=`, con el identificador de la API que publica su
 * documentación. La clave es «ruta de la página» o «ruta + operación» cuando una página ofrece varias.
 *
 * Solo están las familias que esta instalación sabe pedir: una entrada aquí sin constructor detrás no
 * serviría para nada, y una entrada inventada costaría dinero.
 */
const MODELO_POR_PAGINA: Record<string, string> = {
  // Comprobados en docs.kie.ai el 2026-09-28, cada uno en el `"model"` de su ejemplo de `createTask`.
  // Una página que ofrece las dos formas lleva la operación en la clave: su `anchor` no las distingue.
  "/gpt-image-2-5#text-to-image": "gpt-image-2-5-flare-text-to-image",
  "/nano-banana-2-lite": "nano-banana-2-lite",
  "/nano-banana-2": "nano-banana-2",
  "/nano-banana-pro": "nano-banana-pro",
  "/qwen/image-edit": "qwen/image-edit",
  "/qwen-image-2": "qwen2/image-edit",
  "/seedream-5-0-pro": "seedream/5-pro-image-to-image",
  "/ideogram/character": "ideogram/character",
  "/gpt-image-2-5": "gpt-image-2-5-flare-image-to-image",
  "/gemini-omni": "gemini-omni-video",
  "/gemini-omni-1-1-flash": "google/gemini-omni-flash-1-1",
  "/minimax-h3": "minimax-h3/reference-to-video",
};

/**
 * Calificadores que **no** son el precio de generar, sino un recargo o una forma de pedir que esta instalación
 * no usa: la imagen de entrada de Qwen 3, Seedream 5 Pro y MiniMax H3, y el vídeo de entrada de MiniMax H3 y
 * de Gemini Omni. Importarlos como si fueran el precio del trabajo sería estimar de menos.
 *
 * Los anclajes son a propósito: «4s 720p no video input» de Omni sí es un precio de generar y empieza por la
 * duración, así que no lo toca ninguna de las dos.
 */
const NO_ES_GENERACION = [/^(input|image input|video input|output cache)\b/i, /\bwith video input\b/i];

const RESOLUCION = /^\d+(?:\.\d+)?[kK]$|^\d+[pP]$/;
/** Calidades y velocidades de render que nombran las descripciones, con la grafía que espera cada API. */
const CALIDADES = new Map<string, string>([
  ["turbo", "TURBO"],
  ["balanced", "BALANCED"],
  ["quality", "QUALITY"],
  ["low", "low"],
  ["medium", "medium"],
  ["high", "high"],
  ["basic", "basic"],
  ["ultra", "ultra"],
  ["standard", "standard"],
  ["pro", "pro"],
]);

/**
 * Identificador de la API a partir del `anchor`, o `null` si esta instalación no sabe cuál es. La operación
 * solo hace falta para las páginas que ofrecen varias formas del mismo modelo (texto a imagen e imagen a
 * imagen comparten página en GPT Image 2.5).
 */
export function modeloDeAncla(ancla: string, operacion?: Operacion | null): string | null {
  if (ancla === "") return null;
  let url: URL;
  try {
    url = new URL(ancla);
  } catch {
    return null;
  }
  // La documentación de KIE es la que manda: su `?model=` es literalmente el `model` de `createTask`.
  const declarado = url.searchParams.get("model");
  if (declarado !== null && declarado.trim() !== "") return declarado.trim();
  const ruta = url.pathname.replace(/\/$/, "");
  const conOperacion = operacion ? MODELO_POR_PAGINA[`${ruta}#${operacion}`] : undefined;
  return conOperacion ?? MODELO_POR_PAGINA[ruta] ?? null;
}

/** Texto normalizado para buscar una operación: minúsculas y «x to y» escrito siempre con guiones. */
const aplanar = (texto: string) =>
  texto
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+to\s+/g, "-to-")
    .replace(/\s+/g, "-");

/** Operación que nombra un texto (la descripción o el propio identificador); `null` si no nombra ninguna. */
function operacionEn(texto: string): Operacion | null {
  const plano = aplanar(texto);
  // El orden importa: «reference to video» y «first frame to video» son casos de «imagen a vídeo».
  if (/text-to-video/.test(plano)) return "text-to-video";
  if (/(image|reference|first-frame)-to-video/.test(plano)) return "image-to-video";
  if (/text-to-image/.test(plano)) return "text-to-image";
  if (/image-to-image|image-edit|edit|remix|layer-decomposition/.test(plano)) return "image-to-image";
  return null;
}

/** Resolución, calidad y duración a partir de las partes de la descripción. */
function varianteDe(partes: string[], operacion: Operacion): VarianteTarifa {
  const variante: VarianteTarifa = { resolucion: "", calidad: "", segundos: 0 };
  // «Standard-6.0s-768p», «1.0s-2K», «4s 720p no video input»: los separadores son guion y espacio.
  for (const bruto of partes.flatMap((p) => p.split(/[\s-]+/))) {
    const trozo = bruto.trim();
    if (trozo === "") continue;
    if (variante.resolucion === "" && RESOLUCION.test(trozo)) {
      variante.resolucion = trozo;
      continue;
    }
    const calidad = CALIDADES.get(trozo.toLowerCase());
    if (variante.calidad === "" && calidad) {
      variante.calidad = calidad;
      continue;
    }
    // La duración solo cuenta en vídeo: en imagen, «1.0s» es el tiempo de render, no lo que dura nada.
    const esImagen = operacion === "image-to-image" || operacion === "text-to-image";
    const segundos = esImagen ? null : /^(\d+(?:\.\d+)?)s$/.exec(trozo);
    if (variante.segundos === 0 && segundos) variante.segundos = Number(segundos[1]);
  }
  return variante;
}

/**
 * Traduce una tarifa pública. Devuelve `null` cuando no se puede trabajar con ella sin inventarse nada:
 * no es imagen ni vídeo, no es el precio de generar, su operación no es de las tres que Escenara pide, o su
 * identificador de API no se conoce.
 */
export function traducirTarifa(tarifa: TarifaKie): TarifaTraducida | null {
  if (tarifa.interfaz !== "image" && tarifa.interfaz !== "video") return null;
  const partes = tarifa.descripcion
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const [nombre, ...calificadores] = partes;
  if (!nombre || calificadores.some((c) => NO_ES_GENERACION.some((patron) => patron.test(c)))) return null;
  const declarada = operacionEn(calificadores.join(" "));
  const modelo = modeloDeAncla(tarifa.ancla, declarada);
  if (modelo === null) return null;
  /**
   * Cuando la descripción no nombra la operación («Qwen image 3.0, output, 2K», «nano-banana-2-lite, 1k»), la
   * dice el propio identificador; y si tampoco, se toma la de su interfaz. No pasa nada por quedarse corto:
   * la capacidad real de cada modelo la declara su familia, no esta línea, que solo sirve para descartar los
   * precios de «texto a imagen» y para elegir la entrada correcta de la tabla de páginas.
   */
  const operacion =
    declarada ?? operacionEn(modelo) ?? (tarifa.interfaz === "image" ? "image-to-image" : "text-to-video");
  // Un registro de imagen no puede describir un vídeo y al revés: si no cuadran, la descripción no se entiende.
  if (tarifa.interfaz === "image" && operacion !== "image-to-image" && operacion !== "text-to-image") return null;
  if (tarifa.interfaz === "video" && operacion === "image-to-image") return null;
  return {
    modelo,
    operacion,
    variante: varianteDe(calificadores, operacion),
    creditos: tarifa.creditos,
    unidadPublicada: tarifa.unidadPublicada,
    nombre,
    ancla: tarifa.ancla,
  };
}

/** Todas las tarifas que esta instalación sabe traducir, en el orden en que las publica el proveedor. */
export function traducirTarifas(tarifas: readonly TarifaKie[]): TarifaTraducida[] {
  return tarifas.flatMap((tarifa) => {
    const traducida = traducirTarifa(tarifa);
    return traducida ? [traducida] : [];
  });
}
