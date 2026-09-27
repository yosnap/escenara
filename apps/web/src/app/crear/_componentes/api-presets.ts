import type { CatalogoParaCrear, PresetVista } from "@/lib/presets";
import type { Resultado } from "./api-generacion";

/** Cliente de presets y plantillas para el navegador. */

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

/**
 * Presets y plantillas para el tipo de trabajo y el modelo indicados, con el motivo por el que el modelo no
 * admite cada opción. Es una lectura: no encola nada ni mueve dinero.
 */
export const consultarCatalogoDePresets = (tipo: "fotograma" | "animacion", modelo?: string) =>
  pedir<CatalogoParaCrear>(
    `/api/prompts/catalogo?tipo=${tipo}${modelo ? `&modelo=${encodeURIComponent(modelo)}` : ""}`,
  );

/** Edita **tu** copia de un preset. La de la instalación responde 403 y la de otro usuario, 404. */
export const editarPresetPropio = (
  id: string,
  cambios: { nombre: string; descripcion: string; prompt: string; proporcion?: string; segundos?: number },
) =>
  pedir<PresetVista>(`/api/prompts/presets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cambios),
  });

/** Borra tu copia. Los de la instalación no se borran: los desactiva quien administra. */
export const borrarPresetPropio = (id: string) => pedir<null>(`/api/prompts/presets/${id}`, { method: "DELETE" });

/** Duplica un preset de la instalación para hacerlo tuyo. */
export const duplicarPreset = (id: string) =>
  pedir<PresetVista>(`/api/prompts/presets/${id}/duplicar`, { method: "POST" });
