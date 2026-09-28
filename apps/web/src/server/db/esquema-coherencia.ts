import { index, integer, pgEnum, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./esquema-auth";
import { jsonb } from "./jsonb";

/**
 * Decisiones de **coherencia** (RF13, 0.24.0): percibir → decidir → registrar.
 *
 * Una fila por decisión tomada, no por escena ni por foto. Guardarlas todas es lo que permite responder «por qué
 * esta vista no cubre» meses después y, sobre todo, **medir el acierto** de cada comprobación contra lo que diga
 * una persona antes de darle poder para bloquear nada.
 *
 * Qué **no** hay aquí:
 *
 * - ninguna columna con «el personaje está verificado»: el veredicto vigente de una referencia vive en
 *   `character_references.identity_verdict`, que es lo que lee la cobertura, y esta tabla es su historia;
 * - ninguna clave ajena hacia escenas, medios ni personajes: igual que en `review_results`, si el sujeto
 *   desaparece lo que queda es una decisión que cita algo que ya no está, y eso es historial, no basura. Una
 *   clave ajena de vuelta cerraría además un ciclo entre módulos del esquema.
 */

/** Qué se comprobó. Los mismos valores que `lib/coherencia.ts`. */
export const comprobacionCoherencia = pgEnum("coherence_check", [
  "identidad",
  "guion",
  "resultado",
  "emocion",
  "direccion_fiel",
  "producto_fiel",
]);

/** Cómo se aplicó: en `sombra` el veredicto se guarda y no cambia nada; en `activa` decide. */
export const modoCoherencia = pgEnum("coherence_mode", ["sombra", "activa"]);

export const veredictoCoherencia = pgEnum("coherence_verdict", ["pasa", "revisar", "no_pasa"]);

/** Lo que dijo una persona del veredicto. Es la etiqueta de referencia con la que se mide el acierto. */
export const correccionCoherencia = pgEnum("coherence_correction", ["acierta", "se_equivoca"]);

/** Qué se miró. Sirve para buscar las decisiones de una escena o de una foto sin adivinar por el tipo. */
export const sujetoCoherencia = pgEnum("coherence_subject", ["referencia", "escena", "trabajo"]);

export const coherenceDecisions = pgTable(
  "coherence_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Dueño del contenido sobre el que se decidió. Es quien puede ver la decisión y corregirla. */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    check: comprobacionCoherencia("check").notNull(),
    mode: modoCoherencia("mode").notNull(),
    subject: sujetoCoherencia("subject").notNull(),
    /** Fila del sujeto (referencia del personaje, escena o trabajo). Sin clave ajena, a propósito. */
    subjectId: uuid("subject_id").notNull(),
    /** Personaje y proyecto a los que pertenece, cuando se sabe: es por donde se consulta en la interfaz. */
    characterId: uuid("character_id"),
    projectId: uuid("project_id"),
    verdict: veredictoCoherencia("verdict").notNull(),
    /**
     * Confianza que devolvió el decisor (0–1) y umbral que se le exigió. Los dos, porque el veredicto solo se
     * entiende con los dos: la misma confianza pasa hoy y manda a revisar mañana si alguien sube el umbral.
     */
    confidence: real("confidence").notNull(),
    threshold: real("threshold").notNull(),
    /** Cuánto encaja, ya normalizado a 0–1 desde la primitiva que se usara (`noul`, `choice` o `score`). */
    fit: real("fit").notNull(),
    /** Distribución completa tal como llegó. Es la evidencia numérica de la decisión. */
    probabilities: jsonb<Record<string, number>>("probabilities").notNull(),
    /** Hechos percibidos sobre los que se decidió, en texto. Lo que el modelo de visión u oído describió. */
    facts: text("facts").notNull().default(""),
    /** Por qué, escrito para el usuario. Nunca vacío: un veredicto sin evidencia no se puede discutir. */
    evidence: text("evidence").notNull(),
    /** Modelo que decidió (`jev-1.13.0`) y modelo que percibió (`gemma4`, `mimo-v2.5`), con su proveedor. */
    decisionModel: text("decision_model").notNull(),
    perceptionProvider: text("perception_provider").notNull().default(""),
    perceptionModel: text("perception_model").notNull().default(""),
    /** Versión del conjunto de preguntas: comparar medidas de dos redacciones sería comparar cosas distintas. */
    rulesVersion: text("rules_version").notNull(),
    /**
     * Tokens que informó el decisor y lo que cuestan en euros con la tarifa de Admin › Coherencia.
     *
     * **No van al registro de gasto del usuario** y es deliberado: ese registro es el dinero *del usuario* en sus
     * propias cuentas (BYOK), y la clave de TypeSafe es de la instalación. Meter ahí el gasto del operador
     * inflaría el consumo de alguien que no lo ha hecho. La percepción sí va al registro, porque se paga con la
     * cuota del propio usuario, y se apunta con 0 créditos como cualquier servicio de cuota.
     */
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    decisionEur: real("decision_eur").notNull().default(0),
    /** Lo que tardó la decisión de punta a punta, en milisegundos. Es lo que dice si estorba o no. */
    latencyMs: integer("latency_ms").notNull().default(0),
    correction: correccionCoherencia("correction"),
    correctedAt: timestamp("corrected_at", { withTimezone: true }),
    correctedBy: uuid("corrected_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Decisiones de un sujeto concreto, de la más reciente a la más vieja: es la consulta de la ficha y la escena.
    index("coherence_decisions_sujeto_idx").on(t.subjectId, t.createdAt),
    // Medición del acierto: se agrupa por comprobación y se filtra por fecha.
    index("coherence_decisions_comprobacion_idx").on(t.check, t.createdAt),
    index("coherence_decisions_usuario_idx").on(t.userId, t.createdAt),
  ],
);

export type FilaDecisionCoherencia = typeof coherenceDecisions.$inferSelect;
