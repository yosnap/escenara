import type { ParContraste } from "./marca-contraste";
import type { ErrorCampo } from "./marca-esquema";

/**
 * Petición de las pantallas de marca y kit. Devuelve el cuerpo o **el error con su causa**: el mensaje del servidor, los
 * campos que fallan y los pares de contraste que bloquean. Un fallo de red también dice qué ha pasado.
 */
export type RespuestaMarca<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string; errores: ErrorCampo[]; bloqueos: ParContraste[] };

export async function pedirMarca<T>(url: string, init: RequestInit = {}): Promise<RespuestaMarca<T>> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, init);
  } catch {
    return {
      ok: false,
      error: "No se ha podido conectar con el servidor. Comprueba la conexión y vuelve a intentarlo.",
      errores: [],
      bloqueos: [],
    };
  }
  if (respuesta.status === 204) return { ok: true, datos: undefined as T };
  const cuerpo = (await respuesta.json().catch(() => null)) as
    | (T & { error?: string; errores?: ErrorCampo[]; bloqueos?: ParContraste[] })
    | null;
  if (respuesta.ok && cuerpo) return { ok: true, datos: cuerpo };
  return {
    ok: false,
    error: cuerpo?.error ?? `El servidor ha respondido ${respuesta.status} sin decir por qué. Vuelve a intentarlo.`,
    errores: cuerpo?.errores ?? [],
    bloqueos: cuerpo?.bloqueos ?? [],
  };
}

export const enJson = (metodo: string, cuerpo?: unknown): RequestInit => ({
  method: metodo,
  headers: cuerpo === undefined ? {} : { "Content-Type": "application/json" },
  ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
});
