import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Subtitulo } from "@/lib/voz";
import { leerAjustes } from "../ajustes";

/**
 * Transcripción del audio de una escena, **en esta máquina y sin coste** (decisión provisional del propietario,
 * 2026-09-28: transcriptor local, sin clave y sin apuntes de gasto externo).
 *
 * Se ejecuta el binario de `whisper.cpp` (`whisper-cli`), que es el más sencillo de instalar en macOS y en Linux y
 * el único que hace falta: escribe un WebVTT con marcas de tiempo y no necesita ni Python ni GPU. El binario y su
 * modelo se configuran en **Admin › Ajustes**, no en `.env`.
 *
 * Igual que FFmpeg desde la 0.20.0, es una **dependencia del entorno**: si falta, esto no inventa subtítulos ni
 * finge una transcripción vacía, sino que lo dice con el mensaje de instalación
 * ({@link exigirTranscriptor}). Unos subtítulos inventados serían peor que no tenerlos: se publicarían.
 *
 * **No deja ningún apunte en el registro de gasto** porque no hay gasto: no sale nada de la máquina.
 */

export class ErrorTranscripcion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorTranscripcion";
  }
}

/** Lo que se le da como mucho a la transcripción. Un clip de la producción son 4 u 8 s: más que esto es un fallo. */
const MS_MAXIMO = 120_000;
/** Salida que se lee como mucho del proceso, para que un archivo raro no decida cuánta memoria gasta el servidor. */
const CARACTERES_MAXIMOS = 512 * 1024;

interface Salida {
  ok: boolean;
  salida: string;
  error: string;
}

async function leerAcotado(flujo: ReadableStream<Uint8Array> | undefined): Promise<string> {
  if (!flujo) return "";
  const decodificador = new TextDecoder();
  let texto = "";
  for await (const trozo of flujo) {
    if (texto.length < CARACTERES_MAXIMOS) texto += decodificador.decode(trozo as Uint8Array, { stream: true });
  }
  return texto.slice(0, CARACTERES_MAXIMOS);
}

/** Ejecuta un binario. Nunca lanza por su código de salida: quien llama decide qué significa. */
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
 * Disponibilidad del transcriptor, cacheada en el proceso **solo cuando es favorable**: que esté instalado no
 * cambia mientras el servidor corre, pero instalarlo sí puede pasar sin reiniciar, y quedarse diciendo que no está
 * sería un error que no se cura solo. Es la misma política que la comprobación de FFmpeg de la 0.20.0.
 */
const cache = globalThis as { __escenaraTranscriptor?: { disponible: boolean; motivo: string } };

/** Olvida la comprobación cacheada. Es para los tests y para cuando se cambia el binario en el panel. */
export function olvidarTranscriptor(): void {
  cache.__escenaraTranscriptor = undefined;
}

export async function transcriptorDisponible(): Promise<{ disponible: boolean; motivo: string }> {
  if (cache.__escenaraTranscriptor?.disponible) return cache.__escenaraTranscriptor;
  const { transcripcionBinario: binario, transcripcionModelo: modelo } = await leerAjustes();
  if (binario.trim() === "") {
    return {
      disponible: false,
      motivo:
        "No hay ningún transcriptor configurado. Indica su orden en Admin › Ajustes › Voz y subtítulos (de fábrica «whisper-cli»).",
    };
  }
  const instalacion = `Instálalo («brew install whisper-cpp» en macOS, el paquete o la compilación de whisper.cpp en Linux) o corrige su orden en Admin › Ajustes › Voz y subtítulos.`;
  try {
    // `--help` no transcribe nada y no necesita modelo: solo prueba que el binario existe y arranca.
    const { ok, salida, error } = await ejecutar([binario, "--help"]);
    // whisper.cpp devuelve un código distinto de 0 en `--help` según la versión, así que lo que se comprueba es
    // que **haya escrito su ayuda**: ejecutarse es lo que importa, no con qué código termina.
    if (!ok && `${salida}${error}`.trim() === "") {
      return { disponible: false, motivo: `«${binario}» está instalado pero no se ha podido ejecutar. ${instalacion}` };
    }
  } catch {
    return { disponible: false, motivo: `No se encuentra «${binario}» en esta máquina. ${instalacion}` };
  }
  if (modelo.trim() !== "" && !(await Bun.file(modelo).exists())) {
    return {
      disponible: false,
      motivo: `El fichero de modelo «${modelo}» no existe en esta máquina. Corrige su ruta en Admin › Ajustes › Voz y subtítulos, o déjala vacía para usar el modelo del propio binario.`,
    };
  }
  cache.__escenaraTranscriptor = { disponible: true, motivo: "" };
  return cache.__escenaraTranscriptor;
}

/** Lo mismo, pero lanzando: es lo que se llama antes de prometer unos subtítulos que no se pueden sacar. */
export async function exigirTranscriptor(): Promise<void> {
  const { disponible, motivo } = await transcriptorDisponible();
  if (!disponible) throw new ErrorTranscripcion(motivo);
}

/** `hh:mm:ss.mmm` o `mm:ss.mmm` a segundos. Una marca que no se entiende devuelve `null`. */
function segundosDeMarca(marca: string): number | null {
  const partes = marca.trim().replace(",", ".").split(":");
  if (partes.length < 2 || partes.length > 3) return null;
  let total = 0;
  for (const parte of partes) {
    const n = Number.parseFloat(parte);
    if (!Number.isFinite(n) || n < 0) return null;
    total = total * 60 + n;
  }
  return total;
}

/**
 * Segmentos a partir del WebVTT que escribe `whisper.cpp`. Lo que no se entiende **se descarta**, no se aproxima:
 * un tiempo inventado colocaría un subtítulo donde nadie ha dicho nada.
 */
export function segmentosDeWebVtt(vtt: string): Subtitulo[] {
  const segmentos: Subtitulo[] = [];
  const bloques = vtt.replace(/\r\n/g, "\n").split(/\n{2,}/);
  for (const bloque of bloques) {
    const lineas = bloque.split("\n").filter((l) => l.trim() !== "");
    const indice = lineas.findIndex((l) => l.includes("-->"));
    if (indice === -1) continue;
    const [crudoDesde, crudoHasta] = (lineas[indice] ?? "").split("-->");
    const desde = segundosDeMarca(crudoDesde ?? "");
    // El «hasta» puede traer detrás ajustes de posición de WebVTT: solo interesa la primera palabra.
    const hasta = segundosDeMarca((crudoHasta ?? "").trim().split(/\s+/)[0] ?? "");
    if (desde === null || hasta === null || hasta <= desde) continue;
    const texto = lineas
      .slice(indice + 1)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (texto === "") continue;
    segmentos.push({ desde: Math.round(desde * 100) / 100, hasta: Math.round(hasta * 100) / 100, texto });
  }
  return segmentos;
}

/**
 * Transcribe un archivo de audio o de vídeo y devuelve sus segmentos con marcas de tiempo.
 *
 * El archivo se convierte antes a WAV mono de 16 kHz con FFmpeg, que es lo único que acepta `whisper.cpp`, y los
 * dos temporales se borran siempre, también si algo falla: son el audio de alguien.
 *
 * Una transcripción **vacía es un resultado legítimo** (un clip sin voz no dice nada) y se devuelve como lista
 * vacía. Lo que no es legítimo es que el binario falle: eso lanza, para que la pantalla lo diga en lugar de
 * mostrar una escena «transcrita» sin nada dentro.
 */
export async function transcribir(datos: ArrayBuffer, extension: string): Promise<Subtitulo[]> {
  await exigirTranscriptor();
  const { transcripcionBinario: binario, transcripcionModelo: modelo } = await leerAjustes();
  const base = join(tmpdir(), `escenara-voz-${crypto.randomUUID()}`);
  const entrada = `${base}.${extension.replace(/[^a-z0-9]/gi, "") || "bin"}`;
  // El WAV convertido lleva su propio sufijo: si el archivo de origen ya era un `.wav`, entrada y salida serían
  // el mismo fichero y FFmpeg se negaría a escribir encima de lo que está leyendo.
  const wav = `${base}-16k.wav`;
  const vtt = `${wav}.vtt`;
  try {
    await writeFile(entrada, Buffer.from(datos));
    const conversion = await ejecutar([
      "ffmpeg",
      "-y",
      "-i",
      entrada,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      wav,
    ]);
    if (!conversion.ok) {
      throw new ErrorTranscripcion(
        "No se ha podido leer el audio de ese archivo. Comprueba que el clip tiene pista de audio y que FFmpeg está instalado.",
      );
    }
    const orden = [
      binario,
      ...(modelo.trim() === "" ? [] : ["-m", modelo]),
      "-f",
      wav,
      // WebVTT con marcas de tiempo, escrito junto al WAV. Español: el diálogo se escribe y se dice en español.
      "-ovtt",
      "-l",
      "es",
      // Sin avisos en la salida estándar: lo que se lee es el fichero, no lo que imprima.
      "-np",
    ];
    const resultado = await ejecutar(orden);
    const escrito = await Bun.file(vtt)
      .text()
      .catch(() => "");
    if (!resultado.ok && escrito === "") {
      console.error(`[voz] el transcriptor ha fallado: ${resultado.error.slice(0, 500)}`);
      throw new ErrorTranscripcion(
        `El transcriptor «${binario}» no ha podido transcribir este audio. Revisa su instalación y su fichero de modelo en Admin › Ajustes › Voz y subtítulos.`,
      );
    }
    return segmentosDeWebVtt(escrito);
  } finally {
    // Los temporales son el audio de alguien: se borran siempre, también si esto ha fallado.
    await Promise.all([entrada, wav, vtt].map((ruta) => unlink(ruta).catch(() => {})));
  }
}
