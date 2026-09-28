import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { formatearTamano } from "@/lib/media/reglas";
import { leerObjeto } from "../almacenamiento";
import type { FilaMedio } from "../db/esquema";
import { volcarAcotado } from "../revision/archivo";
import { ErrorMontaje } from "./errores";

/**
 * Trae a disco los archivos que hay que montar (RF08, 0.32.0).
 *
 * FFmpeg trabaja sobre ficheros, así que hay que bajar los objetos. Dos cosas importan aquí:
 *
 * - **la carpeta temporal se borra siempre**, también si el render falla a mitad: los clips de una persona no se
 *   quedan en el disco del servidor porque una exportación lanzara una excepción;
 * - **no se le pasa a FFmpeg ninguna URL**. Una orden que sale a la red con una URL que viene de la base de datos
 *   es una puerta que no hace falta abrir, y el almacenamiento se lee con su propio cliente.
 *
 * Los nombres de los ficheros los ponemos nosotros (`clip-0.mp4`, `voz-2.mp3`), **nunca el nombre original del
 * archivo del usuario**: ese nombre acaba en la línea de órdenes de FFmpeg y en un fichero de concatenación, y
 * un nombre con comillas, saltos de línea o `;` no tiene por qué llegar hasta ahí para que esto sea seguro.
 */

/** Tope por archivo de entrada. Un clip de 8 s en 1080p son unos pocos MB; 128 MiB es mucho más que de sobra. */
export const BYTES_MAXIMOS_ENTRADA = 128 * 1024 * 1024;

/** Tope de todo lo que se baja en una exportación: sesenta fragmentos no pueden llenar el disco del servidor. */
export const BYTES_MAXIMOS_TOTALES = 1024 * 1024 * 1024;

/** Carpeta temporal propia de esta exportación. Se borra siempre al acabar `usar`. */
export async function conCarpetaTemporal<T>(usar: (carpeta: string) => Promise<T>): Promise<T> {
  const carpeta = await mkdtemp(path.join(tmpdir(), "escenara-montaje-"));
  try {
    return await usar(carpeta);
  } finally {
    await rm(carpeta, { recursive: true, force: true }).catch((error) =>
      console.error(`[montaje] no se ha podido borrar la carpeta temporal ${carpeta}:`, error),
    );
  }
}

/** Extensión segura a partir del tipo del medio. Solo orienta a FFmpeg; quien decide el formato es el archivo. */
function extensionDe(medio: FilaMedio): string {
  const porMime: Record<string, string> = {
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
  return porMime[medio.mimeType] ?? (medio.kind === "audio" ? "audio" : "bin");
}

/** Bytes bajados en esta exportación, para que el tope total sea del conjunto y no de cada archivo. */
export class Descargador {
  private bajados = 0;

  constructor(private readonly carpeta: string) {}

  /**
   * Baja un medio a la carpeta con un nombre que ponemos nosotros y devuelve su ruta. Falla con una causa concreta
   * si el archivo no está en el almacenamiento o si se pasa de tamaño.
   */
  async bajar(medio: FilaMedio, nombre: string): Promise<string> {
    const objeto = leerObjeto(medio.storageKey);
    const info = await objeto.stat().catch(() => null);
    if (info === null) {
      throw new ErrorMontaje(
        409,
        `El archivo «${medio.originalName}» ya no está en el almacenamiento, así que no se puede montar. Vuelve a generar esa escena o quítala de la línea de tiempo.`,
      );
    }
    if (info.size > BYTES_MAXIMOS_ENTRADA) {
      throw new ErrorMontaje(
        413,
        `El archivo «${medio.originalName}» pesa ${formatearTamano(info.size)} y el máximo por archivo al montar es ${formatearTamano(BYTES_MAXIMOS_ENTRADA)}.`,
      );
    }
    if (this.bajados + info.size > BYTES_MAXIMOS_TOTALES) {
      throw new ErrorMontaje(
        413,
        `Este montaje mueve más de ${formatearTamano(BYTES_MAXIMOS_TOTALES)} de material y no se puede montar de una vez. Divídelo en dos exportaciones más cortas.`,
      );
    }
    // El nombre lo componemos nosotros y se comprueba: si alguna vez llegara aquí algo raro, es un error de
    // programación y se ve al momento en lugar de convertirse en un argumento de FFmpeg con sorpresa.
    if (!/^[a-z0-9-]+$/.test(nombre)) throw new ErrorMontaje(500, "Nombre de archivo temporal no válido.");
    const ruta = path.join(this.carpeta, `${nombre}.${extensionDe(medio)}`);
    await volcarAcotado(objeto.stream(), ruta, BYTES_MAXIMOS_ENTRADA, () => {
      throw new ErrorMontaje(
        413,
        `El archivo «${medio.originalName}» es más grande de lo que decía y no se ha podido montar.`,
      );
    });
    this.bajados += info.size;
    return ruta;
  }
}
