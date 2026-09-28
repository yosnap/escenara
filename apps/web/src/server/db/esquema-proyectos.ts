import { boolean, index, integer, pgEnum, pgTable, real, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { media } from "./esquema";
import { users } from "./esquema-auth";
import { proveedorCredencial } from "./esquema-boveda";
import { characters, characterVersions } from "./esquema-personajes";
import { promptTemplateVersions } from "./esquema-presets";
import { jsonb } from "./jsonb";

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

/**
 * De dónde sale la voz del proyecto (RF08, 0.21.0; decisión firme del propietario, 2026-09-28). Los dos modos son
 * excluyentes y se eligen **por proyecto**: `clip` la genera el modelo de vídeo dentro del propio clip, y `pista`
 * pide los clips sin diálogo y genera el audio del diálogo aparte, siempre con la misma voz.
 */
export const modoVoz = pgEnum("project_voice_mode", ["clip", "pista"]);

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
    /**
     * Duración de los clips de este proyecto, en segundos. Es la que se le pide al modelo de vídeo, y solo puede
     * ser una de las que esta versión ofrece (`lib/produccion.ts › DURACIONES_DISPONIBLES`). Ocho por defecto:
     * KIE cobra lo mismo por 4 s que por 8 s, medido el 2026-09-27, así que la corta no ahorra nada.
     */
    clipSeconds: integer("clip_seconds").notNull().default(8),
    /**
     * Modo de voz del proyecto (RF08, 0.21.0; decisión firme del propietario, 2026-09-28). `clip` es el de
     * fábrica: la voz la genera el modelo de vídeo, como hasta la 0.20.x, y no hay pista TTS. `pista` pide los
     * clips **sin diálogo** y genera el audio del diálogo aparte, siempre con la misma voz.
     *
     * Vive en el proyecto y no en la escena a propósito: si cada escena pudiera elegir, el timbre cambiaría de
     * plano a plano (riesgo del brainstorm §3.2). El servidor rechaza cualquier intento de fijarla por escena.
     */
    voiceMode: modoVoz("voice_mode").notNull().default("clip"),
    /**
     * Voz fijada para **todas** las escenas: proveedor, modelo, nombre de voz y parámetros. Vacíos mientras el
     * proyecto esté en modo `clip`, que no tiene pista de voz que configurar.
     */
    voiceProvider: proveedorCredencial("voice_provider"),
    voiceModel: text("voice_model").notNull().default(""),
    voiceId: text("voice_id").notNull().default(""),
    voiceParams: jsonb<Record<string, number>>("voice_params").notNull().default({}),
    /** Cuándo se fijó la voz vigente. Es la fecha que explica por qué lo anterior quedó invalidado. */
    voiceSetAt: timestamp("voice_set_at", { withTimezone: true }),
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
    /**
     * Duración prevista de la escena, en segundos. Es **copia de la del proyecto** (`projects.clip_seconds`): la
     * elige el proyecto entero y se guarda aquí para que lo que se muestra de cada escena y lo que se le pide al
     * modelo sean lo mismo. Cambiar la del proyecto la reescribe en todas sus escenas.
     */
    plannedSeconds: integer("planned_seconds").notNull().default(8),
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
    /**
     * Producción de la escena (RF06, 0.19.0).
     *
     * El **fotograma aprobado** es el que el usuario ha mirado y ha dado por bueno: es el que se anima y el que
     * usará el montaje. Guardar el medio y no solo el trabajo importa porque el trabajo es un hecho histórico y
     * el medio es lo que se ve; y guardar el trabajo además del medio permite saber con qué modelo, a qué precio
     * y con qué versión de la ficha salió eso que se aprobó.
     *
     * Los identificadores de trabajo van **sin clave ajena**, igual que `generation_jobs.reservation_id` y que
     * `media.character_sheet_of`: `generation_jobs` ya referencia a `scenes`, y una referencia de vuelta cerraría
     * un ciclo entre los dos módulos del esquema. Si un trabajo desapareciera, lo que queda es una escena que
     * cita un trabajo que no está, y eso la rejilla lo trata como «no producida».
     */
    approvedFrameMediaId: uuid("approved_frame_media_id").references(() => media.id, { onDelete: "set null" }),
    approvedFrameJobId: uuid("approved_frame_job_id"),
    /** Clip resultante de animar el fotograma aprobado, y el trabajo del que salió. */
    clipMediaId: uuid("clip_media_id").references(() => media.id, { onDelete: "set null" }),
    clipJobId: uuid("clip_job_id"),
    /**
     * Reintentos **de pago** consumidos en esta escena y los que el usuario ha autorizado, en número de
     * reintentos (decisión provisional del propietario, 2026-09-27: **cero automáticos**, PRD §6). Un fallo del
     * proveedor no consume ninguno por su cuenta porque no se reenvía nada por su cuenta: solo los consume una
     * regeneración que el usuario pide **después** de un fallo con coste, y solo si hay presupuesto autorizado.
     */
    retriesUsed: integer("retries_used").notNull().default(0),
    retryBudget: integer("retry_budget").notNull().default(0),
    /** Motivo del último fallo, escrito para el usuario. Vacío si no ha fallado nada. */
    lastFailureReason: text("last_failure_reason").notNull().default(""),
    /**
     * `true` cuando la escena se ha editado **después** de generarla: lo producido ya no corresponde a lo que
     * dice. No invalida nada por sí solo (el gasto está hecho y el resultado sigue en la biblioteca), pero la
     * rejilla lo avisa y el historial lo registra como «qué cambió» antes de la siguiente regeneración.
     */
    changedSinceGeneration: boolean("changed_since_generation").notNull().default(false),
    /**
     * Pista de voz de la escena (RF08, 0.21.0). Solo existe en un proyecto en modo `pista`: en modo `clip` la voz
     * va dentro del propio clip y aquí no hay nada que guardar.
     *
     * El identificador del trabajo va **sin clave ajena**, igual que `clip_job_id`: `generation_jobs` ya
     * referencia a `scenes` y una referencia de vuelta cerraría un ciclo entre los dos módulos del esquema.
     */
    voiceMediaId: uuid("voice_media_id").references(() => media.id, { onDelete: "set null" }),
    voiceJobId: uuid("voice_job_id"),
    /**
     * Firma de la voz con la que se generó lo que hay guardado (`lib/voz.ts › firmaDeVoz`): modo, proveedor,
     * modelo, voz, parámetros y texto del diálogo.
     *
     * Es lo que permite decir «esto ya no corresponde a lo que pide el proyecto» **sin** una bandera que se
     * desincronice: se compara con la firma de ahora. Cambiar la voz, el modo, un parámetro o el diálogo la
     * cambia, y la escena queda invalidada hasta que el usuario confirme el coste de regenerarla.
     */
    voiceSignature: text("voice_signature").notNull().default(""),
    /** Por qué la voz o los subtítulos dejaron de valer, en llano. Vacío si nunca se invalidaron. */
    voiceInvalidationReason: text("voice_invalidation_reason").notNull().default(""),
    /**
     * Transcripción con marcas de tiempo tal como la devolvió el transcriptor local. Se guarda **aparte de los
     * subtítulos** a propósito: los subtítulos son lo que la persona ha corregido y es lo que se exporta, y sin
     * esta columna volver a transcribir sería la única forma de recuperar lo medido.
     */
    transcript: jsonb<{ desde: number; hasta: number; texto: string }[]>("transcript").notNull().default([]),
    /** Subtítulos **editados**: es lo único que se exporta a SRT y a WebVTT, nunca la transcripción cruda. */
    subtitles: jsonb<{ desde: number; hasta: number; texto: string }[]>("subtitles").notNull().default([]),
    /** Cuándo los tocó una persona por última vez; `null` si nadie los ha editado todavía. */
    subtitlesEditedAt: timestamp("subtitles_edited_at", { withTimezone: true }),
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
    /** Nombre visible del servicio cuando `provider` es `compatible` (0.21.1); vacío en el resto. */
    providerName: text("provider_name").notNull().default(""),
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
    /**
     * Tokens que informa el proveedor (`usage`), cuando los informa (0.21.1). Un servicio compatible con la API
     * de OpenAI se cobra por cuota o por plan, así que su llamada vale **0 créditos**: lo único que mide de
     * verdad cuánto se ha consumido de esa cuota son los tokens, y por eso se guardan.
     */
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
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
