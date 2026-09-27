"use server";

import { exigirAdmin } from "@/server/auth/sesion";
import { type TrabajoEnRevision, trabajosEnRevision } from "@/server/cola/revision";
import { ErrorGeneracion } from "@/server/generacion/errores";
import { ajustarGasto } from "@/server/presupuesto/reserva";

export type ResultadoResolucion = { ok: true; trabajos: TrabajoEnRevision[] } | { ok: false; error: string };

/**
 * Resuelve a mano un trabajo en revisión: apunta los créditos que quien administra ha comprobado en el
 * proveedor (0 si no llegó a cobrar), libera la reserva y deja el motivo escrito en el registro de gasto.
 *
 * No reenvía nada ni cambia el resultado del trabajo: solo cierra su gasto.
 */
export async function resolverTrabajoAccion(
  trabajoId: string,
  creditos: number,
  motivo: string,
): Promise<ResultadoResolucion> {
  const sesion = await exigirAdmin("/admin/trabajos");
  try {
    await ajustarGasto(trabajoId, creditos, motivo, sesion.user.id);
    return { ok: true, trabajos: await trabajosEnRevision() };
  } catch (error) {
    if (error instanceof ErrorGeneracion) return { ok: false, error: error.message };
    console.error(`[cola] no se ha podido resolver el trabajo ${trabajoId}: ${(error as Error).message}`);
    return { ok: false, error: "No se ha podido resolver el trabajo." };
  }
}
