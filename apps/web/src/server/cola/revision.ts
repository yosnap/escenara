import { and, desc, eq, gt, inArray, isNotNull, type SQL, sql } from "drizzle-orm";
import { db } from "../db/cliente";
import { generationJobs, usageLedger, users } from "../db/esquema";

/**
 * Trabajos que necesitan que alguien decida a mano: los que quedaron `desconocido` porque el proveedor no
 * contestó. Su reserva de presupuesto sigue apartada, y eso es a propósito: soltar lo que quizá se ha pagado
 * sería mentir sobre el gasto.
 *
 * Quien administra los ve en `/admin/trabajos` y los cierra con los créditos que haya comprobado en el
 * proveedor. Nunca se reenvía nada desde aquí.
 */

export interface TrabajoEnRevision {
  id: string;
  usuario: string;
  correo: string;
  tipo: string;
  proveedor: string;
  modelo: string;
  taskId: string | null;
  creditosEstimados: number;
  /** Créditos que siguen reservados por este trabajo. */
  reservado: number;
  /** Techo que autorizó el usuario, si tuvo que fijarlo. */
  limiteCreditos: number | null;
  /** Créditos cobrados por encima de ese techo, si ha pasado. */
  excesoCreditos: number | null;
  motivo: string | null;
  creadoEn: string;
}

export async function trabajosEnRevision(limite = 100): Promise<TrabajoEnRevision[]> {
  return leerTrabajos(eq(generationJobs.state, "desconocido"), limite);
}

/**
 * Trabajos en los que el proveedor ha cobrado por encima del límite que el usuario autorizó. No hay nada que
 * deshacer (el precio final lo decide el proveedor y el gasto real ya está apuntado), pero quien administra
 * tiene que poder verlos: es el síntoma de un precio del catálogo desfasado o de un modelo que cobra por
 * unidad de tiempo sin declararla.
 */
export async function trabajosConExceso(limite = 100): Promise<TrabajoEnRevision[]> {
  return leerTrabajos(and(isNotNull(generationJobs.excessCredits), gt(generationJobs.excessCredits, 0)), limite);
}

async function leerTrabajos(condicion: SQL | undefined, limite: number): Promise<TrabajoEnRevision[]> {
  const filas = await db()
    .select({
      id: generationJobs.id,
      usuario: users.name,
      correo: users.email,
      tipo: generationJobs.kind,
      proveedor: generationJobs.provider,
      modelo: generationJobs.model,
      taskId: generationJobs.taskId,
      creditosEstimados: generationJobs.estimatedCredits,
      motivo: generationJobs.errorMessage,
      limiteCreditos: generationJobs.creditLimit,
      excesoCreditos: generationJobs.excessCredits,
      creadoEn: generationJobs.createdAt,
    })
    .from(generationJobs)
    .innerJoin(users, eq(users.id, generationJobs.userId))
    .where(condicion)
    .orderBy(desc(generationJobs.createdAt))
    .limit(limite);
  if (filas.length === 0) return [];

  // Lo que sigue apartado por cada trabajo: la reserva menos su liberación, si ya la tuviera.
  const apuntes = await db()
    .select({ jobId: usageLedger.jobId, tipo: usageLedger.entryType, creditos: usageLedger.credits })
    .from(usageLedger)
    .where(
      inArray(
        usageLedger.jobId,
        filas.map((f) => f.id),
      ),
    );
  const reservadoPorTrabajo = new Map<string, number>();
  for (const apunte of apuntes) {
    if (apunte.jobId === null) continue;
    if (apunte.tipo !== "reserva" && apunte.tipo !== "liberacion") continue;
    reservadoPorTrabajo.set(apunte.jobId, (reservadoPorTrabajo.get(apunte.jobId) ?? 0) + apunte.creditos);
  }

  return filas.map((f) => ({
    ...f,
    creadoEn: f.creadoEn.toISOString(),
    reservado: Math.max(0, reservadoPorTrabajo.get(f.id) ?? 0),
  }));
}

/** Cuántos trabajos están pendientes de revisión. Se usa en la cabecera del panel. */
export async function contarTrabajosEnRevision(): Promise<number> {
  const [fila] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(generationJobs)
    .where(eq(generationJobs.state, "desconocido"));
  return fila?.total ?? 0;
}
