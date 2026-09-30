import type { Encuadre, FormatoMontaje } from "@/lib/formatos";
import type { EsquinaKit } from "@/lib/marca-kit";
import type { PosicionEtiqueta } from "@/lib/montaje";
import { FPS_MONTAJE } from "@/lib/montaje";
import { ErrorMontaje } from "./errores";
import { colocacionDelLogo, filtroDeEtiqueta, filtroDeLogo, filtroDeSubtitulos } from "./etiqueta";
import { AUDIO_SALIDA, METADATOS_BASICOS, VIDEO_SALIDA } from "./ffmpeg";

/**
 * Las **órdenes** de FFmpeg del render, compuestas aparte de quien las ejecuta (RF08, 0.32.0).
 *
 * Están en su propio fichero porque son la parte que se puede comprobar sin base de datos, sin almacenamiento y
 * sin lanzar nada: dado un montaje, qué argumentos salen. Los tests de entrada hostil miran justo esto.
 *
 * Dos decisiones de fondo:
 *
 * 1. **re-encode uniforme antes de concatenar, nunca `concat` directo** (riesgo declarado de la fase). Cada
 *    fragmento se iguala primero a 1080 × 1920, 30 fps, H.264 y AAC estéreo a 48 kHz; solo entonces se concatenan.
 *    Sin esto, dos clips con cadencias distintas dan un vídeo con el audio desincronizado a mitad;
 * 2. **todo lo que entra en un argumento es numérico o nuestro**. Las rutas las componemos nosotros y se
 *    comprueban; el único texto es la etiqueta, que es una constante; los subtítulos van en un fichero.
 */

/** Todo número que acaba en un argumento pasa por aquí: sin `NaN`, sin `Infinity` y sin notación científica. */
function numero(valor: number, nombre: string): string {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new ErrorMontaje(500, `Valor de render no válido (${nombre}).`);
  }
  return (Math.round(valor * 1000) / 1000).toFixed(3);
}

const entero = (valor: number, nombre: string): string => {
  if (!Number.isInteger(valor) || valor < 0) throw new ErrorMontaje(500, `Valor de render no válido (${nombre}).`);
  return String(valor);
};

/** Ruta de un fichero temporal nuestro. Se comprueba siempre: una ruta con comillas o comas rompería el filtro. */
export function rutaSegura(ruta: string): string {
  if (!/^[A-Za-z0-9_./-]+$/.test(ruta)) {
    throw new ErrorMontaje(500, "Ruta temporal del montaje no válida.");
  }
  return ruta;
}

const COMUNES = ["-nostdin", "-hide_banner", "-loglevel", "error", "-progress", "pipe:1", "-nostats", "-y"] as const;

// ── Igualar un fragmento ────────────────────────────────────────────────────────────────────────────────────

export interface FragmentoNormalizable {
  /** Clip de la escena, ya en disco. */
  ruta: string;
  /** Segundo del clip en el que empieza el trozo. */
  entrada: number;
  /** Segundos que dura el trozo. */
  duracion: number;
  /**
   * `false` cuando el clip **no tiene pista de audio** o su escena la tiene **quitada**: entonces se le pone
   * silencio para que todos concatenen, y el audio propio del clip no llega a la mezcla.
   */
  tieneAudio: boolean;
  /** Fichero de salida del fragmento igualado. */
  salida: string;
  ancho: number;
  alto: number;
  /**
   * Cómo entra el clip en el formato (0.41.0). `bandas` es lo de siempre; `recorte` llena el formato y se queda con
   * la parte que dicen `x` e `y`. Sin indicar, bandas: así se iguala exactamente igual que antes.
   */
  encuadre?: Encuadre;
}

/**
 * Filtro de vídeo que lleva el clip al tamaño de salida. **El clip de la biblioteca no se toca**: es la fuente, y
 * de ella salen todos los formatos sin volver a generarla.
 *
 * - `bandas`: escala sin deformar hasta caber y rellena con negro (lo de la 0.32.0, argumento por argumento);
 * - `recorte`: recorta la proporción del formato y escala. La posición del recorte es la fracción del sobrante que
 *   queda a la izquierda o arriba, así que 0 pega el recorte al borde, 50 lo centra y 100 lo lleva al otro borde
 *   (la misma cuenta que `object-position` en la previsualización).
 */
export function filtroDeEncuadre(ancho: string, alto: string, encuadre: Encuadre): string[] {
  if (encuadre.modo === "bandas") {
    return [
      `[0:v]scale=${ancho}:${alto}:force_original_aspect_ratio=decrease`,
      `pad=${ancho}:${alto}:(ow-iw)/2:(oh-ih)/2:color=black`,
    ];
  }
  const x = numero(encuadre.x / 100, "encuadre horizontal");
  const y = numero(encuadre.y / 100, "encuadre vertical");
  // Se recorta **antes** de escalar: un vertical llevado a 16:9 se reduce a su franja y luego se escala, en lugar de
  // ampliarlo entero a 1920 × 3413 para tirar dos tercios. Un tercio de los píxeles; con fuentes de medidas no
  // exactas el recorte puede moverse uno o dos píxeles por redondear en la fuente, algo que no se ve.
  return [
    `[0:v]crop='min(iw,ih*${ancho}/${alto})':'min(ih,iw*${alto}/${ancho})':'(iw-ow)*${x}':'(ih-oh)*${y}'`,
    `scale=${ancho}:${alto}`,
  ];
}

/**
 * Orden que iguala **un** fragmento: corta el trozo, lo lleva al formato de salida con su encuadre (bandas o
 * recorte) y re-codifica con los mismos parámetros que todos los demás.
 *
 * El clip sin audio recibe una pista de silencio (`anullsrc`) en lugar de salir sin ella: un vídeo de la
 * concatenación con pista de audio y otro sin ella es lo que hace que el sonido se corte a mitad del montaje.
 */
export function ordenDeIgualar(f: FragmentoNormalizable): string[] {
  const ancho = entero(f.ancho, "ancho");
  const alto = entero(f.alto, "alto");
  const duracion = numero(f.duracion, "duración del fragmento");
  const filtro = [
    ...filtroDeEncuadre(ancho, alto, f.encuadre ?? { modo: "bandas" }),
    "setsar=1",
    `fps=${FPS_MONTAJE}[v]`,
  ].join(",");
  return [
    "ffmpeg",
    ...COMUNES,
    // `-ss` y `-t` **antes** de `-i`: FFmpeg busca y solo decodifica el trozo, y al re-codificar el corte es
    // exacto. Puestos después haría falta decodificar el clip entero para tirar casi todo.
    "-ss",
    numero(f.entrada, "entrada del fragmento"),
    "-t",
    duracion,
    "-i",
    rutaSegura(f.ruta),
    ...(f.tieneAudio ? [] : ["-f", "lavfi", "-t", duracion, "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]),
    "-filter_complex",
    filtro,
    "-map",
    "[v]",
    "-map",
    f.tieneAudio ? "0:a:0" : "1:a:0",
    ...VIDEO_SALIDA,
    ...AUDIO_SALIDA,
    "-t",
    duracion,
    rutaSegura(f.salida),
  ];
}

/** Fichero de lista del demuxer `concat`. Las rutas son nuestras y se comprueban una por una. */
export function listaDeConcatenacion(rutas: readonly string[]): string {
  return `${rutas.map((ruta) => `file '${rutaSegura(ruta)}'`).join("\n")}\n`;
}

// ── Montar el vídeo final ───────────────────────────────────────────────────────────────────────────────────

/** Una pista de audio que entra en la mezcla con su volumen y su desplazamiento. */
export interface PistaDeMezcla {
  ruta: string;
  /** Volumen en tanto por uno (0–2). */
  volumen: number;
  /** Milisegundos desde el principio del montaje en los que entra. 0 = desde el principio. */
  desdeMs: number;
}

export interface OpcionesDeMontaje {
  /** Fichero de lista del `concat`, ya escrito. */
  lista: string;
  /** Pistas de voz aparte (modo `pista`), cada una en el segundo de su fragmento. */
  voces: PistaDeMezcla[];
  /** Música autorizada del proyecto, desde el principio. */
  musica: PistaDeMezcla[];
  /** Volumen del audio que viene dentro de los clips. */
  volumenClip: number;
  /** Fichero de subtítulos que hay que quemar; `null` si no se queman. */
  subtitulos: string | null;
  /** Posición de la etiqueta; `null` cuando el montaje se exporta sin ella. */
  etiqueta: PosicionEtiqueta | null;
  /**
   * Logotipo del kit del creador (0.42.0), ya en disco en PNG, y la esquina elegida. `null` o sin indicar: sin kit, la
   * orden es exactamente la de siempre.
   */
  logo?: { ruta: string; esquina: EsquinaKit } | null;
  /** Duración total del montaje, en segundos. Es el corte de la salida. */
  segundos: number;
  ancho: number;
  alto: number;
  /** Formato de la salida: decide la zona segura de la etiqueta y de los subtítulos quemados. */
  formato: FormatoMontaje;
  salida: string;
}

/**
 * Orden que monta el vídeo final: concatena los fragmentos ya igualados, mezcla la voz y la música con sus
 * volúmenes, quema los subtítulos si toca, compone la etiqueta y escribe el MP4.
 *
 * La mezcla usa `amix` con `normalize=0` a propósito: con la normalización de serie, cada pista que se añade baja
 * el volumen de todas las demás, así que un montaje con música sonaría con la voz a la mitad sin que nadie lo
 * hubiera pedido.
 */
export function ordenDeMontar(o: OpcionesDeMontaje): string[] {
  const filtros: string[] = [];
  const pistas = [...o.voces, ...o.musica];

  /**
   * ── Vídeo: logotipo del kit, subtítulos quemados y etiqueta, **en ese orden**. El logotipo va el primero para que
   * nada suyo tape un subtítulo, y la etiqueta la última, siempre encima de todo: el kit del creador no la puede tapar
   * ni quitar (además, `colocacionDelLogo` lo pone en la franja contraria a la de la etiqueta).
   */
  let entradaVideo = "[0:v]";
  if (o.logo) {
    const indiceLogo = pistas.length + 1;
    const colocacion = colocacionDelLogo(o.logo.esquina, o.etiqueta, o.ancho, o.alto, o.formato);
    const { escala, posicion } = filtroDeLogo(colocacion, o.ancho, o.alto);
    filtros.push(`[${indiceLogo}:v]${escala}[logo]`);
    filtros.push(`[0:v][logo]${posicion}[vlogo]`);
    entradaVideo = "[vlogo]";
  }
  const pasosVideo = [
    ...(o.subtitulos ? [filtroDeSubtitulos(rutaSegura(o.subtitulos), o.formato)] : []),
    ...(o.etiqueta ? [filtroDeEtiqueta(o.etiqueta, o.alto, o.formato)] : []),
  ];
  filtros.push(`${entradaVideo}${pasosVideo.length > 0 ? pasosVideo.join(",") : "null"}[vout]`);

  // ── Audio: el de los clips, más una entrada por voz y por pista de música.
  const etiquetasAudio: string[] = ["[aclips]"];
  filtros.push(`[0:a]volume=${numero(o.volumenClip, "volumen del clip")}[aclips]`);
  const entradas: string[] = [];
  for (const [indice, pista] of pistas.entries()) {
    // `+1` porque la entrada 0 es la concatenación.
    const entradaFfmpeg = indice + 1;
    const nombre = `a${entradaFfmpeg}`;
    const pasos = [`volume=${numero(pista.volumen, "volumen de una pista")}`];
    // `adelay` con `all=1` desplaza todos los canales con un solo valor; sin él solo desplazaría el primero y la
    // pista saldría desfasada entre los dos altavoces.
    if (pista.desdeMs > 0) pasos.push(`adelay=${entero(Math.round(pista.desdeMs), "desplazamiento")}:all=1`);
    filtros.push(`[${entradaFfmpeg}:a]${pasos.join(",")}[${nombre}]`);
    etiquetasAudio.push(`[${nombre}]`);
    entradas.push("-i", rutaSegura(pista.ruta));
  }
  if (etiquetasAudio.length > 1) {
    filtros.push(`${etiquetasAudio.join("")}amix=inputs=${etiquetasAudio.length}:duration=longest:normalize=0[aout]`);
  } else {
    filtros.push("[aclips]anull[aout]");
  }

  return [
    "ffmpeg",
    ...COMUNES,
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    rutaSegura(o.lista),
    ...entradas,
    // El logotipo entra el último, después de todas las pistas de audio: su índice es el que usa el filtro de arriba.
    ...(o.logo ? ["-i", rutaSegura(o.logo.ruta)] : []),
    "-filter_complex",
    filtros.join(";"),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    ...VIDEO_SALIDA,
    ...AUDIO_SALIDA,
    ...METADATOS_BASICOS,
    // El corte de la salida: la mezcla puede ser más larga que el vídeo si una pista de música lo es.
    "-t",
    numero(o.segundos, "duración total"),
    rutaSegura(o.salida),
  ];
}
