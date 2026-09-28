import type { AnguloVista, BriefVista, OfertaVista } from "./anuncio";
import { AYUDA_BONUS, AYUDA_GARANTIA, AYUDA_PRECIO, AYUDA_URGENCIA, TEXTO_DECLARACION_VERACIDAD } from "./anuncio";

/**
 * Lo que la **pantalla del brief** calcula sin preguntar a nadie (0.27.0).
 *
 * Es un módulo puro: no lee la base de datos, no llama a la API y no toca React. Está aparte porque son las
 * cuentas que deciden qué se le enseña y qué se confirma —el total de las variantes, si hace falta declarar
 * veracidad, qué campos de la oferta están vacíos— y esas cuentas se prueban solas, sin montar la página.
 *
 * Nada de lo que hay aquí **autoriza** nada: el servidor vuelve a comprobar la puerta del guion, el ángulo y la
 * declaración. Esto es para que el usuario vea lo mismo que el servidor va a decidir, no para decidirlo.
 */

// ── La oferta, campo a campo ────────────────────────────────────────────────────────────────────────────

/** Un campo opcional de la oferta con su nombre de pantalla y lo que se escribió. */
export interface CampoDeOferta {
  clave: "precio" | "garantia" | "urgencia" | "bonus";
  etiqueta: string;
  ayuda: string;
  valor: string;
}

const OPCIONALES: readonly Omit<CampoDeOferta, "valor">[] = [
  { clave: "precio", etiqueta: "Precio", ayuda: AYUDA_PRECIO },
  { clave: "garantia", etiqueta: "Garantía", ayuda: AYUDA_GARANTIA },
  { clave: "urgencia", etiqueta: "Urgencia", ayuda: AYUDA_URGENCIA },
  { clave: "bonus", etiqueta: "Regalo incluido", ayuda: AYUDA_BONUS },
];

/**
 * Los cuatro campos opcionales de la oferta con su valor. Se devuelven **todos**, escritos o no: la pantalla
 * enseña los vacíos diciendo que no aparecerán en el guion, que es justo lo que hay que entender antes de pedirlo.
 */
export function camposDeOferta(oferta: OfertaVista | null): CampoDeOferta[] {
  return OPCIONALES.map((campo) => ({
    ...campo,
    valor: oferta === null ? "" : oferta[campo.clave].trim(),
  }));
}

/** Los campos opcionales que están vacíos, por su nombre de pantalla. Vacío = la oferta lo dice todo. */
export const opcionalesVacios = (oferta: OfertaVista | null): string[] =>
  camposDeOferta(oferta)
    .filter((c) => c.valor === "")
    .map((c) => c.etiqueta);

// ── La declaración de veracidad ─────────────────────────────────────────────────────────────────────────

/** El texto que se acepta. Se exporta desde aquí para que la pantalla no tenga que saber de dónde sale. */
export const TEXTO_DECLARACION = TEXTO_DECLARACION_VERACIDAD;

/**
 * `true` cuando el ángulo del brief exige declarar que lo que se afirma es cierto y **todavía no hay** una
 * registrada. Es lo que decide si se pinta la casilla en la zona de claridad.
 */
export function faltaDeclaracion(brief: BriefVista | null): boolean {
  if (brief === null || brief.anguloVista === null) return false;
  return brief.anguloVista.exigeDeclaracion && !brief.declaracionRegistrada;
}

// ── Las variantes por ángulo ────────────────────────────────────────────────────────────────────────────

/** Un ángulo de la lista de variantes, tal como lo necesita la cuenta del total. */
export interface AnguloParaVariante {
  angulo: AnguloVista;
  elegible: boolean;
  /** Por qué no se puede pedir, ya redactado por el servidor. Vacío cuando sí se puede. */
  motivo: string;
  exigeDeclaracion: boolean;
}

/**
 * El total de créditos de una tanda de variantes: **una llamada de texto por variante**, ni una más. Se calcula
 * aquí y no en el servidor porque es lo que el usuario tiene delante al confirmar, y tiene que cuadrar con lo
 * que se envía: `creditosPorVariante × elegidos`.
 */
export const totalDeVariantes = (creditosPorVariante: number, elegidos: readonly string[]): number =>
  creditosPorVariante * elegidos.length;

/**
 * `true` si alguno de los ángulos elegidos afirma algo comprobable, así que la tanda entera necesita la
 * declaración de veracidad. Se pide **una vez** para todas: lo que se afirma es lo mismo en las doce.
 */
export const declaracionNecesariaEn = (angulos: readonly AnguloParaVariante[], elegidos: readonly string[]): boolean =>
  angulos.some((a) => a.exigeDeclaracion && elegidos.includes(a.angulo.clave));

/** Los ángulos elegidos que ya no se pueden pedir (el catálogo cambió mientras se elegía), por su nombre. */
export const elegidosNoElegibles = (angulos: readonly AnguloParaVariante[], elegidos: readonly string[]): string[] =>
  angulos.filter((a) => !a.elegible && elegidos.includes(a.angulo.clave)).map((a) => a.angulo.nombre);

/**
 * Lo que impide crear las variantes elegidas ahora mismo, ya redactado. Vacío = se puede pedir.
 *
 * No sustituye al servidor, que vuelve a comprobarlo todo: evita gastar una petición en algo que ya se sabe que
 * va a salir mal, y **nombra** lo que falta en lugar de deshabilitar un botón sin explicación.
 */
export function motivoParaNoCrearVariantes(
  angulos: readonly AnguloParaVariante[],
  elegidos: readonly string[],
  maximo: number,
  declaracionAceptada: boolean,
): string {
  if (elegidos.length === 0) return "Elige al menos un ángulo: cada variante es un proyecto hermano con su ángulo.";
  if (elegidos.length > maximo) {
    return `De una vez se pueden crear ${maximo} variantes como máximo, y has elegido ${elegidos.length}. Quita alguna y crea el resto después.`;
  }
  const noElegibles = elegidosNoElegibles(angulos, elegidos);
  if (noElegibles.length > 0) {
    return `Estos ángulos ya no se pueden pedir: ${noElegibles.join(", ")}. Quítalos de la selección.`;
  }
  if (declaracionNecesariaEn(angulos, elegidos) && !declaracionAceptada) {
    return "Alguno de los ángulos elegidos afirma algo que se puede comprobar, así que tienes que aceptar la declaración de veracidad antes de crearlas.";
  }
  return "";
}

// ── Firmas de lo que se confirma ────────────────────────────────────────────────────────────────────────

/**
 * Firma de la confirmación de **hooks y guion**: qué se está pagando exactamente. Mientras no cambie, la clave de
 * idempotencia es la misma, y pulsar dos veces no encarga dos peticiones (el mismo trato que el asistente de
 * 0.17.0).
 */
export const firmaDeHooks = (proyectoId: string, sello: string, creditos: number, escenas: number): string =>
  `${proyectoId}|${sello}|${creditos}|${escenas}`;

/** Firma de la confirmación **agregada** de las variantes: el precio, el total y qué ángulos se piden. */
export const firmaDeVariantes = (sello: string, creditos: number, elegidos: readonly string[]): string =>
  `${sello}|${creditos}|${[...elegidos].sort().join(",")}`;

// ── El título del hermano ───────────────────────────────────────────────────────────────────────────────

/**
 * El título con el que nace una variante: `«{título} · {Ángulo}»`. Lo compone el servidor al crearla y esto es la
 * **misma regla** para poder enseñarlo antes de crear nada. Si las dos se separaran, el usuario confirmaría un
 * nombre y vería otro, así que el recorte de la columna se aplica igual.
 */
export const TITULO_PROYECTO_MAXIMO = 200;

export const tituloDeVariante = (titulo: string, nombreAngulo: string): string =>
  `${titulo} · ${nombreAngulo}`.slice(0, TITULO_PROYECTO_MAXIMO);
