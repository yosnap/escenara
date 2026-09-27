/**
 * Quita los metadatos de un documento de consentimiento **sin tocar la imagen**.
 *
 * El problema: un documento se guarda tal cual para que la letra pequeña siga siendo legible, así que no pasa
 * por sharp; pero una foto hecha con el móvil lleva EXIF con la **localización** de donde se firmó, la marca del
 * teléfono y la fecha exacta. Eso es un dato personal más que no hace ninguna falta para revisar una firma.
 *
 * La solución es trabajar a nivel de contenedor, no de imagen: en JPEG se quitan los segmentos `APPn` y los
 * comentarios sin tocar los datos comprimidos; en PNG, los trozos de texto y `eXIf`. Los píxeles salen **byte a
 * byte idénticos**, así que no se pierde ni un punto de legibilidad.
 *
 * Decisión asociada (anotada en la fase 13): **un documento solo puede ser JPEG o PNG**. Para WebP y AVIF no
 * hay un recorte de contenedor tan simple y fiable, y recomprimir para limpiar metadatos es justo lo que no
 * queremos; pedir una foto o un escaneo en JPEG o PNG no le cuesta nada a nadie.
 */

/** Formatos que se aceptan como documento de consentimiento. */
export const MIME_DOCUMENTO: readonly string[] = ["image/jpeg", "image/png"];

export const esMimeDeDocumento = (mime: string) => MIME_DOCUMENTO.includes(mime);

/**
 * Segmentos JPEG que se eliminan: todos los `APPn` salvo `APP0` (JFIF, que describe la densidad y no dice nada
 * de nadie) y los comentarios. `APP1` es EXIF y XMP; `APP2`, perfiles ICC y otros.
 */
function limpiarJpeg(datos: Uint8Array): Uint8Array {
  // Un JPEG empieza por SOI (FFD8). Si no lo hace, no se toca nada: la detección por firma ya lo validó.
  if (datos[0] !== 0xff || datos[1] !== 0xd8) return datos;
  const partes: Uint8Array[] = [datos.subarray(0, 2)];
  let i = 2;
  while (i + 3 < datos.length) {
    if (datos[i] !== 0xff) break; // Fuera de sitio: se copia el resto tal cual y se sale.
    const marcador = datos[i + 1] as number;
    // Relleno `FFFF` o marcadores sin carga (`FF01`, `FFD0`–`FFD7`): se copian y se sigue.
    if (marcador === 0xff) {
      partes.push(datos.subarray(i, i + 1));
      i += 1;
      continue;
    }
    // SOS (FFDA): a partir de aquí van los datos comprimidos hasta el final. No se toca nada más.
    if (marcador === 0xda) break;
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      partes.push(datos.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const largo = ((datos[i + 2] as number) << 8) | (datos[i + 3] as number);
    if (largo < 2 || i + 2 + largo > datos.length) break; // Longitud imposible: se deja el resto intacto.
    const esAppSobrante = marcador >= 0xe1 && marcador <= 0xef; // APP1–APP15
    const esComentario = marcador === 0xfe; // COM
    if (!esAppSobrante && !esComentario) partes.push(datos.subarray(i, i + 2 + largo));
    i += 2 + largo;
  }
  partes.push(datos.subarray(i));
  return unir(partes);
}

/** Trozos PNG que se eliminan: texto en cualquiera de sus formas, EXIF y la fecha de modificación. */
const TROZOS_PNG_FUERA = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function limpiarPng(datos: Uint8Array): Uint8Array {
  const FIRMA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (datos.length < 8 || FIRMA.some((b, indice) => datos[indice] !== b)) return datos;
  const partes: Uint8Array[] = [datos.subarray(0, 8)];
  const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  let i = 8;
  // Cada trozo es: longitud (4), tipo (4), datos (longitud) y CRC (4).
  while (i + 8 <= datos.length) {
    const largo = vista.getUint32(i);
    const fin = i + 12 + largo;
    if (fin > datos.length) break; // Trozo truncado: se copia lo que queda y se sale.
    const tipo = String.fromCharCode(...datos.subarray(i + 4, i + 8));
    if (!TROZOS_PNG_FUERA.has(tipo)) partes.push(datos.subarray(i, fin));
    i = fin;
    if (tipo === "IEND") break;
  }
  if (i < datos.length) partes.push(datos.subarray(i));
  return unir(partes);
}

function unir(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((suma, parte) => suma + parte.byteLength, 0);
  const salida = new Uint8Array(total);
  let posicion = 0;
  for (const parte of partes) {
    salida.set(parte, posicion);
    posicion += parte.byteLength;
  }
  return salida;
}

/**
 * Devuelve los mismos bytes sin sus metadatos. Los píxeles no se tocan: no hay recompresión ni recorte, así que
 * la legibilidad es exactamente la del archivo original.
 */
export function limpiarMetadatosDocumento(datos: Uint8Array, mime: string): Uint8Array {
  if (mime === "image/jpeg") return limpiarJpeg(datos);
  if (mime === "image/png") return limpiarPng(datos);
  return datos;
}
