import sharp from "sharp";
import { ErrorCatalogo } from "../proveedores/contrato";

/**
 * Convierte la imagen de referencia al formato que acepte el modelo. Hace falta de verdad: la biblioteca
 * guarda las imágenes en WebP y Kling v3 turbo solo acepta JPEG o PNG (comprobado en la comparativa del
 * 2026-09-27: hubo que convertirlas con `sips` para poder subirlas).
 *
 * Si el modelo no declara formatos o ya acepta el del archivo, no se toca nada: reconvertir pierde calidad
 * y tiempo por gusto.
 */

const CONVERSIONES: Record<string, { mime: string; extension: string }> = {
  "image/png": { mime: "image/png", extension: "png" },
  "image/jpeg": { mime: "image/jpeg", extension: "jpg" },
};

/** Preferencia de destino: PNG antes que JPEG, porque no añade artefactos a un fotograma. */
const PREFERENCIA = ["image/png", "image/jpeg"];

export async function referenciaCompatible(archivo: File, formatosAdmitidos: string[]): Promise<File> {
  if (formatosAdmitidos.length === 0 || formatosAdmitidos.includes(archivo.type)) return archivo;
  const destino = PREFERENCIA.find((mime) => formatosAdmitidos.includes(mime));
  if (!destino) {
    throw new ErrorCatalogo(
      503,
      "Ese modelo solo acepta formatos de imagen que esta instalación no sabe preparar. Elige otro modelo.",
    );
  }
  const { mime, extension } = CONVERSIONES[destino] as { mime: string; extension: string };
  const origen = new Uint8Array(await archivo.arrayBuffer());
  const imagen = sharp(origen).rotate();
  const datos = mime === "image/png" ? await imagen.png().toBuffer() : await imagen.jpeg({ quality: 92 }).toBuffer();
  const nombre = `${archivo.name.replace(/\.[^.]+$/, "")}.${extension}`;
  return new File([new Uint8Array(datos)], nombre, { type: mime });
}
