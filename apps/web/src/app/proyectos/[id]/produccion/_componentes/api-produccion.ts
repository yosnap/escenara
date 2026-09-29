import type { ProduccionVista } from "@/lib/produccion";

/** Cliente de la API de producción para el navegador. Nada de lógica: quien decide es el servidor. */

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string; red?: boolean };

async function pedir<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const respuesta = await fetch(url, init);
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) return { ok: false, error: cuerpo?.error ?? "No se ha podido completar la operación." };
    return { ok: true, datos: cuerpo as T };
  } catch {
    // `red: true`: no se sabe si la petición llegó. Puede haberse encolado ya, así que no se invita a repetir sin
    // más; y si se repite, la clave de idempotencia derivada evita el segundo cobro.
    return { ok: false, error: "Sin conexión con el servidor.", red: true };
  }
}

const json = (cuerpo: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cuerpo),
});

/** Confirmación de coste que viaja en cada acción que gasta. */
export interface ConfirmacionEnvio {
  derechos: boolean;
  /** Casilla «tengo derecho a usar esta marca» (0.26.0): obligatoria cuando la escena lleva producto. */
  derechoMarca: boolean;
  sinTerceros: boolean;
  creditosConfirmados: number;
  selloEstimacion: string;
  claveIdempotencia: string;
  avisoUmbralAceptado: boolean;
  avisosConfirmados: string[];
}

export const consultarProduccion = (proyectoId: string) =>
  pedir<ProduccionVista>(`/api/proyectos/${proyectoId}/produccion`);

export const producirProyecto = (proyectoId: string, confirmacion: ConfirmacionEnvio) =>
  pedir<ProduccionVista>(`/api/proyectos/${proyectoId}/produccion`, json(confirmacion));

const accionDeEscena = (escenaId: string, cuerpo: Record<string, unknown>) =>
  pedir<ProduccionVista>(`/api/escenas/${escenaId}/produccion`, json(cuerpo));

export const producirEscena = (escenaId: string, confirmacion: ConfirmacionEnvio) =>
  accionDeEscena(escenaId, { accion: "producir", ...confirmacion });

export const producirCanto = async (
  escenaId: string,
  confirmacion: ConfirmacionEnvio,
): Promise<Resultado<ProduccionVista>> => {
  const resultado = await pedir<{ produccion: ProduccionVista }>(
    `/api/escenas/${escenaId}/canto/produccion`,
    json(confirmacion),
  );
  return resultado.ok ? { ok: true, datos: resultado.datos.produccion } : resultado;
};

export const aprobarFotograma = (escenaId: string, confirmacion: ConfirmacionEnvio) =>
  accionDeEscena(escenaId, { accion: "aprobar-fotograma", ...confirmacion });

/**
 * Otro clip con el **mismo** fotograma aprobado (0.25.1), con la dirección y el texto que la escena tiene ahora.
 * Los clips anteriores se conservan: no se sustituye nada.
 */
export const otroClipDeEscena = (escenaId: string, confirmacion: ConfirmacionEnvio) =>
  accionDeEscena(escenaId, { accion: "otro-clip", ...confirmacion });

/**
 * Toma una imagen de tu biblioteca como fotograma de partida de la escena. **No gasta nada**: lo único que se
 * paga después es el clip.
 */
export const usarFotogramaDeBiblioteca = (escenaId: string, medioId: string) =>
  accionDeEscena(escenaId, { accion: "fotograma-de-biblioteca", medioId });

export const regenerarEscena = (escenaId: string, confirmacion: ConfirmacionEnvio) =>
  accionDeEscena(escenaId, { accion: "regenerar", ...confirmacion });

export const autorizarReintentos = (escenaId: string, reintentos: number) =>
  accionDeEscena(escenaId, { accion: "reintentos", reintentos });

/** Resultado de cancelar: qué se ha cancelado de verdad y qué se cobrará. */
export interface CancelacionDeEscena {
  canceladas: number;
  seCobraran: number;
  mensaje: string;
  estado: ProduccionVista;
}

export const cancelarEscena = (escenaId: string) =>
  pedir<CancelacionDeEscena>(`/api/escenas/${escenaId}/produccion`, json({ accion: "cancelar" }));
