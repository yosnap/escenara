import type { OpcionesDeDireccion } from "@/lib/direccion";
import type { FormatoMontaje } from "@/lib/formatos";
import type { ProyectoDetalle } from "@/lib/proyectos";

/** Cliente de la API de proyectos para el navegador. */

/**
 * `red: true` marca los fallos en los que **no se sabe** si la petición llegó al servidor. Importa al pedirle
 * un guion al asistente: puede haberse ejecutado ya y haberse cobrado, así que no se invita a repetir sin más
 * (y si se repite, la clave de idempotencia evita el segundo cobro).
 */
export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string; red?: boolean };

async function pedir<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const respuesta = await fetch(url, init);
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) return { ok: false, error: cuerpo?.error ?? "No se ha podido completar la operación." };
    return { ok: true, datos: cuerpo as T };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor.", red: true };
  }
}

const json = (metodo: string, cuerpo: unknown): RequestInit => ({
  method: metodo,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cuerpo),
});

export interface NuevoProyecto {
  titulo: string;
  formato: string;
  idea: string;
  personajeId?: string | null;
  presupuestoCreditos?: number;
  /** Formatos de salida; el primero es el principal, en el que se generan los clips (0.41.0). */
  formatos?: FormatoMontaje[];
}

export const crearProyecto = (datos: NuevoProyecto) => pedir<ProyectoDetalle>("/api/proyectos", json("POST", datos));

export const editarProyecto = (id: string, cambios: Record<string, unknown>) =>
  pedir<ProyectoDetalle>(`/api/proyectos/${id}`, json("PATCH", cambios));

export const consultarProyecto = (id: string) => pedir<ProyectoDetalle>(`/api/proyectos/${id}`);

export const anadirEscena = (proyectoId: string, datos: Record<string, unknown>) =>
  pedir<ProyectoDetalle>(`/api/proyectos/${proyectoId}/escenas`, json("POST", datos));

export const reordenarEscenas = (proyectoId: string, orden: string[]) =>
  pedir<ProyectoDetalle>(`/api/proyectos/${proyectoId}/escenas`, json("PATCH", { orden }));

/** Catálogo de la dirección del clip. Solo nombres en castellano: el fragmento en inglés no sale (ADR-0022). */
export const catalogoDeDireccion = () => pedir<OpcionesDeDireccion>("/api/direccion");

export const editarEscena = (escenaId: string, cambios: Record<string, unknown>) =>
  pedir<ProyectoDetalle>(`/api/escenas/${escenaId}`, json("PATCH", cambios));

export const borrarEscena = (escenaId: string) =>
  pedir<ProyectoDetalle>(`/api/escenas/${escenaId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });

export const resolverAfirmacion = (afirmacionId: string, estado: string, fuente: string) =>
  pedir<ProyectoDetalle>(`/api/afirmaciones/${afirmacionId}`, json("PATCH", { estado, fuente }));

/** Aprueba el plan. `totalConfirmado` es el total que el usuario tenía delante: si ha cambiado, se rechaza. */
export const aprobarPlan = (proyectoId: string, presupuestoCreditos: number, totalConfirmado: number) =>
  pedir<ProyectoDetalle>(`/api/proyectos/${proyectoId}/plan`, json("POST", { presupuestoCreditos, totalConfirmado }));

/**
 * Pide el guion al asistente. **Gasta dinero**, así que lleva la estimación confirmada, su sello y una clave de
 * idempotencia que genera el navegador: repetirla no encarga (ni cobra) un segundo guion.
 */
export const pedirGuion = (
  proyectoId: string,
  datos: { claveIdempotencia: string; creditosConfirmados: number; selloEstimacion: string; escenas?: number },
) => pedir<ProyectoDetalle>(`/api/proyectos/${proyectoId}/asistente`, json("POST", datos));
