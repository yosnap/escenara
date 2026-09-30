/**
 * **Comprobaciones de los archivos de marca** (logotipos y fuentes), sin dependencias y sin ejecutar nada del archivo.
 *
 * Lo que decide si un archivo entra es **su contenido**, nunca su nombre ni el tipo que dice el navegador:
 *
 * - un **logotipo** solo entra en PNG, JPEG o WebP (por su firma) y después se vuelve a codificar. Los SVG no se admiten
 *   en esta versión: se rechazan al momento, antes de procesarlos;
 * - una **fuente** solo entra en WOFF2 y se comprueba su cabecera (firma, tipo de letra y longitud declarada). Nunca se
 *   interpreta más allá: el archivo solo lo lee el navegador de quien visita, como cualquier fuente web.
 */

const KB = 1024;
const MB = 1024 * KB;

/** Tamaño máximo de un logotipo en PNG, JPEG o WebP. */
export const LIMITE_LOGO_RASTER = 2 * MB;
/** Tamaño máximo de una fuente WOFF2: una familia variable latina pesa 50–300 KB. */
export const LIMITE_FUENTE = 1 * MB;
/** Lado máximo y mínimo de un logotipo en píxeles. */
export const LADO_MAXIMO_LOGO = 4096;
export const LADO_MINIMO_LOGO = 16;

// ── Logotipos ───────────────────────────────────────────────────────────────────────────────────────────

/** Cómo se le dice a quien sube un SVG u otro formato qué hacer. */
export const CONVERTIR_LOGOTIPO = "Convierte tu logotipo a PNG (con fondo transparente) o a WebP y súbelo otra vez.";

/**
 * ¿Parece texto con marcado (SVG, XML, HTML)? Se mira solo el principio del archivo y **sin interpretar nada**: basta
 * para dar un motivo claro y rechazar al momento, antes de que ninguna biblioteca de imágenes lo lea.
 */
export function pareceMarcado(bytes: Uint8Array): boolean {
  const inicio = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, 256))
    .replace(/^\uFEFF/, "")
    .trimStart();
  return inicio.startsWith("<");
}

/**
 * Motivo del rechazo de un logotipo **por su tipo**, o `null` si es PNG, JPEG o WebP (por su firma). No lee más allá de
 * la cabecera: un SVG se rechaza en microsegundos, sin llegar a sharp ni a librsvg.
 *
 * **Esta versión no admite SVG**: un SVG es un documento que se interpreta (referencias, entidades, instancias
 * anidadas) y su rasterizado puede costar minutos de CPU con un archivo de menos de 1 KB. Hasta que haya un saneado con
 * un analizador XML de verdad, lista blanca y límites, solo entran imágenes raster, que se vuelven a codificar.
 */
export function motivoTipoDeLogoNoValido(bytes: Uint8Array, mimeDetectado: string | null): string | null {
  if (bytes.byteLength === 0) return "El archivo está vacío.";
  if (mimeDetectado === "image/png" || mimeDetectado === "image/jpeg" || mimeDetectado === "image/webp") return null;
  if (pareceMarcado(bytes)) {
    return `Esta versión no admite logotipos en SVG ni otros formatos de texto. ${CONVERTIR_LOGOTIPO}`;
  }
  return `El logotipo tiene que ser PNG, JPEG o WebP. ${CONVERTIR_LOGOTIPO}`;
}

// ── Fuentes ─────────────────────────────────────────────────────────────────────────────────────────────────

const u32 = (b: Uint8Array, i: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(i);
const u16 = (b: Uint8Array, i: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint16(i);

const WOFF2 = 0x774f4632; // «wOF2»
const WOFF = 0x774f4646; // «wOFF»
const TRUETYPE = 0x00010000;
const OPENTYPE = 0x4f54544f; // «OTTO»
const TRUE_MAC = 0x74727565; // «true»

/** ¿Es una fuente WOFF2 bien formada? Devuelve el motivo concreto del rechazo o `null`. */
export function motivoFuenteNoValida(bytes: Uint8Array): string | null {
  if (bytes.byteLength === 0) return "El archivo está vacío.";
  if (bytes.byteLength > LIMITE_FUENTE) return `La fuente pesa más de ${LIMITE_FUENTE / MB} MB.`;
  if (bytes.byteLength < 48) return "El archivo es demasiado pequeño para ser una fuente.";
  const firma = u32(bytes, 0);
  if (firma === TRUETYPE || firma === OPENTYPE || firma === TRUE_MAC || firma === WOFF) {
    return "Es una fuente TTF, OTF o WOFF: conviértela a WOFF2 (por ejemplo con «woff2_compress» o una web de conversión de confianza) y súbela otra vez. Solo se admite WOFF2, que es lo que cargan los navegadores sin pesar de más.";
  }
  if (firma !== WOFF2) return "No es una fuente WOFF2.";
  const sabor = u32(bytes, 4);
  if (sabor !== TRUETYPE && sabor !== OPENTYPE && sabor !== TRUE_MAC)
    return "La fuente WOFF2 no dice qué tipo de letra lleva.";
  if (u32(bytes, 8) !== bytes.byteLength) return "La fuente WOFF2 está incompleta o dañada: su longitud no cuadra.";
  const tablas = u16(bytes, 12);
  if (tablas < 1 || tablas > 100) return "La fuente WOFF2 está dañada: el número de tablas no es válido.";
  if (u16(bytes, 14) !== 0) return "La fuente WOFF2 está dañada: la cabecera no es válida.";
  return null;
}
