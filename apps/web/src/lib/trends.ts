import type { DireccionElegidaConAcento } from "./direccion";
import { type CategoriaPreset, ETIQUETA_CATEGORIA } from "./presets";

/**
 * **Lo que decide un trend** (0.34.0): qué duraciones admite y qué parte de la dirección del clip dicta él.
 *
 * Hasta la 0.33.x un trend fijaba una sola duración (`target_seconds`) y la exigía en todas partes, y por eso hubo
 * que duplicar trends en variantes de 5 s. Ahora la duración la manda el modelo (en «Crear») o el proyecto (en una
 * escena), y el trend solo la limita si declara **duraciones admitidas**. Vacía = cualquiera.
 *
 * Y cuando la plantilla ya dicta el encuadre («one continuous close shot»), la dirección no vuelve a preguntarlo: el
 * trend declara qué categorías **decide él**, la pantalla las enseña bloqueadas con su motivo y el servidor no las
 * compone, así que nunca hay dos cabeceras de cámara ni dos reglas que se contradigan.
 *
 * Es lógica pura, sin base de datos ni red: la usan el servidor, el navegador y los tests por igual.
 */

// ── Duraciones admitidas ────────────────────────────────────────────────────────────────────────────────

/** Tope de duraciones que puede declarar un trend. Es una lista corta de segundos, no un rango. */
export const MAXIMO_DURACIONES_ADMITIDAS = 12;
/** Mismos límites que cualquier duración de clip que acepta el servidor. */
export const DURACION_MINIMA = 1;
export const DURACION_MAXIMA = 600;

const esDuracionValida = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= DURACION_MINIMA && v <= DURACION_MAXIMA;

/**
 * Lee una lista de duraciones guardada o recibida. Lo que no sea un entero entre 1 y 600 se descarta; el resultado va
 * ordenado y sin repetir. Nunca lanza: un texto ilegible se lee como lista vacía. Las filas anteriores a la 0.34.0 no
 * llegan aquí ilegibles: la migración rellenó su lista con la duración que ya exigían.
 */
export function duracionesDe(valor: unknown): number[] {
  let lista = valor;
  if (typeof valor === "string") {
    try {
      lista = JSON.parse(valor);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(lista)) return [];
  return [...new Set(lista.filter(esDuracionValida))].sort((a, b) => a - b).slice(0, MAXIMO_DURACIONES_ADMITIDAS);
}

/** `true` cuando el trend admite esa duración. Sin lista, admite cualquiera. */
export const admiteDuracion = (admitidas: readonly number[], segundos: number | null | undefined): boolean =>
  admitidas.length === 0 || (typeof segundos === "number" && admitidas.includes(segundos));

const listaConO = (partes: readonly string[]) =>
  partes.length < 2 ? partes.join("") : `${partes.slice(0, -1).join(", ")} o ${partes[partes.length - 1]}`;

/** «cualquier duración», «6 s» o «5 o 8 s». */
export const textoDeDuraciones = (admitidas: readonly number[]): string =>
  admitidas.length === 0 ? "cualquier duración" : `${listaConO(admitidas.map(String))} s`;

/**
 * Por qué un trend no admite la duración pedida, con la que sí admite. `null` si la admite.
 *
 * `donde` dice de dónde sale la duración pedida, para que el mensaje señale qué cambiar: la del proyecto o la elegida
 * con el modelo.
 */
export function motivoDuracionNoAdmitida(
  trend: { nombre: string; duracionesAdmitidas: readonly number[] },
  segundos: number | null | undefined,
  donde: "proyecto" | "clip" = "clip",
): string | null {
  if (admiteDuracion(trend.duracionesAdmitidas, segundos)) return null;
  const admite = textoDeDuraciones(trend.duracionesAdmitidas);
  if (segundos === null || segundos === undefined)
    return `El trend «${trend.nombre}» solo admite clips de ${admite}: elige una de esas duraciones.`;
  return donde === "proyecto"
    ? `El trend «${trend.nombre}» solo admite clips de ${admite} y el proyecto está configurado a ${segundos} s. Cambia la duración del proyecto o elige otro trend.`
    : `El trend «${trend.nombre}» solo admite clips de ${admite} y has pedido ${segundos} s. Elige una de esas duraciones.`;
}

/**
 * La duración con la que se estima un trend en «Crear»: sin lista, la que ya estaba si el modelo la cobra (si no, la
 * del modelo: `undefined`); con lista, la actual si está en ella y el modelo la cobra, si no la primera de la lista que
 * el modelo cobre, y si no, la primera de la lista (el servidor dirá entonces por qué no se puede).
 *
 * `cobrables` son las duraciones con tarifa del modelo; vacía = cobra igual dure lo que dure.
 */
export function segundosParaTrend(
  admitidas: readonly number[],
  cobrables: readonly number[],
  actuales: number | undefined,
): number | undefined {
  const cobra = (s: number) => cobrables.length === 0 || cobrables.includes(s);
  if (admitidas.length === 0) return actuales !== undefined && cobra(actuales) ? actuales : undefined;
  if (actuales !== undefined && admitidas.includes(actuales) && cobra(actuales)) return actuales;
  return admitidas.find(cobra) ?? admitidas[0];
}

// ── Lo que la dirección deja en manos del trend ─────────────────────────────────────────────────────────

/**
 * Categorías de la dirección del clip que un trend puede decidir. Son las que **compone el bloque de cámara y el gesto
 * del clip**: el encuadre, desde dónde se mira, el movimiento, el gesto y el acabado de la toma.
 *
 * No están, y es a propósito:
 *
 * - el formato del clip y la voz: si se habla lo decide ya «permite habla» del trend;
 * - el acento, el matiz de voz y las instrucciones escritas: describen quién habla y lo que el usuario añade, no el
 *   plano;
 * - la óptica, la luz y el sitio: son del fotograma, no del clip, y el trend no compone el fotograma.
 */
export const CATEGORIAS_DECIDIBLES = ["plano", "angulo", "camara", "microaccion", "registro-estetico"] as const;
export type CategoriaDecidible = (typeof CATEGORIAS_DECIDIBLES)[number] & CategoriaPreset;

export const esCategoriaDecidible = (v: unknown): v is CategoriaDecidible =>
  CATEGORIAS_DECIDIBLES.includes(v as CategoriaDecidible);

export const etiquetaDecidible = (categoria: CategoriaDecidible): string => ETIQUETA_CATEGORIA[categoria];

/** Explicación del campo en el admin: qué pasa al marcar una categoría. */
export const AYUDA_DIRECCION_DECIDIDA =
  "Marca lo que el texto del trend ya dicta. Con este trend elegido, esas opciones salen bloqueadas en la dirección del clip con el motivo «Lo decide el trend» y no se envían al modelo aunque llegaran en la petición; el resto sigue libre. Ante la duda, no la marques.";

export const AYUDA_DURACIONES_ADMITIDAS =
  "Segundos separados por comas, por ejemplo «5, 8». Vacío = cualquier duración: manda la del modelo en Crear y la del proyecto en una escena. Con valores, solo se podrá usar con esas duraciones.";

/**
 * Lee la lista de categorías que decide un trend. Descarta lo que no sea una categoría decidible y devuelve el orden
 * canónico (el de {@link CATEGORIAS_DECIDIBLES}), así que la misma elección se guarda siempre igual.
 */
export function categoriasDecididasDe(valor: unknown): CategoriaDecidible[] {
  let lista = valor;
  if (typeof valor === "string") {
    try {
      lista = JSON.parse(valor);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(lista)) return [];
  return CATEGORIAS_DECIDIBLES.filter((c) => lista.includes(c));
}

/** El motivo que se lee en cada categoría bloqueada. */
export const motivoDecididaPorTrend = (nombreTrend: string): string => `Lo decide el trend «${nombreTrend}»`;

/** Qué campo de la dirección elegida corresponde a cada categoría decidible. */
const CAMPO_DE_CATEGORIA = {
  plano: "plano",
  angulo: "angulo",
  camara: "camara",
  microaccion: "microaccion",
  "registro-estetico": "registroEstetico",
} as const satisfies Record<CategoriaDecidible, keyof DireccionElegidaConAcento>;

export const campoDeCategoria = (categoria: CategoriaDecidible) => CAMPO_DE_CATEGORIA[categoria];

/**
 * La dirección elegida **sin lo que decide el trend**: las claves de catálogo se vacían (el gesto con su momento vuelve
 * al de fábrica) y el registro estético se deja como estaba, porque es un enumerado y quien compone ya no lo lee.
 *
 * Es lo que se enseña en el resumen y lo que se podría guardar; la garantía de que no llega al modelo la da el
 * servidor, que aplica la misma regla al componer.
 */
export function eleccionSinLoDecidido(
  direccion: DireccionElegidaConAcento,
  decididas: readonly CategoriaDecidible[],
): DireccionElegidaConAcento {
  if (decididas.length === 0) return direccion;
  const limpia = { ...direccion };
  if (decididas.includes("plano")) limpia.plano = "";
  if (decididas.includes("angulo")) limpia.angulo = "";
  if (decididas.includes("camara")) limpia.camara = "";
  if (decididas.includes("microaccion")) {
    limpia.microaccion = "";
    limpia.momentoMicroaccion = "durante";
  }
  return limpia;
}

/** Por qué no hay modo experto con un trend: su texto ya describe el clip y el servidor lo rechazaría. */
export const sinExpertoConTrend = (nombreTrend: string): string =>
  `No se puede con el trend «${nombreTrend}»: su texto ya describe el clip.`;
