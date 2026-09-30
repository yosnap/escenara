"use server";

import type { Capacidad } from "@/lib/catalogo";
import type { PlantillaVista, VersionPlantilla } from "@/lib/presets";
import { exigirAdmin } from "@/server/auth/sesion";
import { historialDePlantilla, listarPlantillas } from "@/server/prompts/consulta";
import { ErrorPreset } from "@/server/prompts/errores";
import {
  activarPlantillaDeLaInstalacion,
  caducarTrend,
  crearPlantillaDeLaInstalacion,
  type DatosPlantilla,
  duplicarTrend,
  editarPlantillaDeLaInstalacion,
  fijarDemoDePlantilla,
  ordenarGrupoDePlantillas,
} from "@/server/prompts/plantillas-admin";

/**
 * Cambios de las plantillas **de la instalación**. Como en los presets, cada acción vuelve a exigir el rol de
 * administrador contra la base de datos.
 *
 * Editar el texto, las variables o las restricciones **crea una versión nueva** con su motivo: los trabajos ya
 * hechos siguen citando la que usaron, así que editar una plantilla no cambia lo ya generado.
 */

export type ResultadoPlantillas = { ok: true; plantillas: PlantillaVista[] } | { ok: false; error: string };

const RUTA = "/admin/plantillas";

async function aplicar(accion: (autorId: string) => Promise<unknown>): Promise<ResultadoPlantillas> {
  const sesion = await exigirAdmin(RUTA);
  try {
    await accion(sesion.user.id);
    return { ok: true, plantillas: await listarPlantillas() };
  } catch (error) {
    if (error instanceof ErrorPreset) return { ok: false, error: error.message };
    console.error(`[presets] no se ha podido guardar la plantilla: ${(error as Error).message}`);
    return { ok: false, error: "No se ha podido guardar el cambio." };
  }
}

export async function crearPlantillaAccion(datos: DatosPlantilla): Promise<ResultadoPlantillas> {
  return aplicar((autorId) => crearPlantillaDeLaInstalacion(datos, autorId));
}

export async function editarPlantillaAccion(id: string, datos: DatosPlantilla): Promise<ResultadoPlantillas> {
  return aplicar((autorId) => editarPlantillaDeLaInstalacion(id, datos, autorId));
}

/** Pone (medio de la biblioteca) o quita (`null`) el ejemplo de una plantilla. No crea versión. */
export async function fijarDemoAccion(id: string, medioId: string | null): Promise<ResultadoPlantillas> {
  return aplicar(() => fijarDemoDePlantilla(id, medioId));
}

export async function activarPlantillaAccion(id: string, activa: boolean): Promise<ResultadoPlantillas> {
  return aplicar(() => activarPlantillaDeLaInstalacion(id, activa));
}

/** Orden completo de las plantillas de una capacidad, tal como lo dejó quien administra al soltar. */
export async function ordenarGrupoPlantillasAccion(capacidad: Capacidad, ids: string[]): Promise<ResultadoPlantillas> {
  return aplicar(() => ordenarGrupoDePlantillas(capacidad, ids));
}

export async function caducarTrendAccion(id: string): Promise<ResultadoPlantillas> {
  return aplicar(() => caducarTrend(id));
}

export async function duplicarTrendAccion(id: string, clave: string): Promise<ResultadoPlantillas> {
  return aplicar((autorId) => duplicarTrend(id, clave, autorId));
}

/** Historial de versiones de una plantilla de la instalación. Solo lectura. */
export async function historialPlantillaAccion(
  id: string,
): Promise<{ ok: true; versiones: VersionPlantilla[] } | { ok: false; error: string }> {
  await exigirAdmin(RUTA);
  try {
    return { ok: true, versiones: await historialDePlantilla(id) };
  } catch (error) {
    if (error instanceof ErrorPreset) return { ok: false, error: error.message };
    return { ok: false, error: "No se ha podido leer el historial." };
  }
}
