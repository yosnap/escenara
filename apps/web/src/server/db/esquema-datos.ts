import { sql } from "drizzle-orm";
import {
  bigint,
  date,
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
import { tipoApunte } from "./esquema-presupuesto";
import { projects } from "./esquema-proyectos";
import { jsonb } from "./jsonb";

/**
 * Tus datos: exportación de un proyecto, borrado de la cuenta y lo único que sobrevive a ese borrado.
 *
 * - `project_exports`: el paquete ZIP de un proyecto que prepara el worker. El ZIP **no es un medio de la
 *   biblioteca**: vive en el almacenamiento con su clave aquí y caduca solo, así que no cuenta en la cuota ni se
 *   puede reutilizar como referencia.
 * - `account_deletions`: la petición de borrar la cuenta, con su periodo de gracia y el registro de lo borrado.
 *   Sobrevive a la cuenta (`user_id` a nulo) sin nada que la identifique: fechas, estado, motivo y recuentos.
 * - `storage_deletions`: objetos del almacenamiento pendientes de borrar (de un proyecto o de una cuenta borrados),
 *   escritos en la misma transacción que borra sus filas y reintentados por el worker con retroceso. La fila se borra
 *   al borrar el objeto; las que agotan los intentos quedan como «fallido» para quien administra.
 * - `usage_aggregates`: el gasto de las cuentas borradas, **sumado** por mes, proveedor, modelo y tipo de apunte.
 *   Sin usuario, sin trabajo y sin nota: es la trazabilidad del gasto de la instalación, no de una persona.
 * - `consent_evidence`: prueba mínima de cada consentimiento o declaración de derechos de una cuenta borrada
 *   (qué tipo, qué alcance, qué versión del texto y cuándo). Sin nombres, sin fotos, sin IP y sin cuenta.
 */

export const estadoExportacionProyecto = pgEnum("project_export_state", [
  "en_cola",
  "preparando",
  "lista",
  "fallida",
  "caducada",
]);

export const projectExports = pgTable(
  "project_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Cascada: el paquete de un proyecto borrado no tiene sentido. El borrado del proyecto recoge **antes** la clave
     * del ZIP para borrar el objeto; la cascada solo se lleva la fila.
     */
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    state: estadoExportacionProyecto("state").notNull().default("en_cola"),
    /** Clave del ZIP en el almacenamiento; `null` hasta que está subido y otra vez `null` cuando caduca. */
    storageKey: text("storage_key"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    /** Archivos de medios dentro del paquete (sin contar `proyecto.json` ni `LEEME.md`). */
    mediaCount: integer("media_count").notNull().default(0),
    /** Causa concreta, apta para mostrar, cuando falla. Nunca el texto libre del proveedor ni una traza. */
    errorMessage: text("error_message").notNull().default(""),
    attempts: integer("attempts").notNull().default(0),
    lockedBy: text("locked_by"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** Desde aquí la descarga deja de funcionar y el worker borra el objeto. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    index("project_exports_usuario_idx").on(t.userId, t.createdAt),
    index("project_exports_proyecto_idx").on(t.projectId, t.createdAt),
    index("project_exports_cola_idx").on(t.state, t.lockedUntil),
    // Una sola exportación viva por proyecto: pedir otra mientras se prepara devuelve la que ya está en marcha.
    uniqueIndex("project_exports_proyecto_viva_uq").on(t.projectId).where(sql`${t.state} in ('en_cola', 'preparando')`),
  ],
);

export const estadoBorradoCuenta = pgEnum("account_deletion_state", [
  "programado",
  "cancelado",
  "borrando_objetos",
  "completado",
]);

export const accountDeletions = pgTable(
  "account_deletions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `set null`: el registro del borrado sobrevive a la cuenta sin decir de quién era. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    state: estadoBorradoCuenta("state").notNull().default("programado"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    /** Fin del periodo de gracia: antes de esta fecha se puede cancelar y el worker no toca nada. */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    /** Próximo intento del worker: se aplaza si hay trabajos en el proveedor o si un intento falló. */
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    rowsDeletedAt: timestamp("rows_deleted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lockedBy: text("locked_by"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    /** Último motivo de aplazamiento o de fallo, para quien administra. Sin datos de la cuenta. */
    lastError: text("last_error").notNull().default(""),
    /** Objetos que el almacenamiento no dejó borrar tras todos los intentos (sus claves están en `storage_deletions`). */
    orphanObjects: integer("orphan_objects").notNull().default(0),
    deletedObjects: integer("deleted_objects").notNull().default(0),
    /** Recuento por tipo de lo borrado (proyectos, personajes, medios…), sin nombres. */
    summary: jsonb<Record<string, number>>("summary").notNull().default({}),
  },
  (t) => [
    index("account_deletions_cola_idx").on(t.state, t.availableAt),
    // Como mucho un borrado abierto por cuenta.
    uniqueIndex("account_deletions_usuario_abierto_uq")
      .on(t.userId)
      .where(sql`${t.state} in ('programado', 'borrando_objetos')`),
  ],
);

export const estadoBorradoObjeto = pgEnum("storage_deletion_state", ["pendiente", "fallido"]);

export const storageDeletions = pgTable(
  "storage_deletions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageKey: text("storage_key").notNull().unique(),
    /** De dónde viene: `proyecto` o `cuenta`. */
    origin: text("origin").notNull(),
    /** Borrado de cuenta al que pertenece, para saber cuándo ha terminado; nulo en los de un proyecto. */
    accountDeletionId: uuid("account_deletion_id").references(() => accountDeletions.id, { onDelete: "set null" }),
    state: estadoBorradoObjeto("state").notNull().default("pendiente"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("storage_deletions_cola_idx").on(t.state, t.nextAttemptAt),
    index("storage_deletions_cuenta_idx").on(t.accountDeletionId),
  ],
);

export const usageAggregates = pgTable(
  "usage_aggregates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Primer día del mes del apunte original. */
    month: date("month").notNull(),
    provider: proveedorCredencial("provider").notNull(),
    providerName: text("provider_name").notNull().default(""),
    model: text("model").notNull(),
    entryType: tipoApunte("entry_type").notNull(),
    credits: real("credits").notNull().default(0),
    amountEur: real("amount_eur").notNull().default(0),
    entries: integer("entries").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("usage_aggregates_clave_uq").on(t.month, t.provider, t.providerName, t.model, t.entryType)],
);

export const tipoPruebaConsentimiento = pgEnum("consent_evidence_kind", ["personaje", "lugar", "musica", "afirmacion"]);

export const consentEvidence = pgTable(
  "consent_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: tipoPruebaConsentimiento("kind").notNull(),
    /** Alcance declarado (`personal`, `comercial`…) o tipo de derechos; nunca texto libre del usuario. */
    scope: text("scope").notNull().default(""),
    /**
     * Versión del texto que se aceptó. Donde el texto guardado era el literal completo (canto, afirmaciones), su
     * huella `sha256:` en lugar del texto: basta para demostrar cuál fue sin conservar nada escrito por nadie.
     */
    textVersion: text("text_version").notNull().default(""),
    /** Casillas declaradas (mayoría de edad, sin menores, permiso del sitio…), solo verdadero o falso. */
    declared: jsonb<Record<string, boolean>>("declared").notNull().default({}),
    declaredAt: timestamp("declared_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consent_evidence_tipo_idx").on(t.kind, t.declaredAt)],
);

export type FilaExportacionProyecto = typeof projectExports.$inferSelect;
export type FilaBorradoCuenta = typeof accountDeletions.$inferSelect;
