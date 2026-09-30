import { inArray } from "drizzle-orm";
import { ESTADOS_CANCELABLES } from "@/lib/generacion";
import { type FilaTrabajo, generationJobs } from "../db/esquema";
import { conReservaAbierta, ESTADOS_QUE_IMPIDEN } from "../personajes/borrado";
import { cerrarGasto, cerrarTrabajoYGasto } from "../presupuesto/reserva";

/**
 * Lo que hay que hacer con los trabajos de lo que se va a borrar (un proyecto o una cuenta), con la misma regla que el
 * borrado de un personaje: **ninguna fila de trabajo se borra con la reserva sin cerrar**, porque el apunte perdería
 * su trabajo y la reserva se quedaría comida para siempre.
 *
 * - un trabajo que ya está en el proveedor **impide** el borrado: se va a cobrar y su resultado va a llegar;
 * - los que no han salido se cancelan liberando su reserva;
 * - lo que quede abierto se cierra con lo que informó el proveedor (o cero).
 */

export const enMarchaEnElProveedor = (trabajos: FilaTrabajo[]) =>
  trabajos.filter((t) => ESTADOS_QUE_IMPIDEN.includes(t.state));

export async function cerrarTrabajosAntesDeBorrar(
  trabajos: FilaTrabajo[],
  motivo: string,
): Promise<{ cancelados: number; siguenAbiertos: number }> {
  let cancelados = 0;
  for (const trabajo of trabajos.filter((t) => ESTADOS_CANCELABLES.includes(t.state))) {
    const cerrada = await cerrarTrabajoYGasto(
      trabajo.id,
      inArray(generationJobs.state, [...ESTADOS_CANCELABLES]),
      {
        state: "cancelado",
        failureReason: "cancelado",
        errorMessage: `Cancelado ${motivo}: no había salido hacia el proveedor y no se ha gastado nada.`,
        lockedBy: null,
        lockedUntil: null,
        finishedAt: new Date(),
      },
      0,
      `Cancelado ${motivo}: no ha costado nada.`,
    );
    if (cerrada) cancelados++;
  }
  const ids = trabajos.map((t) => t.id);
  for (const abiertoId of await conReservaAbierta(ids)) {
    const trabajo = trabajos.find((t) => t.id === abiertoId);
    await cerrarGasto(
      abiertoId,
      trabajo?.consumedCredits ?? 0,
      `Cierre de la reserva de un trabajo terminado, ${motivo}.`,
    );
  }
  return { cancelados, siguenAbiertos: (await conReservaAbierta(ids)).length };
}
