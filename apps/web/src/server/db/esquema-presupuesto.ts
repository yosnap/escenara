import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./esquema-auth";
import { proveedorCredencial } from "./esquema-boveda";
import { generationJobs } from "./esquema-generacion";

/**
 * Registro de gasto (`UsageLedger`) y registro de workers de la cola.
 *
 * El registro de gasto es la única fuente de verdad del presupuesto: no hay ninguna columna con «saldo
 * restante» que se pueda desincronizar. El saldo autorizado sale de Admin › Ajustes y lo comprometido se
 * calcula sumando apuntes, siempre dentro de la misma transacción que encola el trabajo.
 *
 * Nunca se presupone un precio fijo: cada apunte guarda si sus créditos son estimados o informados por el
 * proveedor, y con qué versión y sello del registro de precios se calcularon.
 */

/**
 * Tipo de apunte:
 *
 * - `reserva`: se aparta el coste máximo estimable antes de enviar nada (créditos positivos);
 * - `liberacion`: devuelve una reserva al conciliar el trabajo (créditos negativos);
 * - `consumo`: lo que el trabajo ha costado de verdad (créditos positivos);
 * - `ajuste`: corrección manual de quien administra, siempre con motivo escrito.
 */
export const tipoApunte = pgEnum("usage_entry_type", ["reserva", "consumo", "liberacion", "ajuste"]);

export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Trabajo al que pertenece el apunte; `null` solo en los ajustes que no son de un trabajo concreto. */
    jobId: uuid("job_id").references(() => generationJobs.id, { onDelete: "set null" }),
    /**
     * Ejecución del asistente de guion a la que pertenece el apunte (0.17.0); `null` en todo lo demás. El
     * texto también cuesta, y su llamada no crea un trabajo de generación: su gasto se apunta aquí con la
     * misma mecánica de reserva, consumo y liberación.
     *
     * Sin restricción de clave ajena a propósito, igual que `generation_jobs.reservation_id`: los apuntes no se
     * borran nunca y la tabla se define aparte para no montar una referencia circular entre los dos módulos.
     */
    assistantRunId: uuid("assistant_run_id"),
    /**
     * Revisión multimodal a la que pertenece el apunte (RF07); `null` en todo lo demás. Mirar un clip con un
     * modelo **también cuesta**, y su llamada no crea ni un trabajo de generación ni una ejecución del
     * asistente: su gasto se apunta aquí con la misma mecánica de reserva, consumo y liberación.
     *
     * Sin restricción de clave ajena, igual que `assistant_run_id`: los apuntes no se borran nunca y la tabla se
     * define aparte para no montar una referencia circular entre los dos módulos del esquema.
     */
    reviewId: uuid("review_id"),
    provider: proveedorCredencial("provider").notNull(),
    model: text("model").notNull(),
    entryType: tipoApunte("entry_type").notNull(),
    /** Créditos del apunte, con signo: una liberación es negativa. */
    credits: real("credits").notNull(),
    /** Equivalente en euros con el cambio configurado cuando se hizo el apunte; orientativo. */
    amountEur: real("amount_eur"),
    /** `false` mientras los créditos sean una estimación nuestra; `true` cuando los informa el proveedor. */
    informed: boolean("informed").notNull().default(false),
    /** Versión del registro de precios con la que se calculó (`model_prices.version`). */
    priceVersion: integer("price_version"),
    /** Sello del precio: identifica la estimación exacta que se le mostró al usuario. */
    priceStamp: text("price_stamp"),
    /** Motivo del apunte, apto para mostrar. En los ajustes es obligatorio escribirlo. */
    note: text("note").notNull().default(""),
    /** Quién hizo el ajuste manual; `null` en los apuntes automáticos. */
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * Un trabajo tiene como mucho una reserva, un consumo y una liberación. Es lo que hace idempotentes la
     * conciliación y el callback del proveedor: un callback repetido no crea un segundo consumo. Los
     * ajustes quedan fuera del índice: corregir a mano dos veces el mismo trabajo es legítimo.
     */
    uniqueIndex("usage_ledger_trabajo_apunte_uq").on(t.jobId, t.entryType).where(sql`${t.entryType} <> 'ajuste'`),
    /**
     * Lo mismo para el asistente: una ejecución tiene como mucho una reserva, un consumo y una liberación. Es
     * lo que hace idempotente el cierre de una llamada de texto que se repita.
     */
    uniqueIndex("usage_ledger_ejecucion_apunte_uq")
      .on(t.assistantRunId, t.entryType)
      .where(sql`${t.entryType} <> 'ajuste'`),
    /**
     * Y lo mismo para la revisión multimodal: una revisión tiene como mucho una reserva, un consumo y una
     * liberación. Es lo que hace idempotente el cierre de una revisión que se repita.
     */
    uniqueIndex("usage_ledger_revision_apunte_uq").on(t.reviewId, t.entryType).where(sql`${t.entryType} <> 'ajuste'`),
    index("usage_ledger_usuario_idx").on(t.userId, t.createdAt),
    index("usage_ledger_trabajo_idx").on(t.jobId),
    index("usage_ledger_ejecucion_idx").on(t.assistantRunId),
    index("usage_ledger_revision_idx").on(t.reviewId),
  ],
);

/**
 * Workers de la cola vivos. El latido caduca: un worker que deja de escribir aquí se considera caído y sus
 * trabajos vuelven a la cola cuando su toma vence. Sirve además para decirle al usuario si hay alguien
 * atendiendo la cola, en lugar de dejarle mirando un «en cola» eterno.
 */
export const queueWorkers = pgTable("queue_workers", {
  /** Identificador del proceso (`máquina-pid-arranque`): estable mientras el worker viva. */
  id: text("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  /** Trabajos atendidos desde que arrancó; solo informativo. */
  handled: integer("handled").notNull().default(0),
});

export type FilaApunte = typeof usageLedger.$inferSelect;
export type NuevoApunte = typeof usageLedger.$inferInsert;
export type FilaWorker = typeof queueWorkers.$inferSelect;
