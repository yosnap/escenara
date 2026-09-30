import { FPS_MONTAJE } from "@/lib/montaje";
import { ErrorMontaje } from "./errores";

/**
 * FFmpeg para el render del montaje (RF08, 0.32.0). **No cuesta nada y no sale de la máquina**: se leen los
 * archivos que ya están en la biblioteca y se escribe uno nuevo.
 *
 * Tres cosas que este fichero hace a propósito y que no son negociables:
 *
 * 1. **nunca se interpola texto del usuario en una línea de órdenes**. Se lanza con `Bun.spawn` y un array de
 *    argumentos (no hay intérprete de órdenes de por medio), el único texto que se dibuja es la etiqueta, que es
 *    una constante nuestra, y los subtítulos viajan **en un fichero**, no en un argumento;
 * 2. **todo proceso tiene tope de tiempo y se mata al pasarlo**, y todo lo que se lee de sus flujos está acotado.
 *    Un archivo raro no puede decidir cuánta memoria ni cuánta CPU gasta el servidor;
 * 3. **el progreso son hechos**. Sale de `-progress`, que informa del segundo que FFmpeg lleva escrito de verdad;
 *    no hay ningún reloj estimando un porcentaje.
 */

/** Tope de tiempo de un proceso de FFmpeg. Igualar un clip son segundos; el montaje final, minutos. */
export const MS_MAXIMO_IGUALAR = 3 * 60_000;
export const MS_MAXIMO_MONTAR = 15 * 60_000;

/** Cuánto se guarda de `stderr` para poder explicar un fallo. Lo que importa está en las últimas líneas. */
const CARACTERES_MAXIMOS = 64 * 1024;

/**
 * Códec y ajustes de la salida. **Los mismos en la normalización y en el montaje final**: concatenar clips con
 * parámetros distintos es el riesgo declarado de la fase, y la única forma de que no pase es que todo pase por
 * aquí.
 */
export const VIDEO_SALIDA = [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "20",
  "-pix_fmt",
  "yuv420p",
  "-r",
  String(FPS_MONTAJE),
  // `+faststart`: la cabecera va al principio, que es lo que las plataformas necesitan para empezar a reproducir
  // sin descargar el fichero entero.
  "-movflags",
  "+faststart",
] as const;

export const AUDIO_SALIDA = ["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2"] as const;

/**
 * Metadatos básicos del MP4. C2PA (procedencia firmada) queda para la 0.46.0; esto es lo que se puede afirmar
 * hoy: que el contenido es generado con IA y con qué se montó.
 *
 * **No llevan el título del proyecto ni ningún otro texto del usuario.** Con `Bun.spawn` y argumentos en array no
 * hay intérprete de órdenes que pueda interpretarlo, pero la norma de esta versión es que en la línea de órdenes
 * de FFmpeg no entre texto de nadie, y un título en los metadatos no vale lo que cuesta hacer una excepción.
 */
export const METADATOS_BASICOS: readonly string[] = [
  "-metadata",
  "comment=Contenido generado con IA y montado con Escenara",
  "-metadata",
  "encoder=Escenara",
];

// ── Lanzar procesos ─────────────────────────────────────────────────────────────────────────────────────────

/** Lee un flujo hasta el tope y **descarta el resto sin acumularlo**, para no dejar el proceso escribiendo a un tubo lleno. */
async function leerAcotado(flujo: ReadableStream<Uint8Array> | undefined, maximo = CARACTERES_MAXIMOS) {
  if (!flujo) return "";
  const decodificador = new TextDecoder();
  let texto = "";
  for await (const trozo of flujo) {
    if (texto.length < maximo) texto += decodificador.decode(trozo as Uint8Array, { stream: true });
  }
  return texto.slice(0, maximo);
}

export interface SalidaProceso {
  ok: boolean;
  salida: string;
  error: string;
  /** `true` cuando se ha matado por pasarse del tope de tiempo. */
  agotado: boolean;
}

/**
 * Lanza un binario con sus argumentos **en array** (sin intérprete de órdenes) y espera a que termine. Nunca
 * lanza por el código de salida: quien llama decide qué decirle al usuario.
 *
 * El proceso se mata si pasa del tope, y se espera a `exited` siempre: así no queda ningún proceso huérfano
 * cuando el render falla a mitad.
 */
export async function ejecutar(
  orden: readonly string[],
  msMaximo: number,
  /** Se llama con cada segundo que FFmpeg informa de haber escrito, cuando la orden lleva `-progress pipe:1`. */
  alAvanzar?: (segundos: number) => void,
): Promise<SalidaProceso> {
  const proceso = Bun.spawn([...orden], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  let agotado = false;
  const temporizador = setTimeout(() => {
    agotado = true;
    proceso.kill();
  }, msMaximo);
  try {
    const [salida, error, codigo] = await Promise.all([
      alAvanzar ? leerProgreso(proceso.stdout, alAvanzar) : leerAcotado(proceso.stdout),
      leerAcotado(proceso.stderr),
      proceso.exited,
    ]);
    return { ok: codigo === 0 && !agotado, salida, error, agotado };
  } finally {
    clearTimeout(temporizador);
    // Si algo ha fallado antes de que el proceso terminara (una excepción al leer un flujo), se mata: un FFmpeg
    // suelto seguiría comiéndose la CPU del servidor después de que la exportación ya se haya dado por fallida.
    if (proceso.exitCode === null && proceso.signalCode === null) proceso.kill();
    await proceso.exited;
  }
}

/**
 * Lee el flujo de `-progress` y avisa del **segundo real** que FFmpeg lleva escrito.
 *
 * `-progress` escribe bloques de `clave=valor` y cierra cada uno con `progress=continue` o `progress=end`. Lo que
 * se mira es `out_time_us` (o `out_time_ms`, según la versión): son microsegundos de salida ya producidos, es
 * decir, un hecho y no una estimación.
 */
async function leerProgreso(
  flujo: ReadableStream<Uint8Array> | undefined,
  alAvanzar: (segundos: number) => void,
): Promise<string> {
  if (!flujo) return "";
  const decodificador = new TextDecoder();
  let pendiente = "";
  for await (const trozo of flujo) {
    pendiente += decodificador.decode(trozo as Uint8Array, { stream: true });
    const lineas = pendiente.split("\n");
    // La última puede estar a medias: se guarda para el siguiente trozo.
    pendiente = lineas.pop() ?? "";
    for (const linea of lineas) {
      const segundos = segundosDeLinea(linea);
      if (segundos !== null) alAvanzar(segundos);
    }
  }
  return "";
}

/** Segundos que informa una línea de `-progress`, o `null` si la línea no habla de tiempo. */
export function segundosDeLinea(linea: string): number | null {
  const [clave, valor] = linea.trim().split("=");
  if (valor === undefined) return null;
  const numero = Number.parseFloat(valor);
  if (!Number.isFinite(numero) || numero < 0) return null;
  if (clave === "out_time_us") return numero / 1_000_000;
  if (clave === "out_time_ms") return numero / 1_000;
  return null;
}

// ── Disponibilidad ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * FFmpeg es una **dependencia del entorno**, no una librería. Si falta, esto se niega a exportar con un mensaje
 * que dice qué instalar, en lugar de dejar una exportación en cola para siempre.
 *
 * Se apoya en la comprobación que ya existe desde la 0.20.0 (`revision/medicion.ts`), que cachea el resultado
 * favorable en el proceso: así no se lanzan dos procesos `-version` en cada petición.
 */
export async function exigirHerramientasDeRender(): Promise<void> {
  const { herramientasDeMedida } = await import("../revision/medicion");
  const { disponibles, motivo } = await herramientasDeMedida();
  if (!disponibles) throw new ErrorMontaje(503, motivo);
}
