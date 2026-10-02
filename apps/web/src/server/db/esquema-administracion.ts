import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./esquema-auth";

export const userPolicies = pgTable(
  "user_policies",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    budgetMode: text("budget_mode").notNull().default("heredar"),
    budgetValue: real("budget_value"),
    jobMode: text("job_mode").notNull().default("heredar"),
    jobValue: real("job_value"),
  },
  (t) => [
    check(
      "user_policies_budget_valid",
      sql`(${t.budgetMode} in ('heredar', 'sin-tope') and ${t.budgetValue} is null) or (${t.budgetMode} = 'limite' and ${t.budgetValue} is not null and ${t.budgetValue} > 0 and ${t.budgetValue} < 'Infinity'::real)`,
    ),
    check(
      "user_policies_job_valid",
      sql`(${t.jobMode} in ('heredar', 'sin-tope') and ${t.jobValue} is null) or (${t.jobMode} = 'limite' and ${t.jobValue} is not null and ${t.jobValue} > 0 and ${t.jobValue} < 'Infinity'::real)`,
    ),
  ],
);

/** Papelera administrativa: conserva la cuenta hasta autorizar su eliminación por el worker. */
export const adminUserTrash = pgTable("admin_user_trash", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
  eligibleAt: timestamp("eligible_at", { withTimezone: true }).notNull(),
  permanentRequestedAt: timestamp("permanent_requested_at", { withTimezone: true }),
  previousBanned: boolean("previous_banned").notNull(),
  previousBanReason: text("previous_ban_reason"),
  previousBanExpires: timestamp("previous_ban_expires", { withTimezone: true }),
});

/** No email, IP, token, prompt ni valores secretos. Motivo se minimiza al borrar la cuenta. */
export const adminEvents = pgTable(
  "admin_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    targetId: uuid("target_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    reason: text("reason").notNull(),
    result: text("result").notNull().default("completado"),
    changes: jsonb("changes").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    operationId: uuid("operation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("admin_events_operation_uq").on(t.operationId),
    index("admin_events_target_date_idx").on(t.targetId, t.createdAt),
    index("admin_events_actor_date_idx").on(t.actorId, t.createdAt),
  ],
);

export const adminMailEvents = pgTable(
  "admin_mail_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    operationId: uuid("operation_id").notNull(),
    state: text("state").notNull().default("solicitado"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    check("admin_mail_state_valid", sql`${t.state} in ('solicitado', 'aceptado', 'fallido', 'incierto')`),
    uniqueIndex("admin_mail_operation_uq").on(t.operationId),
    index("admin_mail_user_date_idx").on(t.userId, t.createdAt),
    index("admin_mail_actor_date_idx").on(t.actorId, t.createdAt),
  ],
);
