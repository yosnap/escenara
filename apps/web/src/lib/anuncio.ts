import type { CategoriaPreset } from "./presets";

/**
 * Vocabulario de la **estrategia del anuncio** (0.27.0): el ángulo, la oferta y el brief que van **antes** del
 * guion.
 *
 * El principio de producto que sostiene todo esto: un anuncio no es creatividad, es un sistema con tres
 * palancas —**ángulo** (a quién le hablas y desde qué dolor o deseo, ~80 % del resultado), **oferta** (qué le
 * das y cómo lo empaquetas) y **creatividad** (hook, edición, música), que amplifica las dos anteriores pero no
 * salva un anuncio con mal ángulo—. La gente no compra productos: compra una versión mejor de sí misma.
 *
 * Y la regla dura de la versión: **un solo ángulo por vídeo**. No es una recomendación, es lo que el esquema
 * permite: `ad_briefs.angle_preset_key` es una columna escalar, no una lista, así que dos ángulos a la vez no
 * se pueden ni guardar.
 *
 * Este fichero lo comparten el servidor y el navegador, así que aquí **no hay ni una palabra de inglés de
 * prompt** (ADR-0022): solo identificadores y los textos en castellano que se leen en pantalla.
 */

// ── El catálogo de ángulos ──────────────────────────────────────────────────────────────────────────────

/**
 * Categoría de preset del catálogo de ángulos del anuncio.
 *
 * Se llama `angulo-anuncio` y **no** `angulo` porque esa clave ya es la del ángulo de cámara de la dirección
 * del clip (0.25.0), que es otra cosa completamente distinta: uno dice desde dónde mira la cámara y el otro,
 * desde qué dolor o deseo entra el anuncio. Compartir clave habría mezclado los dos catálogos en la misma
 * botonera.
 */
export const CATEGORIA_ANGULO: CategoriaPreset = "angulo-anuncio";

/**
 * Claves de los doce ángulos que siembra la instalación, en el orden del catálogo.
 *
 * **No es una lista cerrada**: quien administra puede añadir más desde `/admin/presets`, y el ángulo válido de
 * un brief es cualquiera activo de esta categoría, no solo uno de estos doce. Están aquí para poder nombrarlos
 * en el código de la semilla y en los tests, no para restringir el catálogo.
 */
export const ANGULOS_DE_FABRICA = [
  "problema-dolor",
  "identidad",
  "mecanismo",
  "beneficio",
  "objeciones",
  "emocional",
  "estatus",
  "miedo-perdida",
  "comodidad",
  "precio-valor",
  "comparacion",
  "rompemitos",
] as const;

/**
 * Ángulos que la semilla marca como **afirmación comprobable**: el mecanismo («el culpable son los sulfatos»),
 * el beneficio («rizos definidos todo el día»), el miedo o la pérdida («ese daño no vuelve atrás») y la
 * comparación («por la cuarta parte»). Los cuatro afirman algo sobre el mundo que se puede desmentir, y por eso
 * piden la declaración de veracidad (decisión del propietario, 2026-09-28, pendiente de la revisión legal de
 * 0.46.0).
 *
 * Igual que la lista de arriba: es lo que **siembra** la instalación, no la regla. Quién exige declaración lo
 * dice cada preset en `valores.exigeDeclaracion`, para que un ángulo nuevo del admin también pueda exigirla.
 */
export const ANGULOS_CON_DECLARACION_DE_FABRICA: readonly string[] = [
  "mecanismo",
  "beneficio",
  "miedo-perdida",
  "comparacion",
];

/** Un ángulo del catálogo tal como lo ven el brief y el asistente. */
export interface AnguloVista {
  clave: string;
  nombre: string;
  /** Definición breve, en castellano. Es la referencia que Jev usa para comprobar el guion. */
  definicion: string;
  /** Por dónde entra el anuncio con este ángulo. */
  porDondeEntra: string;
  /** Un ejemplo escrito, del mismo producto en todos: es lo que hace entender el ángulo de un vistazo. */
  ejemplo: string;
  /** `true` cuando elegirlo obliga a declarar que lo que se afirma es cierto. */
  exigeDeclaracion: boolean;
}

// ── Topes del texto que escribe el usuario ──────────────────────────────────────────────────────────────

/** El público al que le habla el anuncio. Una frase: «mujeres con el pelo rizado que ya lo han probado todo». */
export const PUBLICO_MAXIMO = 200;

/** La versión mejor de sí mismo que compra quien ve el anuncio. Es el corazón del brief, y cabe en una frase. */
export const VERSION_MEJOR_MAXIMA = 200;

export const NOTAS_BRIEF_MAXIMAS = 500;

/** Qué se da. Es el único campo obligatorio de la oferta: sin esto no hay oferta, hay un anuncio bonito. */
export const QUE_SE_DA_MAXIMO = 300;

export const PRECIO_MAXIMO = 80;
export const GARANTIA_MAXIMA = 200;
export const URGENCIA_MAXIMA = 200;
export const BONUS_MAXIMO = 200;

/** Tope de ofertas por persona. Es un guarda contra un bucle del navegador, no un límite de diseño. */
export const MAXIMO_OFERTAS = 200;

// ── Ayudas de pantalla ─────────────────────────────────────────────────────────────────────────────────

export const AYUDA_PUBLICO = "A quién le hablas, en una frase. «Quien tiene el pelo rizado y ya lo ha probado todo».";

export const AYUDA_VERSION_MEJOR =
  "La versión mejor de sí mismo que compra: cómo se ve o cómo se siente después. «Salir de casa sin pensar en el pelo».";

export const AYUDA_QUE_SE_DA = "Qué recibe exactamente. «Un bote de 300 ml que dura un mes, con su guía de uso».";

export const AYUDA_PRECIO = "El precio tal como se dice en el anuncio. «19,90 €» o «menos que un desayuno al mes».";

export const AYUDA_GARANTIA = "Qué pasa si no le funciona. «Devolución de 30 días sin preguntas».";

export const AYUDA_URGENCIA = "Por qué ahora y no dentro de un mes. «Solo las primeras 100 unidades».";

export const AYUDA_BONUS = "Lo que va de regalo con la compra. «Con el cepillo de púas anchas incluido».";

/** Los campos vacíos de la oferta **no aparecen** en el guion: un anuncio no promete una garantía inventada. */
export const AVISO_OFERTA_INCOMPLETA =
  "Los campos que dejes vacíos no aparecen en el guion. No se inventa ni un precio ni una garantía que no hayas escrito.";

// ── Lo que ve el navegador ─────────────────────────────────────────────────────────────────────────────

/**
 * Una oferta. Va atada **a un producto** (decisión del propietario, 2026-09-28) y se puede **duplicar** a otro:
 * la misma oferta sirve para las doce variantes de ángulo del mismo producto y se edita en un solo sitio.
 */
export interface OfertaVista {
  id: string;
  productoId: string;
  /** Nombre del producto al que está atada. Es lo que se lee en la lista, no un identificador. */
  productoNombre: string;
  queSeDa: string;
  /** Vacíos = no se dice nada de esto en el guion. Nunca `null` hacia el navegador. */
  precio: string;
  garantia: string;
  urgencia: string;
  bonus: string;
  creado: string;
}

/**
 * El brief del anuncio de un proyecto. Un proyecto es **un anuncio**, así que hay como mucho uno, y es
 * **opcional**: sin brief, el proyecto funciona exactamente como antes de esta versión.
 */
export interface BriefVista {
  proyectoId: string;
  /** `null` = todavía no se ha dicho de qué producto es el anuncio. */
  productoId: string | null;
  productoNombre: string;
  publico: string;
  versionMejor: string;
  /** Clave del ángulo elegido; vacía = sin elegir. **Uno solo**, nunca una lista. */
  angulo: string;
  /** El ángulo del catálogo, resuelto. `null` cuando no hay ángulo o su preset se ha desactivado. */
  anguloVista: AnguloVista | null;
  ofertaId: string | null;
  oferta: OfertaVista | null;
  notas: string;
  /** `true` cuando el ángulo exige declaración de veracidad y ya hay una registrada para este proyecto. */
  declaracionRegistrada: boolean;
  actualizado: string;
}

/** Proyecto sin brief: no es un error ni un hueco, es el camino de siempre. */
export const PROYECTO_SIN_BRIEF =
  "Este proyecto no tiene brief del anuncio. Puedes escribir el guion a mano como hasta ahora, o rellenarlo para que el asistente proponga hooks y guion desde el ángulo y la oferta.";

// ── Declaración de veracidad ───────────────────────────────────────────────────────────────────────────

/**
 * Texto que el usuario acepta al elegir un ángulo que afirma algo comprobable. Se guarda **entero** en la
 * declaración, con su fecha y su IP: lo que hay que poder demostrar es qué se le puso delante, no que pulsó una
 * casilla.
 *
 * Si este texto cambia en una versión futura, las declaraciones ya registradas conservan el suyo. Por eso se
 * guarda en la fila y no se deduce de aquí al leerla.
 */
export const TEXTO_DECLARACION_VERACIDAD =
  "Declaro que lo que afirmo en este anuncio es cierto y lo puedo respaldar, que no es una promesa de salud ni un resultado garantizado, y que soy responsable de lo que se publique con él.";

/** Lo que se le dice al elegir un ángulo de los que la exigen, antes de pedir guion. */
export const AVISO_DECLARACION_NECESARIA =
  "Este ángulo afirma algo que se puede comprobar, así que antes de pedir el guion tienes que declarar que es cierto.";
