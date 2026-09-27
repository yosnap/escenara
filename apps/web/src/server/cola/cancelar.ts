import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { ESTADOS_CANCELABLES, type TrabajoVista } from "@/lib/generacion";
import { leerAjustes } from "../ajustes";
import { db } from "../db/cliente";
import { generationJobs } from "../db/esquema";
import { ErrorGeneracion } from "../generacion/errores";
import { condicionEnCurso, filaPropia, vistaDeFila } from "../generacion/trabajos";
import { cerrarTrabajoYGasto, reservar } from "../presupuesto/reserva";

/**
 * Dos decisiones que el usuario puede tomar sobre un trabajo que **todavía no ha salido** hacia el
 * proveedor: cancelarlo o autorizar un límite de gasto para que salga.
 *
 * Cancelar un trabajo ya enviado no se puede (llega en 0.19.0 y solo si el proveedor lo admite): aquí el
 * cambio de estado lleva la condición del estado en el propio `UPDATE`, así que si el worker lo ha tomado
 * justo antes, la cancelación no hace nada y se dice.
 */

/** Cancela un trabajo que sigue en cola o esperando límite, y suelta su reserva. */
export async function cancelarTrabajo(usuarioId: string, id: string): Promise<TrabajoVista> {
  // Comprueba antes que el trabajo es suyo: uno ajeno responde 404, no «no se puede cancelar».
  await filaPropia(usuarioId, id);
  // El cambio de estado y la liberación de la reserva van en la misma transacción: si el apunte fallara
  // después del `UPDATE`, el trabajo quedaría cancelado con su presupuesto apartado para siempre.
  const cancelada = await cerrarTrabajoYGasto(
    id,
    inArray(generationJobs.state, [...ESTADOS_CANCELABLES]),
    {
      state: "cancelado",
      failureReason: "cancelado",
      errorMessage: "Lo has cancelado antes de enviarlo al proveedor: no se ha gastado nada.",
      lockedBy: null,
      lockedUntil: null,
      finishedAt: new Date(),
    },
    0,
    "Cancelado por el usuario antes de enviarlo: no ha costado nada.",
  );
  if (!cancelada) {
    throw new ErrorGeneracion(
      409,
      "Este trabajo ya está en el proveedor y no se puede cancelar: espera a que termine. No se reenviará nada.",
    );
  }
  return vistaDeFila(cancelada);
}

/**
 * Autoriza un tope de créditos para un trabajo cuyo coste no se podía acotar y lo mete en la cola. La
 * reserva y el cambio de estado van en la misma transacción, con la fila del usuario bloqueada: el límite
 * que autoriza el usuario es exactamente lo que se aparta de su presupuesto.
 */
export async function autorizarLimite(usuarioId: string, id: string, creditos: unknown): Promise<TrabajoVista> {
  if (typeof creditos !== "number" || !Number.isInteger(creditos) || creditos <= 0 || creditos > 100_000_000) {
    throw new ErrorGeneracion(400, "Indica un número entero de créditos mayor que cero.");
  }
  const fila = await filaPropia(usuarioId, id);
  if (fila.state !== "esperando_limite") {
    throw new ErrorGeneracion(409, "Este trabajo no está esperando ningún límite de gasto.");
  }
  const ajustes = await leerAjustes();
  const actualizada = await db().transaction(async (tx) => {
    await tx.execute(sql`select 1 from users where id = ${usuarioId} for update`);
    // El tope de simultáneos se vuelve a comprobar **dentro** de la transacción: entre pedir el trabajo y
    // autorizar su límite puede haber pasado un rato largo y haber arrancado otros. Este trabajo ya cuenta
    // como activo (`esperando_limite`), así que se excluye del recuento.
    const [{ total } = { total: 0 }] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(generationJobs)
      .where(and(eq(generationJobs.userId, usuarioId), ne(generationJobs.id, id), condicionEnCurso()));
    if (total >= ajustes.trabajosSimultaneos) {
      throw new ErrorGeneracion(
        429,
        `Ya tienes ${total} trabajos en marcha, que es el máximo de esta instalación. Espera a que terminen y vuelve a autorizar este.`,
      );
    }
    const apunte = await reservar(
      tx,
      {
        usuarioId,
        trabajoId: id,
        proveedor: fila.provider,
        modelo: fila.model,
        creditos,
        sello: `limite-del-usuario:${fila.model}`,
      },
      ajustes,
    );
    const [puesta] = await tx
      .update(generationJobs)
      .set({
        state: "en_cola",
        // El techo autorizado se guarda aparte: `estimated_credits` sigue siendo lo que se le estimó al
        // usuario, y mezclar las dos cosas borraría la estimación original del trabajo.
        creditLimit: creditos,
        reservationId: apunte.id,
        failureReason: null,
        errorMessage: null,
        availableAt: new Date(),
      })
      .where(and(eq(generationJobs.id, id), eq(generationJobs.state, "esperando_limite")))
      .returning();
    if (!puesta) throw new ErrorGeneracion(409, "Este trabajo ya no está esperando ningún límite de gasto.");
    return puesta;
  });
  return vistaDeFila(actualizada);
}
