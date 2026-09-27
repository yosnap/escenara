import type { Estimacion, TipoTrabajo, TrabajoVista } from "@/lib/generacion";

/** Cliente de la API de generación para el navegador. */

/**
 * `red: true` marca los fallos en los que **no se sabe** si la petición llegó al servidor. Importa al
 * enviar una generación: puede haberse encargado ya, así que no se invita a repetir sin más.
 */
export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string; red?: boolean };

async function pedir<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const respuesta = await fetch(url, init);
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      return { ok: false, error: cuerpo?.error ?? "No se ha podido completar la operación." };
    }
    return { ok: true, datos: cuerpo as T };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor.", red: true };
  }
}

const json = (cuerpo: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cuerpo),
});

interface Confirmacion {
  prompt: string;
  creditosConfirmados: number;
  derechos: boolean;
  avisoUmbralAceptado: boolean;
  /** La misma confirmación lleva siempre la misma clave: repetirla no genera un segundo trabajo. */
  claveIdempotencia: string;
}

export interface ConfirmacionFotograma extends Confirmacion {
  tipo: "fotograma";
  medioId: string;
}

export interface ConfirmacionAnimacion extends Confirmacion {
  tipo: "animacion";
  trabajoPadreId: string;
}

/** Envía la generación. `creditosConfirmados` son los créditos que el usuario tenía delante. */
export const crearTrabajo = (peticion: ConfirmacionFotograma | ConfirmacionAnimacion) =>
  pedir<TrabajoVista>("/api/generacion/trabajos", json(peticion));

export const consultarTrabajo = (id: string) => pedir<TrabajoVista>(`/api/generacion/trabajos/${id}`);

/** «Volver a consultar»: reconcilia con el identificador de tarea guardado, sin reenviar nada. */
export const reconsultarTrabajo = (id: string) =>
  pedir<TrabajoVista>(`/api/generacion/trabajos/${id}/consultar`, { method: "POST" });

export const consultarEstimacion = (tipo: TipoTrabajo) => pedir<Estimacion>(`/api/generacion/estimacion?tipo=${tipo}`);
