import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./esquema-auth";
import { jsonb } from "./jsonb";

/**
 * Evaluaciones del motor de controles previos (RF12, 0.18.0).
 *
 * Se guarda **la evaluación que cerró o abrió una puerta de verdad**, no cada vez que alguien mira el panel:
 * una fila por intento de encolar, con el estado que salió, las reglas que saltaron y la versión del conjunto
 * de reglas. Guardar también las lecturas llenaría la tabla de ruido sin aportar nada que auditar.
 *
 * La versión de reglas es lo que hace auditable una decisión meses después: sin ella, «esto se bloqueó» no se
 * puede reproducir, porque las reglas habrán cambiado. 0.24.0 guardará la misma versión en cada decisión
 * tipada (RF13), y la precedencia es la de esta versión: **las reglas mandan sobre el modelo de decisión**.
 */

/** `montaje` se añade en la 0.32.0: exportar pasa por el mismo motor de reglas, así que se registra igual. */
export const sujetoControl = pgEnum("control_subject", ["escena", "trabajo", "montaje"]);

export const estadoControl = pgEnum("control_state", ["listo", "ajustes", "revision", "bloqueado"]);

/** Una regla que saltó, tal como se guarda. Es exactamente lo que se le mostró al usuario. */
export interface ReglaDisparada {
  regla: string;
  estado: "listo" | "ajustes" | "revision" | "bloqueado";
  motivo: string;
  accion: string;
}

export const controlEvaluations = pgTable(
  "control_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: sujetoControl("subject").notNull(),
    /**
     * Identificador del sujeto: la escena cuando se produce una escena del plan, y `null` en el camino rápido
     * de «Crear», porque el trabajo todavía no existe cuando se evalúa (evaluar **antes** de crear nada es
     * precisamente el punto de esta versión).
     *
     * Sin clave ajena a propósito: la evaluación es un registro de lo que se decidió y tiene que sobrevivir al
     * borrado de la escena. Si la escena desaparece, lo que queda es una evaluación huérfana y auditable, no
     * un hueco.
     */
    subjectId: uuid("subject_id"),
    /** Qué se iba a hacer (`fotograma`, `animacion`, `voz` o, desde la 0.32.0, `montaje`). */
    jobKind: text("job_kind").notNull(),
    state: estadoControl("state").notNull(),
    /** Versión del conjunto de reglas con el que se evaluó. */
    rulesVersion: text("rules_version").notNull(),
    /** Reglas que saltaron, con su motivo y su acción. Lista vacía = todo en orden. */
    rules: jsonb<ReglaDisparada[]>("rules").notNull(),
    /** Claves de los avisos que el usuario confirmó expresamente en esa petición. */
    confirmed: jsonb<string[]>("confirmed").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("control_evaluations_usuario_idx").on(t.userId, t.createdAt),
    index("control_evaluations_sujeto_idx").on(t.subjectId, t.createdAt),
  ],
);

export type FilaEvaluacionControl = typeof controlEvaluations.$inferSelect;
