import type { EvaluacionVista } from "@/lib/controles";
import type { Estimacion, TrabajoVista } from "@/lib/generacion";

/**
 * Cliente de las **imágenes encargadas desde una ficha** (un lugar, un producto). Pide lo mismo que «Crear» para un
 * fotograma: la estimación con su sello y lo que diría la puerta de controles. El encargo lo hace la ruta de cada
 * ficha, con la confirmación de aquí.
 */

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

export async function pedirJson<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const respuesta = await fetch(url, init);
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      return {
        ok: false,
        error:
          cuerpo?.error ?? `El servidor ha respondido ${respuesta.status} sin decir la causa. Vuelve a intentarlo.`,
      };
    }
    return { ok: true, datos: cuerpo as T };
  } catch {
    return {
      ok: false,
      error: "Sin conexión con el servidor: no se ha encargado nada. Comprueba la red y reinténtalo.",
    };
  }
}

/** Estimación del fotograma que se encarga: con imagen de partida (una edición) o sin ella (texto a imagen). */
export const estimacionDeImagen = (sinImagen: boolean) =>
  pedirJson<Estimacion>(`/api/generacion/estimacion?tipo=fotograma${sinImagen ? "&sinImagen=1" : ""}`);

/** Lo que diría la puerta de controles con ese modelo y, si la hay, con esa imagen de partida. */
export const controlesDeImagen = (medioId: string | null, modelo: string) =>
  pedirJson<EvaluacionVista>(
    `/api/generacion/controles?${new URLSearchParams({ tipo: "fotograma", modelo, ...(medioId ? { medioId } : {}) })}`,
  );

/** La confirmación que viaja con el encargo: la misma que la de un fotograma de «Crear». */
export interface ConfirmacionDeImagen {
  creditosConfirmados: number;
  derechos: boolean;
  claveIdempotencia: string;
  selloEstimacion: string;
  modelo: string;
  avisoUmbralAceptado: boolean;
  avisosConfirmados: string[];
}

/** Encarga en la ruta de la ficha: se cobra y se confirma como cualquier fotograma. */
export const encargarImagen = (url: string, cuerpo: ConfirmacionDeImagen & Record<string, unknown>) =>
  pedirJson<TrabajoVista>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
