import { LIMITE_BYTES, type TipoMedio, tipoDeMime } from "@/lib/media/reglas";

export interface TipoDetectado {
  mime: string;
  tipo: TipoMedio;
  extension: string;
}

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/webm": "weba",
};

const ascii = (b: Uint8Array, desde: number, largo: number) => String.fromCharCode(...b.subarray(desde, desde + largo));

function empiezaPor(b: Uint8Array, firma: number[], desde = 0) {
  return firma.every((valor, i) => b[desde + i] === valor);
}

/**
 * Tipo MIME real según la firma binaria del archivo. El MIME declarado solo decide entre
 * contenedores que admiten audio y vídeo (WebM y MP4); nunca convierte en válido un archivo desconocido.
 */
function mimeReal(b: Uint8Array, declarado: string): string | null {
  const declaradoAudio = declarado.startsWith("audio/");
  if (empiezaPor(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (empiezaPor(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a") return "image/gif";
  if (ascii(b, 0, 4) === "RIFF") {
    const formato = ascii(b, 8, 4);
    if (formato === "WEBP") return "image/webp";
    if (formato === "WAVE") return "audio/wav";
    return null;
  }
  if (ascii(b, 4, 4) === "ftyp") {
    const marca = ascii(b, 8, 4);
    if (marca === "avif" || marca === "avis") return "image/avif";
    if (marca === "M4A " || marca === "M4B ") return "audio/mp4";
    if (marca === "qt  ") return "video/quicktime";
    return declaradoAudio ? "audio/mp4" : "video/mp4";
  }
  if (empiezaPor(b, [0x1a, 0x45, 0xdf, 0xa3])) return declaradoAudio ? "audio/webm" : "video/webm";
  if (ascii(b, 0, 4) === "OggS") return "audio/ogg";
  if (ascii(b, 0, 4) === "fLaC") return "audio/flac";
  if (ascii(b, 0, 3) === "ID3") return "audio/mpeg";
  // Tramas sin cabecera: ADTS (AAC) antes que MPEG, porque ambas empiezan por 0xFFF.
  if (b[0] === 0xff && b[1] !== undefined) {
    if ((b[1] & 0xf6) === 0xf0) return "audio/aac";
    if ((b[1] & 0xe0) === 0xe0) return "audio/mpeg";
  }
  return null;
}

export function detectarTipo(bytes: Uint8Array, mimeDeclarado = ""): TipoDetectado | null {
  const mime = mimeReal(bytes, mimeDeclarado.toLowerCase());
  const tipo = mime ? tipoDeMime(mime) : null;
  if (!mime || !tipo) return null;
  return { mime, tipo, extension: EXTENSION[mime] ?? "bin" };
}

export type ResultadoValidacion = { ok: true; detectado: TipoDetectado } | { ok: false; motivo: string };

/** Valida el contenido real del archivo, su tamaño y, si se indica, los tipos permitidos. */
export function validarArchivo(
  bytes: Uint8Array,
  mimeDeclarado: string,
  permitidos?: readonly TipoMedio[],
): ResultadoValidacion {
  if (bytes.byteLength === 0) return { ok: false, motivo: "El archivo está vacío." };
  const detectado = detectarTipo(bytes, mimeDeclarado);
  if (!detectado) return { ok: false, motivo: "Formato no admitido o archivo dañado." };
  if (permitidos && !permitidos.includes(detectado.tipo)) {
    return { ok: false, motivo: "Este tipo de archivo no está permitido aquí." };
  }
  if (bytes.byteLength > LIMITE_BYTES[detectado.tipo]) {
    return { ok: false, motivo: "El archivo supera el tamaño máximo para su tipo." };
  }
  return { ok: true, detectado };
}
