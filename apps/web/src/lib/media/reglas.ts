/** Reglas de medios compartidas por el navegador y el servidor. */

export type TipoMedio = "imagen" | "video" | "audio";

export const TIPOS_MEDIO: readonly TipoMedio[] = ["imagen", "video", "audio"];

const MB = 1024 * 1024;

/** Tamaño máximo por archivo según su tipo. */
export const LIMITE_BYTES: Record<TipoMedio, number> = {
  imagen: 10 * MB,
  video: 200 * MB,
  audio: 50 * MB,
};

/** Tipos MIME admitidos. El servidor comprueba el tipo real leyendo la cabecera del archivo. */
export const MIME_ADMITIDOS: Record<TipoMedio, readonly string[]> = {
  imagen: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/aac", "audio/flac", "audio/webm"],
};

export const ETIQUETA_TIPO: Record<TipoMedio, string> = {
  imagen: "Imagen",
  video: "Vídeo",
  audio: "Audio",
};

/** Dimensiones máximas de las imágenes guardadas (se reducen, nunca se amplían). */
export const MAX_IMAGEN = { ancho: 1920, alto: 1080 } as const;

export const POR_PAGINA = 24;

export function esTipoMedio(valor: unknown): valor is TipoMedio {
  return typeof valor === "string" && (TIPOS_MEDIO as readonly string[]).includes(valor);
}

/** Tipo de medio a partir de un MIME admitido, o `null` si no se admite. */
export function tipoDeMime(mime: string): TipoMedio | null {
  const limpio = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return TIPOS_MEDIO.find((t) => MIME_ADMITIDOS[t].includes(limpio)) ?? null;
}

/** Valor del atributo `accept` de un `<input type="file">` para los tipos indicados. */
export function aceptarArchivos(tipos: readonly TipoMedio[] = TIPOS_MEDIO): string {
  return tipos.flatMap((t) => MIME_ADMITIDOS[t]).join(",");
}

/** Comprobación rápida antes de subir. Devuelve el motivo del rechazo o `null` si el archivo es válido. */
export function motivoRechazo(archivo: { type: string; size: number }, tipos: readonly TipoMedio[] = TIPOS_MEDIO) {
  const tipo = tipoDeMime(archivo.type);
  if (!tipo || !tipos.includes(tipo)) return "Formato no admitido.";
  if (archivo.size === 0) return "El archivo está vacío.";
  if (archivo.size > LIMITE_BYTES[tipo]) {
    return `${ETIQUETA_TIPO[tipo]} demasiado grande: el máximo es ${formatearTamano(LIMITE_BYTES[tipo])}.`;
  }
  return null;
}

export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ["KB", "MB", "GB"];
  let valor = bytes / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  return `${valor.toLocaleString("es-ES", { maximumFractionDigits: valor < 10 ? 1 : 0 })} ${unidades[i]}`;
}

/**
 * Segundos con coma decimal y su unidad («0,2 s», «8,1 s»): los recortes y las duraciones del montaje tienen
 * decimales y en castellano llevan coma. Es el formateador común de la pantalla: no se escribe `${x} s` a mano.
 */
export function formatearSegundos(segundos: number, decimales = 2): string {
  return `${segundos.toLocaleString("es-ES", { maximumFractionDigits: decimales })} s`;
}

export function formatearDuracion(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
