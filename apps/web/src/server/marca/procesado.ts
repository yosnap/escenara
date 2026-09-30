import { ErrorMarca } from "./http";

/**
 * **Cupo y tiempo máximo del procesado de imágenes de marca** (logotipos de la instalación y del kit, e iconos al
 * publicar).
 *
 * sharp trabaja en el threadpool de libuv, el mismo que usan `fs`, `crypto` y DNS: si varias subidas lo ocupan a la vez,
 * el servidor deja de responder a todo lo demás. Por eso:
 *
 * - como mucho **dos** procesados a la vez por proceso; la tercera subida simultánea recibe un 503 con la causa al
 *   momento, en lugar de ponerse en cola y acumular CPU;
 * - cada pipeline lleva el `timeout` de sharp (libvips lo cancela de verdad) y, además, una carrera con un reloj: si
 *   algo se atasca fuera de sharp, la petición termina igual y el cupo se libera cuando el trabajo acaba de verdad.
 */

export const PROCESADOS_SIMULTANEOS = 2;
export const SEGUNDOS_MAXIMOS_PROCESADO = 10;

const estado = globalThis as { __escenaraProcesadosMarca?: number };

export const procesadosEnCurso = (): number => estado.__escenaraProcesadosMarca ?? 0;

export async function conCupoDeImagen<T>(
  trabajo: () => Promise<T>,
  milisegundos = SEGUNDOS_MAXIMOS_PROCESADO * 1000 + 2000,
): Promise<T> {
  if (procesadosEnCurso() >= PROCESADOS_SIMULTANEOS) {
    throw new ErrorMarca(
      503,
      "Ahora mismo se están procesando otras imágenes en esta instalación. Espera unos segundos y vuelve a subirla.",
    );
  }
  estado.__escenaraProcesadosMarca = procesadosEnCurso() + 1;
  const enMarcha = trabajo();
  // El cupo se libera cuando el trabajo termina de verdad, no cuando vence el reloj: así un trabajo atascado sigue
  // contando y no se acumulan más encima.
  void enMarcha
    .catch(() => {})
    .finally(() => {
      estado.__escenaraProcesadosMarca = Math.max(0, procesadosEnCurso() - 1);
    });
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(
      () =>
        rechazar(
          new ErrorMarca(
            422,
            `La imagen ha tardado más de ${SEGUNDOS_MAXIMOS_PROCESADO} segundos en procesarse y se ha descartado. Prueba con una más pequeña.`,
          ),
        ),
      milisegundos,
    );
  });
  try {
    return await Promise.race([enMarcha, limite]);
  } finally {
    clearTimeout(reloj);
  }
}
