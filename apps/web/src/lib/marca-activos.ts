/**
 * **Comprobaciones de los archivos de marca** (logotipos y fuentes), sin dependencias y sin ejecutar nada del archivo.
 *
 * Lo que decide si un archivo entra es **su contenido**, nunca su nombre ni el tipo que dice el navegador:
 *
 * - un **SVG** es texto que el navegador interpreta, así que no se «limpia»: o cumple una lista cerrada de elementos y
 *   atributos, o se rechaza diciendo qué lo impide (un `<script>`, un `foreignObject`, un manejador `on…`, una
 *   referencia a fuera). Rechazar es más seguro que reescribir: no hay un SVG «casi bueno» que se cuele por un caso
 *   que el limpiador no contemplaba;
 * - una **fuente** solo entra en WOFF2 y se comprueba su cabecera (firma, tipo de letra y longitud declarada). Nunca se
 *   interpreta más allá: el archivo solo lo lee el navegador de quien visita, como cualquier fuente web.
 */

const KB = 1024;
const MB = 1024 * KB;

/** Tamaño máximo de un logotipo en SVG: un logotipo vectorial razonable pesa unos pocos KB. */
export const LIMITE_SVG = 256 * KB;
/** Tamaño máximo de un logotipo en PNG, JPEG o WebP. */
export const LIMITE_LOGO_RASTER = 2 * MB;
/** Tamaño máximo de una fuente WOFF2: una familia variable latina pesa 50–300 KB. */
export const LIMITE_FUENTE = 1 * MB;
/** Lado máximo y mínimo de un logotipo en píxeles. */
export const LADO_MAXIMO_LOGO = 4096;
export const LADO_MINIMO_LOGO = 16;

// ── SVG ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Elementos que puede tener un logotipo. Nada que cargue, ejecute o incruste otra cosa (ni `image`, ni filtros). */
const ELEMENTOS_SVG = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "title",
  "desc",
  "clippath",
  "mask",
  "use",
  "symbol",
  "text",
  "tspan",
]);

/** Los únicos espacios de nombres que se admiten en `xmlns`: son identificadores, el navegador no los descarga. */
const ESPACIOS_DE_NOMBRES = new Set(["http://www.w3.org/2000/svg", "http://www.w3.org/1999/xlink"]);

const ETIQUETA = /<\s*(\/?)\s*([A-Za-z][\w:.-]*)([^<>]*)>/g;
const ATRIBUTO = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const REFERENCIA_INTERNA = /^#[A-Za-z_][\w.-]*$/;
/** `url(` solo hacia dentro del propio SVG: `url(#degradado)`. */
const URL_EXTERNA = /url\s*\(\s*(?!['"]?#)/i;
const PELIGROSO_EN_VALOR = /javascript:|vbscript:|data:|expression\s*\(|@import|\\/i;

/** ¿Es un SVG admitido? Devuelve el motivo concreto del rechazo o `null`. */
export function motivoSvgNoValido(bytes: Uint8Array): string | null {
  if (bytes.byteLength === 0) return "El archivo está vacío.";
  if (bytes.byteLength > LIMITE_SVG) return `El SVG pesa más de ${LIMITE_SVG / KB} KB.`;
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return "El SVG no es texto UTF-8 válido.";
  }
  let cuerpo = texto.replace(/^﻿/, "").trim();
  // Declaración XML opcional al principio; cualquier otra instrucción de procesamiento se rechaza.
  cuerpo = cuerpo.replace(/^<\?xml[^?<>]*\?>/, "");
  if (/<\?/.test(cuerpo)) return "El SVG tiene instrucciones de procesamiento, que no se admiten.";
  if (/<!DOCTYPE|<!ENTITY/i.test(cuerpo)) return "El SVG declara un DOCTYPE o entidades, que no se admiten.";
  if (/<!\[CDATA\[/i.test(cuerpo)) return "El SVG tiene bloques CDATA, que no se admiten.";
  cuerpo = cuerpo.replace(/<!--[\s\S]*?-->/g, "").trim();
  if (/<!/.test(cuerpo)) return "El SVG tiene una declaración que no se admite.";

  const etiquetas = [...cuerpo.matchAll(ETIQUETA)];
  // Cada `<` tiene que ser el principio de una etiqueta reconocida: un `<` suelto es una forma de colar marcado.
  if (etiquetas.length !== (cuerpo.match(/</g) ?? []).length) return "El SVG no está bien formado.";
  const primera = etiquetas[0];
  if (primera?.[1] !== "" || primera[2]?.toLowerCase() !== "svg" || !cuerpo.startsWith("<")) {
    return "El archivo no empieza por un elemento <svg>.";
  }

  for (const [, cierre, nombreCrudo, restoCrudo] of etiquetas) {
    const nombre = (nombreCrudo ?? "").toLowerCase();
    if (!ELEMENTOS_SVG.has(nombre)) {
      if (nombre === "script") return "El SVG tiene un <script>: un logotipo no puede ejecutar código.";
      if (nombre === "foreignobject") return "El SVG tiene un <foreignObject>, que puede incrustar HTML.";
      return `El SVG tiene un elemento <${nombreCrudo}> que no se admite en un logotipo.`;
    }
    if (cierre) continue;
    const resto = restoCrudo ?? "";
    for (const [, atributoCrudo, comillasDobles, comillasSimples] of resto.matchAll(ATRIBUTO)) {
      const atributo = (atributoCrudo ?? "").toLowerCase();
      const valor = comillasDobles ?? comillasSimples ?? "";
      if (atributo.startsWith("on")) return `El SVG tiene un manejador de eventos (${atributoCrudo}).`;
      if (atributo === "xmlns" || atributo.startsWith("xmlns:")) {
        if (!ESPACIOS_DE_NOMBRES.has(valor)) return "El SVG declara un espacio de nombres que no se admite.";
        continue;
      }
      if (atributo === "href" || atributo.endsWith(":href")) {
        if (!REFERENCIA_INTERNA.test(valor))
          return "El SVG enlaza a algo de fuera: solo se admiten referencias internas (#id).";
        continue;
      }
      if (URL_EXTERNA.test(valor)) return "El SVG carga algo de fuera con url(): solo se admite url(#id).";
      if (PELIGROSO_EN_VALOR.test(valor)) return `El SVG tiene un valor que no se admite en «${atributoCrudo}».`;
    }
    // Lo que queda sin ser atributo entre comillas (un atributo sin comillas, texto suelto) no se admite.
    const sobrante = resto
      .replace(ATRIBUTO, "")
      .replace(/\/\s*$/, "")
      .trim();
    if (sobrante !== "") return "El SVG tiene atributos sin comillas o mal escritos.";
  }
  return null;
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
