/**
 * Medida de un clip con `ffprobe` y `ffmpeg` (RF07). **No cuesta nada y no sale de la máquina**: se lee el archivo
 * que ya está en la biblioteca y se miden sus propiedades.
 *
 * Los dos binarios son una **dependencia del entorno**, no una librería: si no están, esto no inventa medidas ni
 * finge que todo está bien, sino que lo dice con un mensaje claro ({@link exigirHerramientasDeMedida}). Que falten
 * es un problema de instalación, y un panel con vistos verdes por no tener ffprobe sería la peor de las mentiras.
 */

/** Medidas de un clip. `null` en lo que el archivo no informe: no medir no es aprobar. */
export interface MedidasClip {
  /** Segundos reales del contenedor. */
  duracionSegundos: number | null;
  /** Medidas de visualización, con la rotación ya aplicada. */
  ancho: number | null;
  alto: number | null;
  fps: number | null;
  /** `true` cuando el contenedor tiene al menos una pista de audio con datos. */
  tieneAudio: boolean;
  /** `true` cuando el contenedor tiene al menos una pista de vídeo legible. */
  tieneVideo: boolean;
  /** Segundos de metraje negro; `null` si no se ha podido analizar. */
  segundosNegros: number | null;
  /** Segundos de metraje congelado (fotograma que no cambia); `null` si no se ha podido analizar. */
  segundosCongelados: number | null;
}

/** Clip que no se puede leer: ni ffprobe lo entiende ni tiene pista de vídeo. */
export const CLIP_ILEGIBLE: MedidasClip = {
  duracionSegundos: null,
  ancho: null,
  alto: null,
  fps: null,
  tieneAudio: false,
  tieneVideo: false,
  segundosNegros: null,
  segundosCongelados: null,
};

/** Tiempo máximo que se le da a cada binario. Un clip de la producción son 4 s: más que esto es que algo va mal. */
const MS_MAXIMO = 30_000;

export class ErrorMedida extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorMedida";
  }
}

interface Salida {
  ok: boolean;
  salida: string;
  error: string;
}

/**
 * Cuánto se lee como mucho de cada flujo. `ffmpeg` con `blackdetect` y `freezedetect` escribe una línea por tramo
 * en `stderr`, así que un vídeo raro (miles de microcortes) podría escribir megabytes; y lo que se busca está en las
 * primeras líneas. Acotarlo es lo que impide que un archivo cualquiera decida cuánta memoria gasta el servidor.
 */
const CARACTERES_MAXIMOS = 512 * 1024;

/** Lee un flujo hasta el tope y **descarta el resto sin acumularlo**, para no dejar el proceso escribiendo a un tubo lleno. */
async function leerAcotado(flujo: ReadableStream<Uint8Array> | undefined): Promise<string> {
  if (!flujo) return "";
  const decodificador = new TextDecoder();
  let texto = "";
  for await (const trozo of flujo) {
    if (texto.length < CARACTERES_MAXIMOS) {
      texto += decodificador.decode(trozo as Uint8Array, { stream: true });
    }
    // Pasado el tope se sigue consumiendo el flujo pero ya no se guarda nada.
  }
  return texto.slice(0, CARACTERES_MAXIMOS);
}

/** Ejecuta un binario y devuelve su salida. Nunca lanza por el código de salida: quien llama decide qué hacer. */
async function ejecutar(orden: readonly string[]): Promise<Salida> {
  const proceso = Bun.spawn([...orden], { stdout: "pipe", stderr: "pipe" });
  const temporizador = setTimeout(() => proceso.kill(), MS_MAXIMO);
  try {
    const [salida, error, codigo] = await Promise.all([
      leerAcotado(proceso.stdout),
      leerAcotado(proceso.stderr),
      proceso.exited,
    ]);
    return { ok: codigo === 0, salida, error };
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Comprueba que `ffprobe` y `ffmpeg` están instalados y utilizables. Se llama **al arrancar el worker**, para que
 * la falta se vea entonces y no en la primera revisión de alguien, y antes de cada revisión.
 *
 * El resultado se **cachea en el proceso**: que FFmpeg esté instalado no cambia mientras el servidor corre, y
 * lanzar dos procesos `-version` en cada revisión era un coste por petición a cambio de nada. Solo se cachea lo
 * favorable: si falta, se vuelve a mirar, porque instalarlo **sí** puede pasar sin reiniciar y quedarse diciendo
 * que no está sería un error que no se cura solo.
 */
const cacheHerramientas = globalThis as { __escenaraFfmpeg?: { disponibles: boolean; motivo: string } };

export async function herramientasDeMedida(): Promise<{ disponibles: boolean; motivo: string }> {
  if (cacheHerramientas.__escenaraFfmpeg?.disponibles) return cacheHerramientas.__escenaraFfmpeg;
  for (const binario of ["ffprobe", "ffmpeg"]) {
    try {
      const { ok } = await ejecutar([binario, "-version"]);
      if (!ok) return { disponibles: false, motivo: `«${binario}» está instalado pero no se ha podido ejecutar.` };
    } catch {
      return {
        disponibles: false,
        motivo: `No se encuentra «${binario}» en esta máquina. Las comprobaciones automáticas de la revisión necesitan FFmpeg: instálalo (en Debian/Ubuntu, «apt-get install ffmpeg»; en macOS, «brew install ffmpeg») y vuelve a arrancar.`,
      };
    }
  }
  cacheHerramientas.__escenaraFfmpeg = { disponibles: true, motivo: "" };
  return cacheHerramientas.__escenaraFfmpeg;
}

/** Olvida la comprobación cacheada. Es para los tests: en marcha, FFmpeg no se desinstala a mitad. */
export function olvidarHerramientasDeMedida(): void {
  cacheHerramientas.__escenaraFfmpeg = undefined;
}

/** Lo mismo, pero lanzando: es lo que usa la revisión antes de prometer una medida que no puede tomar. */
export async function exigirHerramientasDeMedida(): Promise<void> {
  const { disponibles, motivo } = await herramientasDeMedida();
  if (!disponibles) throw new ErrorMedida(motivo);
}

interface PistaFfprobe {
  codec_type?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  nb_frames?: string;
  side_data_list?: { rotation?: number }[];
}

const numero = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Fotogramas por segundo a partir de una fracción tipo `30/1`. */
function fotogramasPorSegundo(pista: PistaFfprobe): number | null {
  for (const fraccion of [pista.avg_frame_rate, pista.r_frame_rate]) {
    const [arriba, abajo] = (fraccion ?? "").split("/");
    const n = Number.parseFloat(arriba ?? "");
    const d = Number.parseFloat(abajo ?? "1");
    if (Number.isFinite(n) && Number.isFinite(d) && d !== 0 && n / d > 0) return Math.round((n / d) * 100) / 100;
  }
  return null;
}

/** `true` cuando la pista está girada un cuarto de vuelta, así que sus medidas de visualización se intercambian. */
function girada(pista: PistaFfprobe): boolean {
  const rotacion = pista.side_data_list?.find((d) => typeof d.rotation === "number")?.rotation ?? 0;
  return Math.abs(rotacion) % 180 === 90;
}

/**
 * Mide un clip con `ffprobe`. Un archivo que no se entiende devuelve {@link CLIP_ILEGIBLE} en lugar de lanzar: «no
 * se puede leer» es **un resultado de la revisión**, el más crítico de todos, no un error del servidor.
 */
export async function medirConFfprobe(ruta: string): Promise<MedidasClip> {
  const { ok, salida } = await ejecutar([
    "ffprobe",
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    ruta,
  ]);
  if (!ok) return CLIP_ILEGIBLE;
  let datos: { format?: { duration?: string }; streams?: PistaFfprobe[] };
  try {
    datos = JSON.parse(salida);
  } catch {
    return CLIP_ILEGIBLE;
  }
  const pistas = datos.streams ?? [];
  const video = pistas.find((p) => p.codec_type === "video" && (p.width ?? 0) > 0 && (p.height ?? 0) > 0);
  if (!video) return { ...CLIP_ILEGIBLE, tieneAudio: pistas.some((p) => p.codec_type === "audio") };
  const ancho = video.width ?? null;
  const alto = video.height ?? null;
  return {
    duracionSegundos: numero(datos.format?.duration),
    ancho: girada(video) ? alto : ancho,
    alto: girada(video) ? ancho : alto,
    fps: fotogramasPorSegundo(video),
    tieneAudio: pistas.some((p) => p.codec_type === "audio"),
    tieneVideo: true,
    segundosNegros: null,
    segundosCongelados: null,
  };
}

/** Umbral de negro de `blackdetect`: tramos de al menos este tiempo cuentan como negro. */
const NEGRO_MINIMO_SEGUNDOS = 0.1;

/** Suma los segundos que informan las líneas `black_duration:` o `freeze_duration:` de ffmpeg. */
function sumarDuraciones(texto: string, campo: string): number | null {
  const encontradas = [...texto.matchAll(new RegExp(`${campo}[:=]\\s*([0-9.]+)`, "g"))];
  if (encontradas.length === 0) return 0;
  const total = encontradas.reduce((suma, m) => suma + (Number.parseFloat(m[1] ?? "") || 0), 0);
  return Math.round(total * 100) / 100;
}

/**
 * Busca tramos negros y congelados con los filtros `blackdetect` y `freezedetect` de ffmpeg. Se decodifica el clip
 * sin escribir nada (`-f null -`), así que no se guarda ningún archivo nuevo.
 *
 * Devuelve `null` en los dos si ffmpeg falla: que el análisis no se pueda hacer se muestra como «no medible», no
 * como «no hay tramos planos».
 */
export async function buscarTramosPlanos(
  ruta: string,
): Promise<Pick<MedidasClip, "segundosNegros" | "segundosCongelados">> {
  const { ok, error } = await ejecutar([
    "ffmpeg",
    "-nostdin",
    "-hide_banner",
    "-i",
    ruta,
    "-vf",
    `blackdetect=d=${NEGRO_MINIMO_SEGUNDOS}:pix_th=0.10,freezedetect=n=-60dB:d=0.5`,
    "-an",
    "-f",
    "null",
    "-",
  ]);
  if (!ok) return { segundosNegros: null, segundosCongelados: null };
  return {
    segundosNegros: sumarDuraciones(error, "black_duration"),
    // `freezedetect` informa del final del tramo con `lavfi.freezedetect.freeze_duration`.
    segundosCongelados: sumarDuraciones(error, "freeze_duration"),
  };
}

/** Todas las medidas de un clip: las del contenedor y las del análisis de tramos planos. */
export async function medirClip(ruta: string): Promise<MedidasClip> {
  const medidas = await medirConFfprobe(ruta);
  // Sin pista de vídeo no hay nada que analizar: la comprobación del archivo ya falla y con eso está dicho todo.
  if (!medidas.tieneVideo) return medidas;
  return { ...medidas, ...(await buscarTramosPlanos(ruta)) };
}
