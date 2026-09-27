import { index, integer, pgEnum, pgTable, real, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./esquema-auth";
import { proveedorCredencial } from "./esquema-boveda";
import { characters, characterVersions } from "./esquema-personajes";
import { promptTemplateVersions } from "./esquema-presets";

/**
 * Proyectos, escenas, afirmaciones por verificar y ejecuciones del asistente de guion (RF05, 0.17.0).
 *
 * El proyecto es la unidad de trabajo: una escena pertenece siempre a un proyecto, y el presupuesto
 * autorizado se fija por proyecto al aprobar su plan. La aprobación de una escena **congela** con qué se iba
 * a generar (modelo, sello del precio, versión de la ficha del personaje y versión de la plantilla): cualquier
 * cambio posterior la invalida y se dice por qué.
 *
 * Las ejecuciones del asistente van en su propia tabla porque el modelo de texto **también cuesta** y su
 * llamada no es asíncrona: no pasa por `generation_jobs` ni por la cola, pero sí por el mismo camino de
 * dinero (estimación, confirmación, idempotencia, reserva, tope y consumo informado).
 */

export const estadoProyecto = pgEnum("project_state", ["borrador", "planificado", "en_produccion", "listo"]);

export const formatoProyecto = pgEnum("project_format", ["reel_vertical", "corto", "anuncio", "explicativo"]);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    format: formatoProyecto("format").notNull().default("reel_vertical"),
    state: estadoProyecto("state").notNull().default("borrador"),
    /** La idea que escribió la persona, tal cual: es la entrada del asistente y el recordatorio del proyecto. */
    idea: text("idea").notNull().default(""),
    /** Concepto propuesto por el asistente o escrito a mano. Siempre revisable. */
    concept: text("concept").notNull().default(""),
    /**
     * Personaje principal. `set null` y no cascada: borrar el personaje se lleva sus derivados, pero el
     * proyecto y su guion son trabajo de la persona y siguen valiendo sin protagonista asignado.
     */
    mainCharacterId: uuid("main_character_id").references(() => characters.id, { onDelete: "set null" }),
    /**
     * Presupuesto autorizado de este proyecto, en créditos (RF14). 0 = sin fijar, y sin fijar **no se puede
     * aprobar el plan**: un plan sin techo no se autoriza solo.
     */
    authorizedCredits: integer("authorized_credits").notNull().default(0),
    /** Quién aprobó el plan y cuándo; `null` mientras el proyecto sea un borrador. */
    planApprovedBy: uuid("plan_approved_by").references(() => users.id, { onDelete: "set null" }),
    planApprovedAt: timestamp("plan_approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_usuario_idx").on(t.userId, t.updatedAt)],
);

export const estadoEscena = pgEnum("scene_state", ["borrador", "aprobada", "producida"]);

export const scenes = pgTable(
  "scenes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Orden dentro del proyecto, empezando en 1. Reordenar reescribe estos números. */
    sortOrder: integer("sort_order").notNull(),
    /** Lo que se cuenta o se dice en la escena. */
    scriptText: text("script_text").notNull().default(""),
    /** Lo que se ve: encuadre, gesto y luz. Es la base del prompt del fotograma. */
    action: text("action").notNull().default(""),
    plannedSeconds: integer("planned_seconds").notNull().default(4),
    /**
     * La escena **no guarda prompts**: los compone el servidor al producir, con la plantilla, los presets y la
     * ficha de la versión congelada, y el texto que de verdad se envió queda en `generation_jobs.prompt`. Una
     * segunda copia aquí solo podría desincronizarse, y nadie la leería (ADR-0022).
     */
    state: estadoEscena("state").notNull().default("borrador"),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /**
     * Lo que la aprobación congeló: con qué modelo, a qué precio (sello), con qué versión de la ficha del
     * personaje y con qué versión de la plantilla se iba a generar. Sin esto, «editar invalida la aprobación»
     * no se podría comprobar, solo prometer.
     */
    approvedFrameModel: text("approved_frame_model").notNull().default(""),
    approvedAnimationModel: text("approved_animation_model").notNull().default(""),
    approvedFrameStamp: text("approved_frame_stamp").notNull().default(""),
    approvedAnimationStamp: text("approved_animation_stamp").notNull().default(""),
    approvedCharacterVersionId: uuid("approved_character_version_id").references(() => characterVersions.id, {
      onDelete: "set null",
    }),
    approvedTemplateVersionId: uuid("approved_template_version_id").references(() => promptTemplateVersions.id, {
      onDelete: "set null",
    }),
    /** Créditos estimados de la escena en el momento de aprobar. */
    estimatedCredits: real("estimated_credits").notNull().default(0),
    /** Por qué dejó de estar aprobada, en lenguaje llano y con la acción concreta. Vacío si nunca lo estuvo. */
    invalidationReason: text("invalidation_reason").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("scenes_proyecto_orden_uq").on(t.projectId, t.sortOrder),
    index("scenes_proyecto_idx").on(t.projectId, t.sortOrder),
  ],
);

export const tipoAfirmacion = pgEnum("claim_kind", ["cifra", "dato", "salud", "resultado"]);

export const estadoAfirmacion = pgEnum("claim_state", ["por_verificar", "verificada", "corregida", "descartada"]);

/**
 * Afirmación del guion que conviene verificar antes de publicar. Aquí **solo se señala**: la verificación
 * automática queda fuera de esta versión y la decisión es siempre de una persona.
 */
export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    kind: tipoAfirmacion("kind").notNull(),
    state: estadoAfirmacion("state").notNull().default("por_verificar"),
    /** Fuente que aporta el usuario al verificarla o corregirla. La aporta él: nosotros no buscamos nada. */
    source: text("source").notNull().default(""),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("claims_escena_texto_uq").on(t.sceneId, t.text),
    index("claims_escena_idx").on(t.sceneId, t.createdAt),
  ],
);

/**
 * Para qué se llamó al modelo de texto. `traduccion` (0.17.0, decisión firme del propietario) es la que traduce
 * al inglés lo que el usuario escribe en español antes de componer el prompt: es otra llamada de pago, así que
 * se registra y se concilia igual que las del asistente.
 */
export const tipoEjecucionAsistente = pgEnum("assistant_run_kind", ["concepto", "guion", "storyboard", "traduccion"]);

export const estadoEjecucionAsistente = pgEnum("assistant_run_state", ["reservado", "listo", "fallido"]);

/**
 * Llamada al modelo de texto del asistente. **El texto también cuesta**, así que cada llamada deja su
 * ejecución aquí y sus apuntes en `usage_ledger`, igual que un trabajo de generación.
 *
 * `idempotency_key` es la clave que firma el navegador al confirmar: repetir la confirmación (doble clic,
 * reintento tras un error de red) devuelve esta misma fila y **no vuelve a llamar al proveedor**.
 */
export const assistantRuns = pgTable(
  "assistant_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Proyecto al que pertenece; `null` en las traducciones, que no son de ningún proyecto concreto. */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    kind: tipoEjecucionAsistente("kind").notNull(),
    provider: proveedorCredencial("provider").notNull(),
    model: text("model").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    state: estadoEjecucionAsistente("state").notNull().default("reservado"),
    estimatedCredits: real("estimated_credits").notNull(),
    /** Créditos que informa el proveedor (`credits_consumed`); `null` si la llamada no llegó a terminar. */
    consumedCredits: real("consumed_credits"),
    /** Sello del precio con el que se estimó, para auditar la reserva. */
    priceStamp: text("price_stamp").notNull().default(""),
    /** Cuántas escenas propuso. Solo informativo: el contenido vive en las escenas, revisado por el usuario. */
    scenesProposed: integer("scenes_proposed").notNull().default(0),
    /**
     * Créditos que el proveedor ha cobrado **por encima** del techo que se apartó para esta llamada. No se puede
     * impedir (el precio lo decide él), así que se apunta el gasto real y queda visible en `/admin/trabajos`,
     * igual que el exceso de un trabajo de generación.
     */
    excessCredits: real("excess_credits"),
    /** Mensaje apto para el usuario; nunca texto crudo del proveedor. */
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    unique("assistant_runs_usuario_idempotencia_uq").on(t.userId, t.idempotencyKey),
    index("assistant_runs_proyecto_idx").on(t.projectId, t.createdAt),
  ],
);

/**
 * Traducciones al inglés ya pagadas, por usuario y por huella del texto de origen.
 *
 * **Por usuario y no global a propósito:** lo que se traduce son la escena, la ficha del personaje y su
 * descripción, es decir, datos personales de alguien (ADR-0017). Una caché global convertiría el texto de una
 * persona en material de otra cuenta, y ahorrar una llamada de tres créditos no compensa eso. El texto de origen
 * no se guarda: solo su huella, así que la tabla no es una segunda copia de lo que escribió nadie.
 */
export const translationCache = pgTable(
  "translation_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `sha256` del texto de origen ya normalizado. No permite reconstruirlo. */
    sourceHash: text("source_hash").notNull(),
    /** Traducción al inglés, ya limpia con el saneador anti-inyección. */
    target: text("target").notNull(),
    /**
     * Personaje del que salía el texto traducido (su ficha o su descripción); `null` en la escena y el guion.
     *
     * Existe para que **la traducción de una ficha se borre con el personaje** (decisión provisional del
     * propietario, 2026-09-27): su ficha lo describe a él, así que su traducción es material suyo y no puede
     * sobrevivir a la revocación de su consentimiento. Cascada, no `set null`: aquí no hay nada que conservar.
     */
    characterId: uuid("character_id").references(() => characters.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("translation_cache_usuario_huella_uq").on(t.userId, t.sourceHash),
    // Índice de la purga por antigüedad: el barrido busca las que no se usan desde hace tiempo.
    index("translation_cache_uso_idx").on(t.usedAt),
    // Índice del borrado del personaje: hay que localizar las traducciones de su ficha.
    index("translation_cache_personaje_idx").on(t.characterId),
  ],
);

export type FilaProyecto = typeof projects.$inferSelect;
export type FilaEscena = typeof scenes.$inferSelect;
export type FilaAfirmacion = typeof claims.$inferSelect;
export type FilaEjecucionAsistente = typeof assistantRuns.$inferSelect;
export type FilaTraduccion = typeof translationCache.$inferSelect;
