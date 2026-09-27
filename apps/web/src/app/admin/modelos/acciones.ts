"use server";

import type { CambioCatalogo, Capacidad, EstadoModelo, ModeloVista } from "@/lib/catalogo";
import { exigirAdmin } from "@/server/auth/sesion";
import { historialCatalogo, listarModelos } from "@/server/proveedores/catalogo";
import {
  cambiarEstadoDeModelo,
  cambiarPrecioDeModelo,
  marcarPredeterminado,
} from "@/server/proveedores/catalogo-admin";
import { ErrorCatalogo } from "@/server/proveedores/contrato";

/**
 * Cambios del catálogo de modelos. Cada acción vuelve a exigir el rol de administrador contra la base de
 * datos: que la página solo se vea con rol de admin no basta, porque una acción se puede invocar sola.
 */

export type ResultadoModelo =
  /** Se devuelve el catálogo entero: un cambio puede afectar a otro modelo (la opción por defecto). */
  | { ok: true; modelos: ModeloVista[]; historial: CambioCatalogo[]; estimacionesAfectadas: number }
  | { ok: false; error: string };

const RUTA = "/admin/modelos";

async function aplicar(
  accion: (autorId: string) => Promise<{ modelo: ModeloVista; estimacionesAfectadas: number }>,
): Promise<ResultadoModelo> {
  const sesion = await exigirAdmin(RUTA);
  try {
    const { estimacionesAfectadas } = await accion(sesion.user.id);
    const [modelos, historial] = await Promise.all([listarModelos(), historialCatalogo()]);
    return { ok: true, modelos, historial, estimacionesAfectadas };
  } catch (error) {
    if (error instanceof ErrorCatalogo) return { ok: false, error: error.message };
    console.error(`[catalogo] no se ha podido cambiar el modelo: ${(error as Error).message}`);
    return { ok: false, error: "No se ha podido guardar el cambio." };
  }
}

/** Cambia el precio de un modelo con su fuente y la fecha en que se comprobó. */
export async function guardarPrecioAccion(datos: {
  modeloId: string;
  creditos: number;
  fuente: string;
  comprobado: string;
}): Promise<ResultadoModelo> {
  return aplicar((autorId) => cambiarPrecioDeModelo(datos, autorId));
}

/** Cambia el estado de un modelo. `validado` exige evidencia. */
export async function cambiarEstadoAccion(datos: {
  modeloId: string;
  estado: EstadoModelo;
  evidencia: string;
}): Promise<ResultadoModelo> {
  return aplicar((autorId) => cambiarEstadoDeModelo(datos, autorId));
}

/** Marca el modelo como opción por defecto de una capacidad (solo uno por capacidad). */
export async function marcarPredeterminadoAccion(datos: {
  modeloId: string;
  capacidad: Capacidad;
}): Promise<ResultadoModelo> {
  return aplicar((autorId) => marcarPredeterminado(datos, autorId));
}
