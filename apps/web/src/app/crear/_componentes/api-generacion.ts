import type { EvaluacionVista } from "@/lib/controles";
import type { Deposito, EstadoCola, Estimacion, TipoTrabajo, TrabajoVista } from "@/lib/generacion";

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
  /** Modelo elegido en el catálogo. */
  modelo: string;
  /** Sello del precio con el que se hizo la estimación: si ha cambiado, el servidor rechaza el envío. */
  selloEstimacion: string;
  creditosConfirmados: number;
  derechos: boolean;
  avisoUmbralAceptado: boolean;
  /** La misma confirmación lleva siempre la misma clave: repetirla no genera un segundo trabajo. */
  claveIdempotencia: string;
  /** Avisos «Necesita ajustes» confirmados expresamente, por su clave de regla (0.18.0). */
  avisosConfirmados: string[];
  /**
   * Versión de la ficha del personaje que se estaba mirando al confirmar. Si el servidor usaría otra, responde
   * 409 y hay que volver a revisar el contexto: la ficha entra en el prompt.
   */
  versionPersonaje?: string;
}

export interface ConfirmacionFotograma extends Confirmacion {
  tipo: "fotograma";
  /** Imagen suelta de la biblioteca; alternativa a `personajeId`. */
  medioId?: string;
  /** Personaje elegido: se le envían **varias** referencias suyas, hasta el tope del modelo. */
  personajeId?: string;
  /** Revisión de referencias (ADR-0009): en las fotos no aparece ningún tercero ni ningún menor. */
  sinTerceros?: boolean;
}

export interface ConfirmacionAnimacion extends Confirmacion {
  tipo: "animacion";
  trabajoPadreId: string;
  /**
   * Duración del clip que se ha confirmado, en segundos. Es la de la estimación que se tenía delante: cada
   * duración es una tarifa distinta del modelo, y lo que se paga es esta.
   */
  segundos?: number;
  /** Lo que dice el personaje: solo el clip tiene voz. */
  dialogo: string;
  /**
   * Revisión de referencias (ADR-0009). Obligatoria cuando el fotograma se hizo con un personaje: el clip
   * envía la misma cara al proveedor, así que es otro envío y necesita su propia confirmación.
   */
  sinTerceros?: boolean;
}

/** Envía la generación. `creditosConfirmados` son los créditos que el usuario tenía delante. */
export const crearTrabajo = (peticion: ConfirmacionFotograma | ConfirmacionAnimacion) =>
  pedir<TrabajoVista>("/api/generacion/trabajos", json(peticion));

export const consultarTrabajo = (id: string) => pedir<TrabajoVista>(`/api/generacion/trabajos/${id}`);

/** «Volver a consultar»: reconcilia con el identificador de tarea guardado, sin reenviar nada. */
export const reconsultarTrabajo = (id: string) =>
  pedir<TrabajoVista>(`/api/generacion/trabajos/${id}/consultar`, { method: "POST" });

/** Cancela un trabajo que aún no ha salido hacia el proveedor. Uno ya enviado responde 409. */
export const cancelarTrabajo = (id: string) =>
  pedir<TrabajoVista>(`/api/generacion/trabajos/${id}/cancelar`, { method: "POST" });

/** Autoriza un tope de créditos para un trabajo cuyo coste no se podía acotar, y lo encola. */
export const autorizarLimite = (id: string, creditos: number) =>
  pedir<TrabajoVista>(`/api/generacion/trabajos/${id}/limite`, json({ creditos }));

/** Estado de la cola y depósito de presupuesto de quien pregunta. */
export const consultarCola = () => pedir<{ cola: EstadoCola; deposito: Deposito }>("/api/generacion/cola");

/**
 * Estado de los controles previos: qué diría el servidor si generaras ahora (0.18.0). Es una lectura: no
 * encola nada ni mueve presupuesto.
 */
export const consultarControles = (peticion: {
  tipo: TipoTrabajo;
  modelo?: string;
  personajeId?: string;
  medioId?: string;
  escenaId?: string;
}) => {
  const parametros = new URLSearchParams({ tipo: peticion.tipo });
  for (const clave of ["modelo", "personajeId", "medioId", "escenaId"] as const) {
    const valor = peticion[clave];
    if (valor) parametros.set(clave, valor);
  }
  return pedir<EvaluacionVista>(`/api/generacion/controles?${parametros}`);
};

/**
 * Estimación del modelo indicado (sin modelo, el del mapa del usuario).
 *
 * `sinImagen` pide la del modelo que genera **sin imagen de partida** y `segundos`, la de esa duración
 * concreta: las dos cambian el modelo o la tarifa, así que la estimación se vuelve a pedir al servidor en
 * lugar de calcularla aquí. Nunca se muestra un coste que no haya dicho el servidor.
 */
export const consultarEstimacion = (
  tipo: TipoTrabajo,
  modelo?: string,
  opciones: { sinImagen?: boolean; segundos?: number } = {},
) => {
  const parametros = new URLSearchParams({ tipo });
  if (modelo) parametros.set("modelo", modelo);
  if (opciones.sinImagen) parametros.set("sinImagen", "1");
  if (opciones.segundos !== undefined) parametros.set("segundos", String(opciones.segundos));
  return pedir<Estimacion>(`/api/generacion/estimacion?${parametros}`);
};
