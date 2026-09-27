import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { media } from "./esquema";
import { users } from "./esquema-auth";

/**
 * Personajes con sus fotos de referencia y su registro de consentimiento (RF02 y RF10).
 *
 * Reglas duras que sostiene este esquema:
 *
 * - un personaje pertenece a un usuario y nada más (`owner_id`, borrado en cascada);
 * - el consentimiento es una fila propia con fecha, quién lo registró, quién lo revisó y su revocación:
 *   **nunca** una casilla en la fila del personaje, porque hay que poder demostrar qué se declaró y cuándo;
 * - un medio de la biblioteca puede ser referencia de varios personajes (`character_references` es una
 *   relación, no una copia), así que borrar un personaje no borra las fotos del usuario;
 * - lo que sí desaparece con el personaje son sus **derivados**: los medios generados con él, que se
 *   localizan por `generation_jobs.character_id`.
 */

export const tipoPersonaje = pgEnum("character_kind", ["persona", "animal"]);

export const estadoPersonaje = pgEnum("character_state", ["borrador", "en_revision", "listo", "bloqueado"]);

export const titularConsentimiento = pgEnum("consent_holder", ["yo", "tercero", "animal_propio"]);

export const alcanceUso = pgEnum("consent_scope", ["personal", "comercial"]);

export const origenReferencia = pgEnum("reference_origin", ["foto_original", "vista_generada"]);

export const characters = pgTable(
  "characters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: tipoPersonaje("kind").notNull(),
    /** Especie o notas del animal; en personas sirve para matices que no son descripción de escena. */
    speciesNotes: text("species_notes").notNull().default(""),
    description: text("description").notNull().default(""),
    state: estadoPersonaje("state").notNull().default("borrador"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Dos personajes del mismo usuario no se llaman igual: elegir en «Crear» sería una lotería.
    unique("characters_propietario_nombre_uq").on(t.ownerId, t.name),
    index("characters_propietario_idx").on(t.ownerId, t.createdAt),
    index("characters_estado_idx").on(t.state),
  ],
);

/**
 * Registro de consentimiento de un personaje. Hay **como mucho uno vigente** por personaje (restricción
 * parcial en la migración); los revocados se conservan porque son la prueba de lo que se declaró.
 */
export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    holderType: titularConsentimiento("holder_type").notNull(),
    /** Declaración de mayoría de edad. Es obligatoria para registrar: un control, no una garantía. */
    adultDeclared: boolean("adult_declared").notNull().default(false),
    usageScope: alcanceUso("usage_scope").notNull().default("personal"),
    /**
     * Documento firmado del tercero, guardado como medio de la biblioteca. `set null` a propósito: si el
     * usuario borra el documento, el registro sigue existiendo y el personaje queda sin prueba, que es
     * información y no un hueco silencioso.
     */
    documentMediaId: uuid("document_media_id").references(() => media.id, { onDelete: "set null" }),
    registeredBy: uuid("registered_by").references(() => users.id, { onDelete: "set null" }),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** Resultado de la revisión humana: `true` aceptado, `false` rechazado, `null` sin revisar. */
    reviewApproved: boolean("review_approved"),
    /** Nota de la revisión, visible para el dueño del personaje: sin ella un rechazo no dice nada. */
    reviewNote: text("review_note").notNull().default(""),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason").notNull().default(""),
  },
  (t) => [
    index("consent_records_personaje_idx").on(t.characterId, t.registeredAt),
    /**
     * Un personaje tiene como mucho un consentimiento **sin revocar**: los revocados se conservan porque son la
     * prueba de lo que se declaró, pero dos vigentes a la vez harían ambigua la respuesta de «puede generar».
     * Se declara aquí, y no solo en el SQL de la migración, para que el esquema sea la única fuente de verdad y
     * `db:generate` no proponga borrarlo en la siguiente migración.
     */
    uniqueIndex("consent_records_personaje_vigente_uq").on(t.characterId).where(sql`${t.revokedAt} is null`),
  ],
);

export const characterReferences = pgTable(
  "character_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    origin: origenReferencia("origin").notNull().default("foto_original"),
    /** Vista declarada por el usuario; la cobertura guiada de vistas llega en 0.14.0. */
    declaredView: text("declared_view").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // La misma foto no se añade dos veces al mismo personaje.
    unique("character_references_personaje_medio_uq").on(t.characterId, t.mediaId),
    index("character_references_personaje_idx").on(t.characterId, t.sortOrder),
    // Índice de la comprobación de uso en el borrado definitivo de un medio.
    index("character_references_medio_idx").on(t.mediaId),
  ],
);

/**
 * Registro de accesos de administración a un consentimiento. Quien administra puede abrir el documento de
 * identidad de un tercero, que es la capacidad más delicada de la instalación: cada vez que lo hace queda
 * escrito quién, cuándo y sobre qué personaje. Sin este registro, «solo el admin lo ve» no se puede auditar.
 *
 * No guarda el contenido de nada: solo el hecho del acceso.
 */
export const consentAccessLog = pgTable(
  "consent_access_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Quién accedió; `null` si la cuenta se ha borrado después (el hecho del acceso no desaparece). */
    adminId: uuid("admin_id").references(() => users.id, { onDelete: "set null" }),
    /** Sobre qué personaje; `set null` por lo mismo: el registro sobrevive al borrado del personaje. */
    characterId: uuid("character_id").references(() => characters.id, { onDelete: "set null" }),
    /** `listado` (la cola de revisión), `ficha` (abrir un personaje) o `revision` (aceptar o rechazar). */
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consent_access_log_fecha_idx").on(t.createdAt), index("consent_access_log_admin_idx").on(t.adminId)],
);

export type FilaPersonaje = typeof characters.$inferSelect;
export type FilaConsentimiento = typeof consentRecords.$inferSelect;
export type FilaReferencia = typeof characterReferences.$inferSelect;
