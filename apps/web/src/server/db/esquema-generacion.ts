import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { media } from "./esquema";
import { users } from "./esquema-auth";
import { proveedorCredencial } from "./esquema-boveda";

/**
 * Trabajos de generación (embrión de `GenerationJob`, que 0.12.0 generaliza con cola y presupuesto) y
 * registro versionado de precios por modelo (que amplía 0.11.0).
 *
 * El proveedor comparte enumeración con las credenciales: un trabajo se paga siempre con la clave del
 * usuario para ese mismo proveedor.
 */

export const tipoTrabajo = pgEnum("generation_job_kind", ["fotograma", "animacion"]);

/** Estado propio, nunca el del proveedor tal cual: un estado que no se reconoce es `desconocido`. */
export const estadoTrabajo = pgEnum("generation_job_state", [
  "preparando",
  "enviado",
  "en_curso",
  "listo",
  "fallido",
  "desconocido",
]);

export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: tipoTrabajo("kind").notNull(),
    provider: proveedorCredencial("provider").notNull(),
    model: text("model").notNull(),
    /** Identificador de la tarea en el proveedor; `null` mientras el trabajo se está preparando. */
    taskId: text("task_id"),
    /**
     * Clave que genera el navegador al confirmar el gasto. Si la misma confirmación llega dos veces (un
     * doble clic o un reintento tras un error de red), se devuelve el trabajo que ya existe en lugar de
     * crear otra tarea en el proveedor: es lo que evita pagar dos veces lo mismo.
     */
    idempotencyKey: text("idempotency_key"),
    state: estadoTrabajo("state").notNull().default("preparando"),
    /** Estado crudo del proveedor (`waiting`, `queuing`, `generating`, `success`, `fail`). */
    providerState: text("provider_state"),
    prompt: text("prompt").notNull(),
    /** Entrada enviada al proveedor (modelo y parámetros). Nunca contiene la credencial. */
    input: jsonb("input").notNull(),
    sourceMediaId: uuid("source_media_id").references(() => media.id, { onDelete: "set null" }),
    resultMediaId: uuid("result_media_id").references(() => media.id, { onDelete: "set null" }),
    estimatedCredits: integer("estimated_credits").notNull(),
    /** Créditos que informa el proveedor; si no llegan, se conserva la estimación marcada como tal. */
    consumedCredits: integer("consumed_credits"),
    /** Mensaje apto para el usuario (nunca texto crudo del proveedor). */
    errorMessage: text("error_message"),
    /** Casilla obligatoria de derecho de uso de la imagen, tal como se confirmó al generar. */
    rightsConfirmedAt: timestamp("rights_confirmed_at", { withTimezone: true }),
    /** Animación → fotograma del que salió. */
    parentJobId: uuid("parent_job_id").references((): AnyPgColumn => generationJobs.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    polledAt: timestamp("polled_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    // Una tarea del proveedor es un solo trabajo: es lo que hace idempotente la reconciliación.
    unique("generation_jobs_proveedor_tarea_uq").on(t.provider, t.taskId),
    // Una confirmación es un solo trabajo: es lo que hace idempotente el envío.
    unique("generation_jobs_usuario_idempotencia_uq").on(t.userId, t.idempotencyKey),
    index("generation_jobs_usuario_idx").on(t.userId, t.createdAt),
    index("generation_jobs_estado_idx").on(t.state),
  ],
);

/**
 * Precio de un modelo en la unidad que factura el proveedor, con su fuente y la fecha en que se
 * comprobó: los precios cambian y una estimación sin fecha no vale nada.
 *
 * `version` sube en cada edición del precio: el sello que viaja con una estimación la incluye, así que
 * cambiar el precio caduca las estimaciones anteriores sin tocar los créditos ya consumidos.
 */
export const modelPrices = pgTable(
  "model_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: proveedorCredencial("provider").notNull(),
    model: text("model").notNull(),
    /** Qué se paga: «imagen», «vídeo de 4 s»… */
    unit: text("unit").notNull(),
    credits: real("credits").notNull(),
    source: text("source").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("model_prices_proveedor_modelo_unidad_uq").on(t.provider, t.model, t.unit)],
);

export type FilaTrabajo = typeof generationJobs.$inferSelect;
export type FilaPrecio = typeof modelPrices.$inferSelect;
