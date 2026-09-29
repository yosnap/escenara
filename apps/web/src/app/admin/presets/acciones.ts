"use server";

import type { CategoriaPreset, PresetVista } from "@/lib/presets";
import { exigirAdmin } from "@/server/auth/sesion";
import { listarPresetsDeLaInstalacion } from "@/server/prompts/consulta";
import { ErrorPreset } from "@/server/prompts/errores";
import {
  activarPresetDeLaInstalacion,
  crearPresetDeLaInstalacion,
  type DatosPreset,
  editarPresetDeLaInstalacion,
  ordenarGrupoDePresets,
  ordenarPresetDeLaInstalacion,
} from "@/server/prompts/presets-admin";

/**
 * Cambios del catálogo de presets **de la instalación**. Cada acción vuelve a exigir el rol de administrador
 * contra la base de datos: que la página solo se vea con rol de admin no basta, porque una acción se puede
 * invocar sola.
 *
 * Los presets de un usuario no se tocan desde aquí, ni siendo administrador: son suyos. Las funciones del
 * servidor exigen que la fila no tenga dueño.
 */

export type ResultadoPresets =
  /** Se devuelve el catálogo entero: cambiar el orden de uno cambia la lista. */
  { ok: true; presets: PresetVista[] } | { ok: false; error: string };

const RUTA = "/admin/presets";

async function aplicar(accion: () => Promise<unknown>): Promise<ResultadoPresets> {
  await exigirAdmin(RUTA);
  try {
    await accion();
    return { ok: true, presets: await listarPresetsDeLaInstalacion() };
  } catch (error) {
    if (error instanceof ErrorPreset) return { ok: false, error: error.message };
    console.error(`[presets] no se ha podido guardar el preset: ${(error as Error).message}`);
    return { ok: false, error: "No se ha podido guardar el cambio." };
  }
}

export async function crearPresetAccion(datos: DatosPreset): Promise<ResultadoPresets> {
  return aplicar(() => crearPresetDeLaInstalacion(datos));
}

export async function editarPresetAccion(id: string, datos: DatosPreset): Promise<ResultadoPresets> {
  return aplicar(() => editarPresetDeLaInstalacion(id, datos));
}

export async function activarPresetAccion(id: string, activo: boolean): Promise<ResultadoPresets> {
  return aplicar(() => activarPresetDeLaInstalacion(id, activo));
}

export async function ordenarPresetAccion(id: string, orden: number): Promise<ResultadoPresets> {
  return aplicar(() => ordenarPresetDeLaInstalacion(id, orden));
}

/** Orden completo de los presets de una categoría, tal como lo dejó quien administra al soltar. */
export async function ordenarGrupoPresetsAccion(categoria: CategoriaPreset, ids: string[]): Promise<ResultadoPresets> {
  return aplicar(() => ordenarGrupoDePresets(categoria, ids));
}
