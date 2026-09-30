/**
 * **Ejemplo de una plantilla o de un trend**: una imagen o un clip ya existente de la biblioteca, elegido por quien
 * administra, que enseña cómo se ve el resultado antes de gastar nada. Es lógica pura, sin base de datos ni red: la
 * usan el servidor, el navegador y los tests por igual.
 *
 * El ejemplo **no es el prompt** (ADR-0022): al navegador solo viaja su tipo, un texto alternativo, sus medidas y la
 * dirección de una ruta propia que sirve el archivo. Nunca el identificador del medio ni nada de la plantilla.
 */

export type TipoDemo = "imagen" | "video";

/** Lo único que se sabe del ejemplo fuera del servidor. */
export interface DemoPlantilla {
  tipo: TipoDemo;
  /** Ruta propia que sirve el archivo solo si la plantilla es visible para quien lo pide. */
  url: string;
  /** Texto alternativo en castellano: lo que describe el ejemplo para quien no puede verlo. */
  alt: string;
  ancho: number | null;
  alto: number | null;
}

/**
 * Tipos de archivo que se aceptan como ejemplo. Son los que admite la biblioteca, salvo audio y SVG: un ejemplo se
 * ve, y un SVG servido inline podría ejecutar código.
 */
const MIME_DE_DEMO: Record<TipoDemo, readonly string[]> = {
  imagen: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
};

/** Tipo del ejemplo según el medio de la biblioteca, o `null` si ese medio no puede ser un ejemplo. */
export function tipoDeDemo(tipoDeMedio: string, mime: string): TipoDemo | null {
  if (tipoDeMedio !== "imagen" && tipoDeMedio !== "video") return null;
  const limpio = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_DE_DEMO[tipoDeMedio].includes(limpio) ? tipoDeMedio : null;
}

/** Huella corta y estable del medio elegido: cambia al cambiar de ejemplo (rompe la caché) y no revela su identificador. */
function huella(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Ruta que sirve el ejemplo de una plantilla. La huella hace que un ejemplo nuevo no se confunda con el anterior. */
export const rutaDeDemo = (plantillaId: string, medioId: string): string =>
  `/api/prompts/plantillas/${plantillaId}/demo?v=${huella(medioId)}`;

/** Texto alternativo del ejemplo: el del medio si lo tiene, o uno que nombra la plantilla. */
export function textoAlternativoDeDemo(
  medio: { altEs: string; title: string },
  nombreDePlantilla: string,
  tipo: TipoDemo,
): string {
  const propio = medio.altEs.trim() || medio.title.trim();
  if (propio) return propio;
  return tipo === "video" ? `Clip de ejemplo de «${nombreDePlantilla}»` : `Imagen de ejemplo de «${nombreDePlantilla}»`;
}

/**
 * ¿Ve un usuario que no administra el ejemplo de esta plantilla? Solo si es de la instalación, está activa y, si es
 * un trend, está vigente con los trends visibles. Es la **misma** regla que decide qué plantillas se le ofrecen: una
 * plantilla caducada, en revisión o desactivada no le enseña nada.
 */
export function demoVisibleParaUsuarios(
  plantilla: {
    deLaInstalacion: boolean;
    activa: boolean;
    kind: "base" | "trend";
    trendStatus: "vigente" | "revision" | "caducada" | null;
  },
  trendsVisibles: boolean,
): boolean {
  if (!plantilla.deLaInstalacion || !plantilla.activa) return false;
  if (plantilla.kind === "base") return true;
  return trendsVisibles && plantilla.trendStatus === "vigente";
}

/** Tramo de bytes pedido con `Range`, ambos extremos incluidos. */
export interface TramoDeBytes {
  inicio: number;
  fin: number;
}

/**
 * Lee una cabecera `Range: bytes=…` de un solo tramo (lo que envían los reproductores de vídeo). Devuelve `null` si
 * no hay cabecera o no es válida (se sirve entero, como pide el RFC), y `"fuera"` si pide algo que no existe (416).
 */
export function leerTramo(cabecera: string | null, tamano: number): TramoDeBytes | "fuera" | null {
  if (!cabecera) return null;
  const partes = /^bytes=(\d*)-(\d*)$/.exec(cabecera.trim());
  if (!partes) return null;
  const [, desde = "", hasta = ""] = partes;
  if (desde === "" && hasta === "") return null;
  if (desde === "") {
    // «-N»: los últimos N bytes.
    const ultimos = Number(hasta);
    if (!Number.isSafeInteger(ultimos) || ultimos <= 0 || tamano === 0) return "fuera";
    return { inicio: Math.max(0, tamano - ultimos), fin: tamano - 1 };
  }
  const inicio = Number(desde);
  if (!Number.isSafeInteger(inicio)) return null;
  // Un tramo con el final antes del principio no es válido: se ignora y se sirve entero (RFC 9110, §14.2).
  if (hasta !== "" && (!Number.isSafeInteger(Number(hasta)) || Number(hasta) < inicio)) return null;
  if (inicio >= tamano) return "fuera";
  const fin = hasta === "" ? tamano - 1 : Math.min(Number(hasta), tamano - 1);
  return { inicio, fin };
}
