import { boolean, index, integer, pgEnum, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./esquema-auth";
import { veredictoCoherencia } from "./esquema-coherencia";
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

/**
 * `montaje` se añade en la 0.32.0: exportar pasa por el mismo motor de reglas, así que se registra igual.
 * `proyecto` se añade en la 0.39.0: el tope del proyecto que frena una llamada al asistente de guion también es una
 * decisión del motor, y su sujeto es el proyecto entero.
 */
export const sujetoControl = pgEnum("control_subject", ["escena", "trabajo", "montaje", "proyecto"]);

export const estadoControl = pgEnum("control_state", ["listo", "ajustes", "revision", "bloqueado"]);

/**
 * Una regla que saltó, tal como se guarda: lo que se le mostró al usuario **sin los nombres** de personas y productos
 * (desde la 0.39.0), que se sustituyen por un marcador. El registro sobrevive al borrado de la ficha.
 */
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
    /**
     * **Qué se miró** (0.39.0): los hechos con los que decidió el motor, sin nombres de personas. Vacío (`{}`) en
     * las evaluaciones anteriores a esta versión, que no lo guardaban.
     */
    evidence: jsonb<Record<string, unknown>>("evidence").notNull().default({}),
    /** Umbrales aplicados: los parámetros del motor tal como estaban en Admin › Ajustes al decidir. */
    thresholds: jsonb<Record<string, unknown>>("thresholds").notNull().default({}),
    /**
     * Por qué puerta pasó: `envio` es la completa, la que exige todos los hechos y admite confirmaciones;
     * `frenos` es la que solo aplica los frenos que no se salvan (tope del proyecto, canto, montaje).
     */
    gate: text("gate").notNull().default("envio"),
    /**
     * Qué pasó de verdad: `permite`, `pide-confirmacion` o `rechaza`. Vacío en las filas anteriores a la 0.39.0.
     * El estado dice cómo estaba; la acción dice qué se hizo con la petición, que no es lo mismo cuando hay avisos
     * confirmados.
     */
    action: text("action").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("control_evaluations_usuario_idx").on(t.userId, t.createdAt),
    index("control_evaluations_sujeto_idx").on(t.subjectId, t.createdAt),
    // El panel de decisiones lee las recientes de toda la instalación.
    index("control_evaluations_fecha_idx").on(t.createdAt),
  ],
);

export type FilaEvaluacionControl = typeof controlEvaluations.$inferSelect;

/**
 * Evaluaciones **en sombra** de una decisión del motor (RF13, 0.39.0): lo que opinó un evaluador tipado (hoy, Jev)
 * sobre la misma petición, **sin cambiar nada**.
 *
 * Una fila por evaluación hecha o fallida. La decisión efectiva es siempre la de las reglas: esta tabla existe para
 * poder comparar, con las revisiones humanas como etiqueta de referencia, cuántas veces la sombra habría dejado
 * pasar algo que una persona rechazó y cuántas habría frenado algo que una persona aceptó.
 *
 * **Nunca se enseña al usuario** mientras la sombra sea sombra: verla sesgaría la etiqueta humana con la que se mide.
 */
export const shadowEvaluations = pgTable(
  "shadow_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Decisión del motor que se evaluó en paralelo. Si se borra la evaluación, su sombra no significa nada. */
    controlEvaluationId: uuid("control_evaluation_id")
      .notNull()
      .references(() => controlEvaluations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Escena evaluada. Sin clave ajena, como en `control_evaluations`: el registro sobrevive al borrado. */
    subjectId: uuid("subject_id"),
    /** Quién evaluó (`jev`) y qué pregunta, con la versión de su redacción. */
    evaluator: text("evaluator").notNull(),
    question: text("question").notNull(),
    questionsVersion: text("questions_version").notNull(),
    /** Modelo exacto que contestó; vacío si falló antes de contestar. */
    model: text("model").notNull().default(""),
    /** `null` cuando la evaluación falló: un fallo no se convierte nunca en opinión. */
    verdict: veredictoCoherencia("verdict"),
    fit: real("fit"),
    /** Forma de la distribución de la respuesta, **no** una tasa de acierto. */
    confidence: real("confidence"),
    /** Umbral por pregunta con el que se enrutó la opinión. No automatiza nada: solo ordena la medición. */
    threshold: real("threshold").notNull(),
    probabilities: jsonb<Record<string, number>>("probabilities").notNull().default({}),
    /** Por qué, escrito para quien administra. Vacío si falló. */
    evidence: text("evidence").notNull().default(""),
    /** Código propio del fallo (`tiempo-agotado`, `rechazada`…); vacío si contestó. */
    error: text("error").notNull().default(""),
    /** Si su opinión coincide con lo que hicieron las reglas; `null` si no hay opinión o fue «míralo tú». */
    matchesEffective: boolean("matches_effective"),
    /** Huella del texto evaluado: el mismo texto no se vuelve a pagar, se reutiliza la opinión. */
    inputHash: text("input_hash").notNull().default(""),
    /** Evaluación de la que se copió la opinión por tener la misma huella; `null` si se pagó esta. */
    reusedFrom: uuid("reused_from"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costEur: real("cost_eur").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("shadow_evaluations_decision_idx").on(t.controlEvaluationId),
    index("shadow_evaluations_pregunta_idx").on(t.question, t.createdAt),
    index("shadow_evaluations_huella_idx").on(t.userId, t.question, t.inputHash),
    index("shadow_evaluations_usuario_idx").on(t.userId, t.createdAt),
  ],
);

export type FilaEvaluacionSombra = typeof shadowEvaluations.$inferSelect;
