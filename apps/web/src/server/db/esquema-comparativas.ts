import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { MedidaDeUmbral } from "@/lib/calibracion";
import type { AlternativaGuardada } from "@/lib/comparativas";
import { users } from "./esquema-auth";
import { coherenceDecisions } from "./esquema-coherencia";
import { shadowEvaluations } from "./esquema-controles";
import { projects, scenes } from "./esquema-proyectos";
import { jsonb } from "./jsonb";

/**
 * Comparativas de modelos y calibración de umbrales (RF13).
 *
 * - `comparisons`: una comparativa A/B **con contenido nuevo** de una escena. Solo existe la A/B: la comparativa sin
 *   generar es una lectura de coste cero y no se guarda (guardarla sería escribir en cada visita sin nada que elegir).
 *   Las ejecuciones reales y el coste consumido no se copian aquí: salen de los trabajos, que son los que se cobran.
 * - `labeled_examples`: el conjunto etiquetado, derivado de las revisiones humanas ya registradas. **Solo números**
 *   (cuánto encaja, confianza, etiqueta, partición): ni texto, ni nombres, ni identificadores de usuario.
 * - `calibration_runs`: cada cálculo de umbral, con su fecha, su muestra y sus métricas en la partición retenida.
 */

/**
 * Comparativa A/B de una escena: hasta dos modelos de vídeo animan el **mismo** fotograma aprobado por el camino
 * normal de la cola (reserva, consentimiento, derechos y controles). Los resultados no tocan la escena hasta que el
 * usuario elige ganador.
 *
 * `alternatives` guarda qué se confirmó de cada alternativa (modelo, créditos, sello) y **la clave de idempotencia
 * derivada** de su trabajo. Es lo que reconoce un trabajo como alternativa de una comparativa, y se escribe **antes**
 * de encolar: así el worker nunca cierra un trabajo de comparativa como si fuera el clip de la escena.
 */
export const comparisons = pgTable(
  "comparisons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    /** Clave que firmó el navegador al confirmar: repetir el envío devuelve esta misma comparativa. */
    idempotencyKey: text("idempotency_key").notNull(),
    alternatives: jsonb<AlternativaGuardada[]>("alternatives").notNull(),
    /** Ejecuciones que el usuario confirmó: una por alternativa. */
    plannedRuns: integer("planned_runs").notNull(),
    /** Créditos que el usuario confirmó en total (la suma de las alternativas, traducción incluida). */
    estimatedCredits: integer("estimated_credits").notNull(),
    /**
     * **Todo o nada.** Cuándo quedaron encoladas **todas** las alternativas; `null` mientras se lanzan. Mientras sea
     * `null`, el worker no toma ninguno de sus trabajos (`cola/toma.ts`): si una alternativa no cabe, las demás se
     * cancelan sin haber salido y sin cobro.
     */
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    /** Cuándo se dio por no lanzada (una alternativa no cabía o el lanzamiento se interrumpió); sus trabajos, cancelados. */
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** Trabajo elegido como ganador; sin clave ajena, como `scenes.clip_job_id`. */
    chosenJobId: uuid("chosen_job_id"),
    chosenAt: timestamp("chosen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("comparisons_usuario_idempotencia_uq").on(t.userId, t.idempotencyKey),
    index("comparisons_escena_idx").on(t.sceneId, t.createdAt),
    check("comparisons_ejecuciones_ck", sql`${t.plannedRuns} between 1 and 2`),
  ],
);

export type FilaComparativa = typeof comparisons.$inferSelect;

/**
 * Conjunto etiquetado para calibrar umbrales. Cada fila sale de **una** opinión registrada (de la sombra o de la
 * coherencia) y de lo que una persona decidió después. Se reconstruye entero desde Admin › Calibración.
 *
 * La referencia a la opinión de origen **no** identifica a nadie por sí sola, pero la opinión sí es de una cuenta: por
 * eso se borra en cascada con ella, y la opinión se borra con la cuenta. Es un conjunto seudónimo, no anónimo, mientras
 * exista su origen; y no sale nunca del servidor.
 */
export const labeledExamples = pgTable(
  "labeled_examples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Pregunta que se calibra (`afirmacion_verificable` o `resultado`). */
    question: text("question").notNull(),
    shadowEvaluationId: uuid("shadow_evaluation_id"),
    coherenceDecisionId: uuid("coherence_decision_id"),
    /** Cuánto encaja (0–1) y confianza (0–1) que dio el evaluador. Es la única «entrada» que se guarda. */
    fit: real("fit").notNull(),
    confidence: real("confidence").notNull(),
    /** `acepta` o `rechaza`: lo que decidió la persona. */
    label: text("label").notNull(),
    /** `false` cuando la persona vio el veredicto antes de decidir (el resultado de la coherencia). */
    labelIndependent: boolean("label_independent").notNull(),
    /** `calibracion` o `retenido`, derivada de forma determinista del origen: reconstruir no la cambia. */
    partition: text("partition").notNull(),
    /** Versión de la redacción de la pregunta y modelo que contestó: medir dos redacciones juntas no mide nada. */
    questionsVersion: text("questions_version").notNull(),
    model: text("model").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Nombres cortos a mano: el que genera Drizzle pasa de los 63 caracteres de PostgreSQL y se truncaría.
    foreignKey({
      name: "labeled_examples_sombra_fk",
      columns: [t.shadowEvaluationId],
      foreignColumns: [shadowEvaluations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "labeled_examples_coherencia_fk",
      columns: [t.coherenceDecisionId],
      foreignColumns: [coherenceDecisions.id],
    }).onDelete("cascade"),
    unique("labeled_examples_sombra_uq").on(t.shadowEvaluationId),
    unique("labeled_examples_coherencia_uq").on(t.coherenceDecisionId),
    index("labeled_examples_pregunta_idx").on(t.question, t.partition),
    check("labeled_examples_origen_ck", sql`(${t.shadowEvaluationId} is null) <> (${t.coherenceDecisionId} is null)`),
    check("labeled_examples_etiqueta_ck", sql`${t.label} in ('acepta', 'rechaza')`),
    check("labeled_examples_particion_ck", sql`${t.partition} in ('calibracion', 'retenido')`),
  ],
);

export type FilaEjemploEtiquetado = typeof labeledExamples.$inferSelect;

/**
 * Un cálculo de umbral para una pregunta. Se guarda para poder decir **con qué muestra y cuándo** se propuso algo.
 * Nunca activa nada: un umbral propuesto es un número para que lo mire una persona.
 */
export const calibrationRuns = pgTable(
  "calibration_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    question: text("question").notNull(),
    /** `null` cuando la muestra no alcanza o ningún umbral cumple: sin datos, no se propone nada. */
    proposedThreshold: real("proposed_threshold"),
    sufficient: boolean("sufficient").notNull(),
    /** Por qué se propone ese umbral o por qué no se propone ninguno, en castellano. */
    reason: text("reason").notNull(),
    calibrationSize: integer("calibration_size").notNull(),
    holdoutSize: integer("holdout_size").notNull(),
    /** Métricas del umbral propuesto en cada partición; `null` si no hay umbral. */
    calibrationMetrics: jsonb<MedidaDeUmbral | null>("calibration_metrics"),
    holdoutMetrics: jsonb<MedidaDeUmbral | null>("holdout_metrics"),
    questionsVersion: text("questions_version").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("calibration_runs_pregunta_idx").on(t.question, t.createdAt)],
);

export type FilaCalibracion = typeof calibrationRuns.$inferSelect;
