import type { DireccionElegidaConAcento, DireccionGuardada } from "@/lib/direccion";

/**
 * Cliente de **«Mis direcciones»** para el navegador. Lo usan los dos sitios donde se dirige un clip, porque
 * el panel es el mismo en los dos.
 *
 * Nada de esto genera ni cuesta: guardar, listar, aplicar, renombrar y borrar son lo contrario de gastar.
 */

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

async function pedir<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const respuesta = await fetch(url, init);
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) return { ok: false, error: cuerpo?.error ?? "No se ha podido completar la operación." };
    return { ok: true, datos: cuerpo as T };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." };
  }
}

const json = (metodo: string, cuerpo: unknown): RequestInit => ({
  method: metodo,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cuerpo),
});

export const listarDireccionesGuardadas = () => pedir<DireccionGuardada[]>("/api/direccion/guardadas");

export const guardarDireccionConNombre = (nombre: string, direccion: DireccionElegidaConAcento) =>
  pedir<DireccionGuardada>("/api/direccion/guardadas", json("POST", { nombre, direccion }));

export const renombrarDireccionGuardada = (id: string, nombre: string) =>
  pedir<DireccionGuardada>(`/api/direccion/guardadas/${id}`, json("PATCH", { nombre }));

export const borrarDireccionGuardada = (id: string) =>
  pedir<DireccionGuardada[]>(`/api/direccion/guardadas/${id}`, { method: "DELETE" });
