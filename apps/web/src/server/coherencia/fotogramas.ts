import path from "node:path";
import { imagenParaModelo } from "../media/procesado";
import { conClipEnDisco } from "../revision/archivo";

/**
 * Saca una **tira de fotogramas** de un clip: varias muestras repartidas por su duración, pegadas en una sola
 * imagen de izquierda a derecha.
 *
 * Por qué una tira y no el vídeo: los servicios compatibles con la API de OpenAI que esta instalación usa para
 * percibir **ven imágenes, no vídeo**. Una tira de ocho muestras en orden es lo que más se parece a ver el clip
 * con lo que hay: en ella se aprecia si la cámara se acerca, si el encuadre cambia de golpe (un corte) y si el
 * personaje mueve los labios o está quieto.
 *
 * Es lo mismo que hace {@link audioDelClip} con el sonido, con el mismo FFmpeg de la revisión de continuidad
 * (0.20.0) y el mismo volcado acotado a disco que borra el temporal siempre: es la cara de alguien.
 *
 * Lo que **no** es: no sustituye a ver el vídeo. Un movimiento muy rápido entre dos muestras no se ve, y se
 * acepta: el veredicto que sale de aquí nace en sombra y se mide antes de darle poder.
 */

/** Muestras que se toman. Ocho reparte bien un clip de 4 a 10 s y deja cada fotograma legible en la tira. */
export const MUESTRAS = 8;

/** Ese clip no se ha podido leer. Es un hecho que hay que decir, no un fallo que tragarse. */
export class ErrorFotogramasDelClip extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorFotogramasDelClip";
  }
}

/** Duración del clip en segundos. Si no se puede leer se asume una corta: mejor repetir muestras que perderlas. */
async function duracionDe(ruta: string): Promise<number> {
  const proceso = Bun.spawn(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", ruta], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const texto = await new Response(proceso.stdout).text();
  await proceso.exited;
  const segundos = Number.parseFloat(texto.trim());
  return Number.isFinite(segundos) && segundos > 0 ? segundos : 4;
}

/**
 * Tira de fotogramas del clip, ya reducida para el modelo. Lanza {@link ErrorFotogramasDelClip} si no se puede
 * componer: una tira vacía daría un veredicto sobre nada.
 */
export async function fotogramasDelClip(
  claveAlmacenamiento: string,
  mime: string,
): Promise<{ mime: string; base64: string }> {
  return conClipEnDisco(claveAlmacenamiento, mime, async (ruta) => {
    const salida = path.join(path.dirname(ruta), "tira.jpg");
    // La cadencia se calcula con la duración real: repartir las muestras por el clip es lo que hace que la
    // tira cuente lo que pasa de principio a fin y no ocho fotogramas del primer segundo.
    const segundos = await duracionDe(ruta);
    const cadencia = MUESTRAS / segundos;
    const proceso = Bun.spawn(
      [
        "ffmpeg",
        "-y",
        "-i",
        ruta,
        // `fps` toma las muestras repartidas y `tile` las pega en una fila; el escalado las deja legibles sin
        // que la imagen se vaya de tamaño.
        "-vf",
        `fps=${cadencia.toFixed(4)},scale=240:-1,tile=${MUESTRAS}x1`,
        "-frames:v",
        "1",
        salida,
      ],
      { stdout: "ignore", stderr: "ignore" },
    );
    const codigo = await proceso.exited;
    const fichero = Bun.file(salida);
    if (codigo !== 0 || !(await fichero.exists()) || fichero.size === 0) {
      throw new ErrorFotogramasDelClip(
        "No se han podido sacar fotogramas de este clip, así que no se puede comprobar si hace lo que dirigiste.",
      );
    }
    return imagenParaModelo(new Uint8Array(await fichero.arrayBuffer()));
  });
}
