import { hostname } from "node:os";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { ESTADOS_ACTIVOS, type EstadoCola, type EstadoTrabajo, MS_LATIDO_WORKER } from "@/lib/generacion";
import { db } from "../db/cliente";
import { generationJobs, queueWorkers } from "../db/esquema";

/**
 * Latido de los workers de la cola. Sirve para dos cosas:
 *
 * - decirle al usuario si hay alguien atendiendo la cola, en lugar de dejarle mirando un «en cola» eterno
 *   cuando el worker está parado (en local es fácil: es otro proceso);
 * - limpiar el registro de workers que ya no existen.
 *
 * No reparte trabajo: eso lo hace la toma con `FOR UPDATE SKIP LOCKED`, que no necesita saber quién vive.
 */

/**
 * Identificador del proceso worker: máquina, PID y momento de arranque. **Estable por proceso**: se calcula
 * una vez y se recuerda, para que usarlo como valor por defecto de una función (`pasadaDeCola`,
 * `enviarEncolados`) no invente una identidad distinta en cada llamada. Una identidad cambiante haría que
 * `soltarToma` no reconociera sus propias tomas.
 */
const memoria = globalThis as { __escenaraWorkerId?: string };

export function identificadorDeWorker(): string {
  memoria.__escenaraWorkerId ??= `${hostname()}-${process.pid}-${Date.now().toString(36)}`;
  return memoria.__escenaraWorkerId;
}

/** Registra o refresca el latido de este worker. */
export async function latir(workerId: string, atendidos = 0): Promise<void> {
  const ahora = new Date();
  await db()
    .insert(queueWorkers)
    .values({ id: workerId, startedAt: ahora, seenAt: ahora, handled: atendidos })
    .onConflictDoUpdate({ target: queueWorkers.id, set: { seenAt: ahora, handled: atendidos } });
}

/** Da de baja a este worker al pararse, y de paso limpia los que llevan mucho sin latir. */
export async function despedirse(workerId: string): Promise<void> {
  await db().delete(queueWorkers).where(eq(queueWorkers.id, workerId));
  await limpiarWorkersCaidos();
}

/**
 * Borra los workers sin latido reciente. Un worker que muere de golpe (un `kill -9`, un contenedor que se va)
 * no se da de baja, y su fila haría creer para siempre que alguien atiende la cola.
 */
export async function limpiarWorkersCaidos(): Promise<number> {
  const borrados = await db()
    .delete(queueWorkers)
    .where(lt(queueWorkers.seenAt, new Date(Date.now() - 3 * MS_LATIDO_WORKER)))
    .returning({ id: queueWorkers.id });
  return borrados.length;
}

/** Estado de la cola para un usuario: lo suyo que espera y si hay worker atendiendo. */
export async function estadoDeCola(usuarioId: string): Promise<EstadoCola> {
  const [suyos, ultimo] = await Promise.all([
    db()
      .select({ estado: generationJobs.state, total: sql<number>`count(*)::int` })
      .from(generationJobs)
      .where(and(eq(generationJobs.userId, usuarioId), inArray(generationJobs.state, [...ESTADOS_ACTIVOS])))
      .groupBy(generationJobs.state),
    db().select({ seenAt: queueWorkers.seenAt }).from(queueWorkers).orderBy(desc(queueWorkers.seenAt)).limit(1),
  ]);
  const porEstado = new Map(suyos.map((f) => [f.estado, f.total]));
  const latido = ultimo[0]?.seenAt ?? null;
  const conteo = (...estados: EstadoTrabajo[]) => estados.reduce((total, e) => total + (porEstado.get(e) ?? 0), 0);
  return {
    // «Esperando límite» espera una decisión suya, no al worker, así que va con los que están en cola.
    enCola: conteo("en_cola", "esperando_limite"),
    enMarcha: conteo("preparando", "enviando", "enviado", "en_curso"),
    workerActivo: latido !== null && Date.now() - latido.getTime() < MS_LATIDO_WORKER,
    ultimoLatido: latido?.toISOString() ?? null,
  };
}
