import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { leerObjeto } from "../almacenamiento";
import { ErrorMedida } from "./medicion";

/**
 * Trae el clip del almacenamiento a un archivo temporal para poder medirlo (RF07).
 *
 * `ffprobe` y `ffmpeg` trabajan sobre archivos, así que hay que bajar el objeto. Se hace en un directorio
 * temporal propio que **se borra siempre**, incluso si la medida falla: un clip de una persona no se queda en el
 * disco del servidor porque su revisión lanzara una excepción.
 *
 * No se le pasa a ffmpeg la URL temporal del almacenamiento a propósito: una orden que sale a la red desde el
 * servidor con una URL que viene de la base de datos es una puerta que no hace falta abrir.
 */

/**
 * Tamaño máximo que se baja a disco. Un clip de 8 s en 720p son unos pocos MB, así que **64 MiB ya es diez veces
 * lo que cabe esperar**: pasado eso, lo honesto es negarse en lugar de llenar el disco y la memoria del servidor
 * con lo que alguien haya dejado en su biblioteca.
 */
const BYTES_MAXIMOS = 64 * 1024 * 1024;

export async function conClipEnDisco<T>(clave: string, mime: string, usar: (ruta: string) => Promise<T>): Promise<T> {
  const objeto = leerObjeto(clave);
  const info = await objeto.stat().catch(() => null);
  if (info === null) {
    throw new ErrorMedida(
      "El archivo del clip no está en el almacenamiento, así que no se puede comprobar. Regenera la escena.",
    );
  }
  if (info.size > BYTES_MAXIMOS) {
    throw new ErrorMedida(
      `El clip pesa más de ${Math.round(BYTES_MAXIMOS / 1024 / 1024)} MB y no se comprueba en este servidor: míralo tú antes de darlo por bueno.`,
    );
  }
  const carpeta = await mkdtemp(path.join(tmpdir(), "escenara-revision-"));
  try {
    const ruta = path.join(carpeta, `clip${extensionDe(mime)}`);
    await volcarAcotado(objeto.stream(), ruta);
    return await usar(ruta);
  } finally {
    // `force`: si el archivo ni llegó a escribirse, borrar la carpeta no puede fallar por eso.
    await rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Vuelca el flujo a disco **por trozos y contando los bytes**, y corta en cuanto pasa del tope.
 *
 * Se cuenta al escribir y no se confía solo en `stat()`: lo que diga el almacenamiento antes de empezar es una
 * promesa sobre un archivo que puede haber cambiado, y un `Content-Length` que miente no puede decidir cuánto disco
 * se llena. El que manda es lo que de verdad ha pasado por aquí.
 *
 * Se exporta para poder probarlo con un flujo hecho a mano: un almacenamiento de verdad informa siempre del tamaño
 * real, así que el caso que esto cubre —el que informa de menos— no se puede montar contra él.
 */
export async function volcarAcotado(flujo: ReadableStream<Uint8Array>, ruta: string): Promise<void> {
  const destino = Bun.file(ruta).writer();
  let bytes = 0;
  try {
    for await (const trozo of flujo) {
      bytes += (trozo as Uint8Array).byteLength;
      if (bytes > BYTES_MAXIMOS) {
        throw new ErrorMedida(
          `El clip pesa más de ${Math.round(BYTES_MAXIMOS / 1024 / 1024)} MB y no se comprueba en este servidor: míralo tú antes de darlo por bueno.`,
        );
      }
      destino.write(trozo as Uint8Array);
    }
    await destino.flush();
  } finally {
    // Se cierra siempre: al cortar por tamaño, dejar el escritor abierto retendría el descriptor del archivo que
    // el `finally` de fuera está a punto de borrar.
    await destino.end();
  }
}

/** Extensión a partir del tipo del medio. Solo orienta a ffprobe; quien decide el formato es el propio archivo. */
function extensionDe(mime: string): string {
  if (mime === "video/quicktime") return ".mov";
  if (mime === "video/webm") return ".webm";
  return ".mp4";
}
