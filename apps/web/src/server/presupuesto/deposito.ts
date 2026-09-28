import { eq, sql } from "drizzle-orm";
import type { Deposito } from "@/lib/generacion";
import { type Ajustes, leerAjustes } from "../ajustes";
import { db, type Ejecutor } from "../db/cliente";
import { assistantRuns, generationJobs, reviewResults, usageLedger } from "../db/esquema";

/**
 * Lectura del depósito de presupuesto de un usuario. No hay ninguna columna con «saldo restante»: lo
 * comprometido se suma siempre del registro de gasto (`usage_ledger`), que es la única fuente de verdad.
 *
 * - `reservado` = reservas menos liberaciones (una liberación se apunta con créditos negativos);
 * - `consumido` = consumos más ajustes manuales.
 *
 * `retenido` es la parte de `reservado` que **nadie puede soltar solo**: trabajos `desconocido` (el proveedor no
 * contestó), llamadas al modelo de texto que se quedaron a medias y revisiones multimodales que se quedaron con su
 * coste apartado. Las tres cosas se cuentan aparte porque la explicación que se le da al usuario no es la misma.
 *
 * Ambas cifras son estimaciones mientras el proveedor no informe los créditos de verdad; cada apunte
 * guarda en `informed` si sus créditos son ya los informados.
 */

export interface Comprometido {
  reservado: number;
  consumido: number;
  /** Euros ya apuntados, sumados de los apuntes: cada uno usó el cambio de su proveedor. */
  consumidoEuros: number;
  /** Parte de `reservado` retenida en trabajos `desconocido`, llamadas de texto y revisiones sin cerrar. */
  retenido: number;
  trabajosEnRevision: number;
  /** Llamadas al modelo de texto que se quedaron `reservado`: el barrido del worker las cierra. */
  llamadasDeTextoColgadas: number;
  /** Revisiones multimodales que se quedaron `reservado` (RF07): el mismo barrido las cierra. */
  revisionesColgadas: number;
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
      /**
       * Euros consumidos: se suman los **importes ya apuntados**, no los créditos (0.21.1). Cada apunte guarda su
       * importe con el cambio del proveedor que cobró, y desde que hay más de un proveedor los créditos de dos de
       * ellos no son la misma unidad: multiplicarlos todos por una sola cifra daba un euro inventado.
       */
      consumidoEuros: sql<number>`coalesce(sum(case when ${usageLedger.entryType} in ('consumo', 'ajuste') then coalesce(${usageLedger.amountEur}, 0) else 0 end), 0)::float8`,
      // Lo apartado en trabajos que nadie puede soltar solo: el proveedor no contestó y no se sabe si cobró.
      // Y lo apartado en llamadas de texto y en revisiones multimodales que no llegaron a cerrarse, por lo mismo.
      retenido: sql<number>`coalesce(sum(case when ${usageLedger.entryType} in ('reserva', 'liberacion') and (${generationJobs.state} = 'desconocido' or ${assistantRuns.state} = 'reservado' or ${reviewResults.state} = 'reservado') then ${usageLedger.credits} else 0 end), 0)::float8`,
      enRevision: sql<number>`count(distinct case when ${generationJobs.state} = 'desconocido' then ${generationJobs.id} end)::int`,
      textosColgados: sql<number>`count(distinct case when ${assistantRuns.state} = 'reservado' then ${assistantRuns.id} end)::int`,
      revisionesColgadas: sql<number>`count(distinct case when ${reviewResults.state} = 'reservado' then ${reviewResults.id} end)::int`,
    })
    .from(usageLedger)
    .leftJoin(generationJobs, eq(generationJobs.id, usageLedger.jobId))
    .leftJoin(assistantRuns, eq(assistantRuns.id, usageLedger.assistantRunId))
    .leftJoin(reviewResults, eq(reviewResults.id, usageLedger.reviewId))
    .where(eq(usageLedger.userId, usuarioId));
  // Una liberación mayor que su reserva (un ajuste raro) no puede dejar el reservado en negativo.
  return {
    reservado: Math.max(0, fila?.reservado ?? 0),
    consumido: fila?.consumido ?? 0,
    consumidoEuros: fila?.consumidoEuros ?? 0,
    retenido: Math.max(0, fila?.retenido ?? 0),
    trabajosEnRevision: fila?.enRevision ?? 0,
    llamadasDeTextoColgadas: fila?.textosColgados ?? 0,
    revisionesColgadas: fila?.revisionesColgadas ?? 0,
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
  const { reservado, consumido, retenido, trabajosEnRevision, llamadasDeTextoColgadas, revisionesColgadas } =
    comprometido;
  return {
    autorizado,
    reservado,
    retenido,
    trabajosEnRevision,
    llamadasDeTextoColgadas,
    revisionesColgadas,
    consumido,
    disponible: autorizado === null ? null : Math.max(0, autorizado - reservado - consumido),
    topeTrabajo,
    consumidoEuros: comprometido.consumidoEuros,
  };
}

/** Depósito de presupuesto del usuario, listo para mostrar en la zona de claridad de «Crear». */
export async function depositoDe(usuarioId: string, ejecutor: Ejecutor = db()): Promise<Deposito> {
  const [comprometido, ajustes] = await Promise.all([comprometidoDe(usuarioId, ejecutor), leerAjustes()]);
  return deposito(comprometido, ajustes);
}
