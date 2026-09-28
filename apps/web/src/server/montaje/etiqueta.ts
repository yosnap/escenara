import type { PosicionEtiqueta } from "@/lib/montaje";
import { TEXTO_ETIQUETA_SINTETICA } from "@/lib/montaje";
import { ZONA_SEGURA } from "@/lib/voz";
import { ErrorMontaje } from "./errores";
import { ejecutar } from "./ffmpeg";

/**
 * La **etiqueta de contenido sintético** y los subtítulos quemados, como filtros de FFmpeg (RF08, 0.32.0).
 *
 * Lo que hace que esto sea seguro no es escapar bien: es que **no hay texto de nadie en la línea de órdenes**.
 *
 * - la etiqueta es una constante nuestra (`TEXTO_ETIQUETA_SINTETICA`), y aun así se comprueba antes de usarla;
 * - los subtítulos, que sí son texto del usuario, viajan **en un fichero** que lee el filtro `subtitles`. De la
 *   orden solo forma parte su ruta, que la componemos nosotros con un nombre fijo dentro de un temporal.
 *
 * Las dos posiciones respetan las **zonas seguras** de las plataformas verticales (`lib/voz.ts › ZONA_SEGURA`):
 * arriba lo tapa la interfaz de la app y abajo, los botones y el texto del pie. Una etiqueta que nadie ve no es
 * una etiqueta.
 */

/** Tamaño de la etiqueta en píxeles, para 1080 de ancho. Legible en un móvil sin comerse el plano. */
const TAMANO_ETIQUETA = 34;

/** Margen entre la etiqueta y el borde de su zona segura. */
const MARGEN_ETIQUETA = 16;

/**
 * Alto del lienzo que FFmpeg le pone al ASS que genera a partir de un SRT. Los márgenes y el tamaño de letra de
 * `force_style` están en estas unidades, no en píxeles del vídeo.
 */
const PLAY_RES_Y = 288;

/**
 * Caracteres que `drawtext` interpreta y que no pueden aparecer en el texto de la etiqueta: si algún día alguien
 * cambia la constante y mete uno, esto falla al momento en lugar de componer un filtro que hace otra cosa.
 */
const PROHIBIDOS_EN_ETIQUETA = /[':\\%\n\r,;[\]]/;

/** Filtro `drawtext` de la etiqueta. `alto` es el de la salida, para colocarla con la zona segura de verdad. */
export function filtroDeEtiqueta(posicion: PosicionEtiqueta, alto: number): string {
  if (PROHIBIDOS_EN_ETIQUETA.test(TEXTO_ETIQUETA_SINTETICA)) {
    throw new ErrorMontaje(500, "El texto de la etiqueta de contenido sintético no es válido.");
  }
  const margenArriba = Math.round((alto * ZONA_SEGURA.arribaPorCiento) / 100) + MARGEN_ETIQUETA;
  const margenAbajo = Math.round((alto * ZONA_SEGURA.abajoPorCiento) / 100) + MARGEN_ETIQUETA;
  const y = posicion === "arriba" ? `${margenArriba}` : `h-${margenAbajo}-text_h`;
  return [
    `drawtext=text='${TEXTO_ETIQUETA_SINTETICA}'`,
    "fontcolor=white",
    `fontsize=${TAMANO_ETIQUETA}`,
    "x=(w-text_w)/2",
    `y=${y}`,
    // Caja semitransparente: la etiqueta tiene que leerse igual sobre un fondo claro y sobre uno oscuro.
    "box=1",
    "boxcolor=black@0.55",
    "boxborderw=12",
  ].join(":");
}

/**
 * Filtro `subtitles` que quema un fichero de subtítulos. La ruta se comprueba antes de usarla: el filtro
 * interpreta `:`, `,` y `\`, así que una ruta con uno de esos caracteres se rechaza en lugar de escaparse a mano
 * (los temporales que componemos nosotros no los tienen nunca).
 */
export function filtroDeSubtitulos(ruta: string): string {
  if (!/^[A-Za-z0-9_./-]+$/.test(ruta)) {
    throw new ErrorMontaje(500, "La ruta del fichero de subtítulos temporal no es válida.");
  }
  /**
   * El margen va **en unidades del guion ASS, no en píxeles del vídeo**. FFmpeg convierte el SRT a ASS con
   * `PlayResY = 288` y libass escala ese lienzo hasta el alto real, así que un margen en píxeles (422 para
   * 1920) se sale de la pantalla y el subtítulo no se ve: medido el 2026-09-29, con 422 no aparecía ni un
   * píxel. En unidades del guion, el 22 % de 288 son 63, que sobre 1920 caen exactamente en los 422 px de la
   * zona segura de abajo (comprobado con un fotograma).
   */
  const margen = Math.round((PLAY_RES_Y * ZONA_SEGURA.abajoPorCiento) / 100);
  const estilo = [
    "FontSize=20",
    "PrimaryColour=&H00FFFFFF",
    "OutlineColour=&H00000000",
    "BorderStyle=1",
    "Outline=2",
    "Shadow=0",
    "Alignment=2",
    `MarginV=${margen}`,
  ].join(",");
  return `subtitles=filename=${ruta}:force_style='${estilo}'`;
}

/**
 * ¿Puede esta máquina dibujar la etiqueta? `drawtext` necesita **libfreetype y una fuente instalada**, y un
 * servidor mínimo puede no tener ninguna.
 *
 * Se comprueba de verdad, dibujando un fotograma de prueba, y el resultado favorable se cachea en el proceso: las
 * fuentes no desaparecen mientras el servidor corre. Si no se puede, la exportación **falla diciendo qué
 * instalar**; lo que no se hace nunca es exportar sin la etiqueta en silencio, que es justo el caso en el que la
 * etiqueta importa.
 */
const cache = globalThis as { __escenaraDrawtext?: { disponible: boolean; motivo: string } };

export async function etiquetaDisponible(): Promise<{ disponible: boolean; motivo: string }> {
  if (cache.__escenaraDrawtext?.disponible) return cache.__escenaraDrawtext;
  const { ok, error } = await ejecutar(
    [
      "ffmpeg",
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=320x480:d=1:r=5",
      "-vf",
      filtroDeEtiqueta("abajo", 480),
      "-frames:v",
      "1",
      "-f",
      "null",
      "-",
    ],
    30_000,
  );
  if (!ok) {
    return {
      disponible: false,
      motivo:
        "Esta máquina no puede dibujar la etiqueta de contenido generado con IA: le falta una fuente instalada o el soporte de texto de FFmpeg. Instala una fuente (en Debian/Ubuntu, «apt-get install fonts-dejavu-core»; en macOS ya viene con el sistema) y vuelve a intentarlo. No se exporta sin etiqueta.",
    };
  }
  if (error.trim() !== "") console.warn("[montaje] la comprobación de la etiqueta ha avisado:", error.trim());
  cache.__escenaraDrawtext = { disponible: true, motivo: "" };
  return cache.__escenaraDrawtext;
}

/** Olvida la comprobación cacheada. Es para los tests: en marcha, las fuentes no se desinstalan a mitad. */
export function olvidarEtiquetaDisponible(): void {
  cache.__escenaraDrawtext = undefined;
}

export async function exigirEtiquetaDibujable(): Promise<void> {
  const { disponible, motivo } = await etiquetaDisponible();
  if (!disponible) throw new ErrorMontaje(503, motivo);
}
