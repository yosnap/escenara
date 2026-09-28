import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./esquema-auth";
import { products } from "./esquema-productos";
import { projects } from "./esquema-proyectos";

/**
 * **Estrategia del anuncio** (0.27.0): la oferta, el brief y la declaración de veracidad, que van **antes** del
 * guion.
 *
 * Reglas duras que sostiene este esquema:
 *
 * - **un solo ángulo por vídeo**: `ad_briefs.angle_preset_key` es una columna de texto, no una lista ni una tabla
 *   de unión. Dos ángulos a la vez no se pueden guardar, así que la regla no depende de que la interfaz la
 *   respete;
 * - **un proyecto es un anuncio**: como mucho un brief por proyecto (`project_id` único). Las variantes por
 *   ángulo son proyectos hermanos con el mismo `projects.variant_group_id`;
 * - **la oferta va atada al producto** y es de su dueño: `offers` lleva `user_id` **y** `product_id`, y todas las
 *   lecturas filtran por el dueño en el mismo `where` que el identificador, así que una ajena responde 404 y ni
 *   se dice que existe. Duplicarla a otro producto crea una fila nueva: la original no se toca;
 * - la oferta se borra **en lógico** (`deleted_at`): un brief puede estar citándola y el guion ya generado se
 *   escribió con ella. Borrarla de verdad dejaría un anuncio hablando de una oferta que no existe;
 * - la **declaración de veracidad** sigue el patrón de `consent_records`: se guarda el texto aceptado entero, con
 *   su fecha y su IP. Lo que hay que poder demostrar es qué se le puso delante, no que pulsó una casilla. Y va
 *   por proyecto **y ángulo**: cambiar de ángulo es afirmar otra cosa, así que la declaración anterior no vale.
 *
 * El ángulo se guarda por **clave del preset** (`angle_preset_key`) y no por identificador de fila: el catálogo lo
 * edita quien administra y está versionado, así que una edición o un borrado del preset no puede dejar un brief
 * apuntando a nada. La clave es estable y es lo que se compara al filtrar campañas por ángulo.
 */

export const offers = pgTable(
  "offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Producto al que está atada. Cascada: sin producto no hay oferta que valga, y el producto ya conserva lo
     * generado con él (0.26.0).
     */
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Qué se da. El **único campo obligatorio**: sin esto no hay oferta. */
    whatTheyGet: text("what_they_get").notNull(),
    /**
     * Los cuatro opcionales. `null` = **no se dice nada de esto en el guion**, que no es lo mismo que una cadena
     * vacía: se guardan como nulos a propósito para que «no hay garantía declarada» y «hay una garantía que es el
     * texto vacío» no puedan confundirse.
     */
    price: text("price"),
    guarantee: text("guarantee"),
    urgency: text("urgency"),
    bonus: text("bonus"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Borrado lógico: un brief puede citarla y un guion ya escrito salió de ella. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("offers_dueno_idx").on(t.userId, t.deletedAt, t.updatedAt),
    index("offers_producto_idx").on(t.productId, t.deletedAt),
  ],
);

export const adBriefs = pgTable(
  "ad_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Un proyecto es un anuncio: como mucho un brief. */
    projectId: uuid("project_id")
      .notNull()
      .unique("ad_briefs_proyecto_uq")
      .references(() => projects.id, { onDelete: "cascade" }),
    /**
     * Producto del que es el anuncio (0.26.0). Nullable porque el brief se rellena a trozos; sin producto **no se
     * puede pedir guion**, y eso lo dice la puerta con su motivo, no una restricción de la base.
     *
     * `set null` y no cascada: borrar el producto no puede llevarse por delante el público y el ángulo que
     * escribió una persona.
     */
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    /** A quién le habla el anuncio. */
    audience: text("audience").notNull().default(""),
    /** La versión mejor de sí mismo que compra quien lo ve. Es el corazón del brief. */
    betterSelf: text("better_self").notNull().default(""),
    /** Clave del preset del ángulo (categoría `angulo-anuncio`). **Uno solo**; vacía = sin elegir. */
    anglePresetKey: text("angle_preset_key").notNull().default(""),
    /** `set null`: si la oferta se borra, el brief se queda sin ella y lo dice, en vez de desaparecer. */
    offerId: uuid("offer_id").references(() => offers.id, { onDelete: "set null" }),
    notes: text("notes").notNull().default(""),
    /**
     * La última propuesta de hooks **ya pagada**. Se guarda antes de responder porque, si la respuesta no llega al
     * navegador, repetir la petición no vuelve a llamar (ni a cobrar) y sin esto los hooks se perderían. Se
     * sustituye por la siguiente propuesta; elegir un hook no la borra.
     */
    proposedHooks: jsonb("proposed_hooks").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ad_briefs_producto_idx").on(t.productId), index("ad_briefs_oferta_idx").on(t.offerId)],
);

/**
 * Declaración del usuario de que lo que afirma el anuncio es cierto, para los ángulos que afirman algo
 * comprobable (mecanismo, beneficio, miedo/pérdida y comparación de fábrica; lo decide cada preset).
 *
 * Mismo patrón que `consent_records`: el texto aceptado se guarda **entero** en la fila y no se deduce del
 * código, para que una versión futura que cambie la redacción no reescriba lo que alguien aceptó.
 */
export const sensitiveClaimDeclarations = pgTable(
  "sensitive_claim_declarations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Ángulo por el que se declaró. Cambiar de ángulo es afirmar otra cosa: la anterior no vale. */
    anglePresetKey: text("angle_preset_key").notNull(),
    acceptedText: text("accepted_text").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    /** IP desde la que se aceptó, tal como la ve esta instalación. Vacía si no se pudo determinar. */
    ip: text("ip").notNull().default(""),
    /** Quién la aceptó. `set null`: la cuenta puede desaparecer y la declaración sigue siendo la prueba. */
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    /**
     * Una declaración por proyecto y ángulo. Repetir la aceptación (un doble clic, un reintento) no crea una
     * segunda fila y tampoco es un error: la que hay ya es la prueba.
     */
    uniqueIndex("sensitive_claim_declarations_proyecto_angulo_uq").on(t.projectId, t.anglePresetKey),
    index("sensitive_claim_declarations_proyecto_idx").on(t.projectId, t.acceptedAt),
  ],
);

export type FilaOferta = typeof offers.$inferSelect;
export type FilaBrief = typeof adBriefs.$inferSelect;
export type FilaDeclaracionAfirmacion = typeof sensitiveClaimDeclarations.$inferSelect;
