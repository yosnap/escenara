import sharp from "sharp";
import { MAX_IMAGEN } from "@/lib/media/reglas";
import type { TipoDetectado } from "./deteccion";

export interface ImagenProcesada {
  datos: Uint8Array;
  mime: string;
  extension: string;
  ancho: number;
  alto: number;
}

/**
 * Medidas de una imagen **sin tocarla**. Es lo que se usa en los documentos de consentimiento, que se guardan
 * tal cual: hacen falta el ancho y el alto para reservar el hueco al mostrarlos, pero el archivo no se recorta
 * ni se reconvierte, porque un documento reducido puede dejar de ser legible.
 */
export async function medidasDeImagen(datos: Uint8Array): Promise<{ ancho: number | null; alto: number | null }> {
  try {
    const meta = await sharp(datos).metadata();
    return { ancho: meta.width ?? null, alto: meta.pageHeight ?? meta.height ?? null };
  } catch {
    // Un documento que sharp no sabe medir se guarda igual: las medidas solo sirven para el hueco del visor.
    return { ancho: null, alto: null };
  }
}

/**
 * Optimiza una imagen: orienta según EXIF, reduce a 1920 × 1080 como máximo sin ampliar y la guarda
 * en WebP con calidad 85. Los GIF se conservan intactos para no perder la animación. Sharp descarta
 * los metadatos (EXIF, GPS) al volver a codificar.
 */
export async function procesarImagen(datos: Uint8Array, detectado: TipoDetectado): Promise<ImagenProcesada> {
  if (detectado.mime === "image/gif") {
    const meta = await sharp(datos).metadata();
    return {
      datos,
      mime: detectado.mime,
      extension: detectado.extension,
      ancho: meta.width ?? 0,
      alto: meta.pageHeight ?? meta.height ?? 0,
    };
  }
  const { data, info } = await sharp(datos, { animated: detectado.mime === "image/webp" })
    .rotate()
    .resize({ width: MAX_IMAGEN.ancho, height: MAX_IMAGEN.alto, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  return {
    datos: new Uint8Array(data),
    mime: "image/webp",
    extension: "webp",
    ancho: info.width,
    alto: info.pageHeight ?? info.height,
  };
}
