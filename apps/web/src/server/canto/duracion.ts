import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { leerObjeto } from "../almacenamiento";
import type { FilaMedio } from "../db/esquema";
import { volcarAcotado } from "../revision/archivo";

/**
 * **Duración del audio con el que se canta**, medida con `ffprobe` (0.29.0).
 *
 * Por qué se mide aquí y no se confía en lo que traiga el medio: el clip se paga **por segundo de audio**, así
 * que la duración es el precio. `media.duration_seconds` la escribe quien sube el archivo —puede venir del
 * navegador, puede faltar en un archivo añadido por URL— y una cifra optimista significaría reservar menos de lo
 * que el proveedor cobra. Lo que decide es el archivo.
 *
 * No cuesta nada y no sale de la máquina: se baja el objeto a un archivo temporal que **se borra siempre**, se
 * lee su cabecera y se devuelve. Es el mismo camino que la revisión de continuidad (0.20.0) y la transcripción
 * (0.21.0), con su mismo tope de bytes.
 *
 * Si no se puede medir, **no se inventa**: se devuelve `null` y la puerta de controles lo dice
 * (`canto-duracion-ilegible`). Asumir una duración corta sería estimar de menos y cobrar de más.
 */

/**
 * Tope de lo que se baja a disco. 50 MiB es el límite de subida de un audio en esta instalación
 * (`lib/media/reglas.ts`), así que por encima de eso el archivo no puede venir de la biblioteca.
 */
const BYTES_MAXIMOS = 50 * 1024 * 1024;

/** No se puede medir el audio. La usa el volcado para cortar sin dejar a medias el archivo temporal. */
class AudioIlegible extends Error {}

/** Extensión orientativa para `ffprobe`; quien decide el formato es el propio archivo. */
function extensionDe(mime: string): string {
  if (mime === "audio/wav") return ".wav";
  if (mime === "audio/ogg") return ".ogg";
  if (mime === "audio/flac") return ".flac";
  if (mime === "audio/mp4" || mime === "audio/aac") return ".m4a";
  if (mime === "audio/webm") return ".webm";
  return ".mp3";
}

/**
 * Duración en segundos del audio, o `null` si no se puede leer.
 *
 * `ffprobe` es una dependencia del entorno, igual que para la revisión: si falta, esto devuelve `null` y el
 * usuario ve que no se ha podido medir en lugar de un coste inventado.
 */
export async function duracionDeAudio(medio: FilaMedio): Promise<number | null> {
  const objeto = leerObjeto(medio.storageKey);
  const info = await objeto.stat().catch(() => null);
  if (info === null || info.size > BYTES_MAXIMOS) return null;
  const carpeta = await mkdtemp(path.join(tmpdir(), "escenara-canto-"));
  try {
    const ruta = path.join(carpeta, `audio${extensionDe(medio.mimeType)}`);
    await volcarAcotado(objeto.stream(), ruta, BYTES_MAXIMOS, () => {
      throw new AudioIlegible("El audio es más grande de lo que se puede medir en este servidor.");
    });
    return await medir(ruta);
  } catch (error) {
    if (error instanceof AudioIlegible) return null;
    // Un fallo del almacenamiento o de `ffprobe` no puede convertirse en una duración: se dice que no se sabe.
    console.error(
      `[canto] no se ha podido medir el audio ${medio.id}: ${error instanceof Error ? error.message : error}`,
    );
    return null;
  } finally {
    // `force`: si el archivo ni llegó a escribirse, borrar la carpeta no puede fallar por eso.
    await rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }
}

/** Duración que informa `ffprobe`; `null` si no la informa o no es un número utilizable. */
async function medir(ruta: string): Promise<number | null> {
  const proceso = Bun.spawn(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", ruta], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const texto = await new Response(proceso.stdout).text();
  await proceso.exited;
  const segundos = Number.parseFloat(texto.trim());
  return Number.isFinite(segundos) && segundos > 0 ? segundos : null;
}
