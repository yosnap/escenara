import { and, count, eq, inArray, sql } from "drizzle-orm";
import { ESTADOS_CANCELABLES } from "@/lib/generacion";
import { db } from "../db/cliente";
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

const LOTE = 500;

/**
 * Lo mismo para **todos** los trabajos de una cuenta, por lotes y filtrando en la base de datos: una cuenta con decenas
 * de miles de trabajos no cabe en una sola consulta ni tiene que cargarse entera en memoria.
 */
export async function cerrarTrabajosDeCuentaAntesDeBorrar(
  usuarioId: string,
  motivo: string,
): Promise<{ enMarcha: number; cancelados: number; siguenAbiertos: number }> {
  // Un trabajo sin respuesta cuyo coste ya está apuntado (como no confirmado) no retiene el borrado.
  const [{ total: enMarcha } = { total: 0 }] = await db()
    .select({ total: count() })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.userId, usuarioId),
        inArray(generationJobs.state, [...ESTADOS_QUE_IMPIDEN]),
        sql`not (${generationJobs.state} = 'desconocido' and exists (select 1 from usage_ledger l where l.job_id = ${generationJobs.id} and l.entry_type = 'consumo'))`,
      ),
    );
  if (enMarcha > 0) return { enMarcha, cancelados: 0, siguenAbiertos: 0 };
  let cancelados = 0;
  for (;;) {
    const lote = await db()
      .select()
      .from(generationJobs)
      .where(and(eq(generationJobs.userId, usuarioId), inArray(generationJobs.state, [...ESTADOS_CANCELABLES])))
      .limit(LOTE);
    if (lote.length === 0) break;
    const { cancelados: n } = await cerrarTrabajosAntesDeBorrar(lote, motivo);
    cancelados += n;
    if (n === 0) break;
  }
  const abiertas = async () =>
    (await db().execute(sql`
      select l.job_id as id, coalesce(j.consumed_credits, 0)::int as consumidos
      from usage_ledger l join generation_jobs j on j.id = l.job_id
      where l.user_id = ${usuarioId} and l.entry_type = 'reserva'
        and not exists (select 1 from usage_ledger x where x.job_id = l.job_id and x.entry_type = 'liberacion')
      limit ${LOTE}
    `)) as unknown as { id: string; consumidos: number }[];
  for (const r of await abiertas()) {
    await cerrarGasto(r.id, r.consumidos, `Cierre de la reserva de un trabajo terminado, ${motivo}.`);
  }
  return { enMarcha: 0, cancelados, siguenAbiertos: (await abiertas()).length };
}
