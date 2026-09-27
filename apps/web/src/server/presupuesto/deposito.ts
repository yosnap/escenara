import { eq, sql } from "drizzle-orm";
import type { Deposito } from "@/lib/generacion";
import { type Ajustes, leerAjustes } from "../ajustes";
import { db, type Ejecutor } from "../db/cliente";
import { assistantRuns, generationJobs, usageLedger } from "../db/esquema";

/**
 * Lectura del depósito de presupuesto de un usuario. No hay ninguna columna con «saldo restante»: lo
 * comprometido se suma siempre del registro de gasto (`usage_ledger`), que es la única fuente de verdad.
 *
 * - `reservado` = reservas menos liberaciones (una liberación se apunta con créditos negativos);
 * - `consumido` = consumos más ajustes manuales.
 *
 * `retenido` es la parte de `reservado` que **nadie puede soltar solo**: trabajos `desconocido` (el proveedor no
 * contestó) y llamadas al modelo de texto que se quedaron a medias. Las dos cosas se cuentan aparte porque la
 * explicación que se le da al usuario no es la misma.
 *
 * Ambas cifras son estimaciones mientras el proveedor no informe los créditos de verdad; cada apunte
 * guarda en `informed` si sus créditos son ya los informados.
 */

export interface Comprometido {
  reservado: number;
  consumido: number;
  /** Parte de `reservado` retenida en trabajos `desconocido` y en llamadas de texto sin cerrar. */
  retenido: number;
  trabajosEnRevision: number;
  /** Llamadas al modelo de texto que se quedaron `reservado`: el barrido del worker las cierra. */
  llamadasDeTextoColgadas: number;
}

/**
 * Créditos comprometidos por el usuario. Acepta una transacción para poder sumarlos **dentro** de la misma
 * transacción que reserva: si se sumaran fuera, dos envíos simultáneos podrían leer el mismo saldo.
 */
export async function comprometidoDe(usuarioId: string, ejecutor: Ejecutor = db()): Promise<Comprometido> {
  const [fila] = await ejecutor
    .select({
      reservado: sql<number>`coalesce(sum(case when ${usageLedger.entryType} in ('reserva', 'liberacion') then ${usageLedger.credits} else 0 end), 0)::float8`,
      consumido: sql<number>`coalesce(sum(case when ${usageLedger.entryType} in ('consumo', 'ajuste') then ${usageLedger.credits} else 0 end), 0)::float8`,
      // Lo apartado en trabajos que nadie puede soltar solo: el proveedor no contestó y no se sabe si cobró.
      // Y lo apartado en llamadas de texto que no llegaron a cerrarse, por el mismo motivo.
      retenido: sql<number>`coalesce(sum(case when ${usageLedger.entryType} in ('reserva', 'liberacion') and (${generationJobs.state} = 'desconocido' or ${assistantRuns.state} = 'reservado') then ${usageLedger.credits} else 0 end), 0)::float8`,
      enRevision: sql<number>`count(distinct case when ${generationJobs.state} = 'desconocido' then ${generationJobs.id} end)::int`,
      textosColgados: sql<number>`count(distinct case when ${assistantRuns.state} = 'reservado' then ${assistantRuns.id} end)::int`,
    })
    .from(usageLedger)
    .leftJoin(generationJobs, eq(generationJobs.id, usageLedger.jobId))
    .leftJoin(assistantRuns, eq(assistantRuns.id, usageLedger.assistantRunId))
    .where(eq(usageLedger.userId, usuarioId));
  // Una liberación mayor que su reserva (un ajuste raro) no puede dejar el reservado en negativo.
  return {
    reservado: Math.max(0, fila?.reservado ?? 0),
    consumido: fila?.consumido ?? 0,
    retenido: Math.max(0, fila?.retenido ?? 0),
    trabajosEnRevision: fila?.enRevision ?? 0,
    llamadasDeTextoColgadas: fila?.textosColgados ?? 0,
  };
}

/** Tope autorizado y tope por trabajo tal como están configurados; `null` cuando el ajuste es 0 (sin tope). */
export function topesDe(ajustes: Ajustes): { autorizado: number | null; topeTrabajo: number | null } {
  return {
    autorizado: ajustes.presupuestoCreditos > 0 ? ajustes.presupuestoCreditos : null,
    topeTrabajo: ajustes.presupuestoTrabajo > 0 ? ajustes.presupuestoTrabajo : null,
  };
}

export function deposito(comprometido: Comprometido, ajustes: Ajustes): Deposito {
  const { autorizado, topeTrabajo } = topesDe(ajustes);
  const { reservado, consumido, retenido, trabajosEnRevision, llamadasDeTextoColgadas } = comprometido;
  return {
    autorizado,
    reservado,
    retenido,
    trabajosEnRevision,
    llamadasDeTextoColgadas,
    consumido,
    disponible: autorizado === null ? null : Math.max(0, autorizado - reservado - consumido),
    topeTrabajo,
    consumidoEuros: consumido * ajustes.eurosPorCredito,
  };
}

/** Depósito de presupuesto del usuario, listo para mostrar en la zona de claridad de «Crear». */
export async function depositoDe(usuarioId: string, ejecutor: Ejecutor = db()): Promise<Deposito> {
  const [comprometido, ajustes] = await Promise.all([comprometidoDe(usuarioId, ejecutor), leerAjustes()]);
  return deposito(comprometido, ajustes);
}
