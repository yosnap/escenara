import path from "node:path";
import type { AudioParaChat } from "../proveedores/compatible/cliente";
import { conClipEnDisco } from "../revision/archivo";

/**
 * Saca la **pista de audio** de un clip y la deja lista para el modelo omnimodal: MP3 mono de 16 kHz y, como mucho,
 * los primeros {@link SEGUNDOS_MAXIMOS} segundos.
 *
 * Por qué así y no el clip entero: lo que se comprueba es la **emoción de la voz y el ambiente**, no el montaje. Un
 * MP3 mono de 16 kHz de 30 s pesa unas decenas de kilobytes, cabe de sobra en una petición y no le hace tragar a
 * nadie un vídeo entero en base64 para saber si alguien suena triste.
 *
 * Usa el mismo FFmpeg que la revisión de continuidad (0.20.0) y el mismo volcado acotado a disco, que borra el
 * temporal siempre: es el audio de alguien.
 */

/** Segundos de audio que se mandan como mucho. Con más, la petición crece y la respuesta no mejora. */
export const SEGUNDOS_MAXIMOS = 30;

/** Ese clip no tiene audio, o no se ha podido sacar. No es un fallo del servidor: es un hecho que hay que decir. */
export class ErrorAudioDelClip extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorAudioDelClip";
  }
}

/**
 * Convierte el clip a MP3 y lo devuelve en base64. Lanza {@link ErrorAudioDelClip} si el clip no tiene pista de
 * audio: una comprobación de la voz sobre un clip mudo no diría nada, y fingirla sería peor.
 */
export async function audioDelClip(claveAlmacenamiento: string, mime: string): Promise<AudioParaChat> {
  return conClipEnDisco(claveAlmacenamiento, mime, async (ruta) => {
    const salida = path.join(path.dirname(ruta), "voz.mp3");
    const proceso = Bun.spawn(
      [
        "ffmpeg",
        "-y",
        "-i",
        ruta,
        "-vn",
        "-t",
        String(SEGUNDOS_MAXIMOS),
        "-ar",
        "16000",
        "-ac",
        "1",
        "-b:a",
        "48k",
        salida,
      ],
      // La salida de FFmpeg no se lee: aquí solo interesa si ha escrito el archivo o no.
      { stdout: "ignore", stderr: "ignore" },
    );
    const codigo = await proceso.exited;
    const fichero = Bun.file(salida);
    if (codigo !== 0 || !(await fichero.exists()) || fichero.size === 0) {
      throw new ErrorAudioDelClip(
        "Este clip no tiene pista de audio o no se ha podido leer, así que no se puede comprobar la emoción de la voz.",
      );
    }
    const bytes = new Uint8Array(await fichero.arrayBuffer());
    return { formato: "mp3", base64: Buffer.from(bytes).toString("base64") };
  });
}
