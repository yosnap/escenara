import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { media } from "./esquema";
import { users } from "./esquema-auth";
import { characters } from "./esquema-personajes";
import { promptTemplates } from "./esquema-presets";

/**
 * Comunidad: publicaciones, retos y logros (RF10).
 *
 * Reglas duras que sostiene este esquema (ADR-0043):
 *
 * - **Solo contenido sintético.** Qué se puede publicar lo decide una única función de elegibilidad por lista blanca de
 *   origen (`server/comunidad/elegibilidad.ts`); la base de datos solo guarda lo que ya pasó por ella.
 * - **Una publicación es una copia.** Los medios se copian a claves propias del almacenamiento (`community_post_media`):
 *   retirar la publicación borra la copia y nunca toca el original, y borrar el original la deja huérfana (su enlace pasa
 *   a nulo), invisible al instante y barrida por el worker.
 * - **Nada se ve sin aprobación.** `state` empieza en `pendiente` y cualquier edición del autor la devuelve ahí con otra
 *   `revision`; quien modera aprueba o rechaza **una revisión concreta**, nunca la suya.
 */

export const tipoPublicacion = pgEnum("community_post_kind", ["personaje", "clip", "trend", "plantilla"]);
export const estadoPublicacion = pgEnum("community_post_state", ["pendiente", "aprobada", "rechazada"]);

/** Reto de la comunidad: lo crea quien administra. Las participaciones son publicaciones con su reto, moderadas igual. */
export const communityChallenges = pgTable(
  "community_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** Plantilla o trend de la instalación que se sugiere. `set null`: si se borra, el reto sigue sin sugerencia. */
    templateId: uuid("template_id").references(() => promptTemplates.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("community_challenges_periodo", sql`${t.endsAt} > ${t.startsAt}`),
    index("community_challenges_periodo_idx").on(t.startsAt, t.endsAt),
  ],
);

export const communityPosts = pgTable(
  "community_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Cascada: borrar la cuenta se lleva sus publicaciones (las claves de sus copias se apuntan antes para borrarlas). */
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: tipoPublicacion("kind").notNull(),
    state: estadoPublicacion("state").notNull().default("pendiente"),
    /** Sube con cada edición del autor: quien modera decide sobre la revisión que vio, no sobre otra. */
    revision: integer("revision").notNull().default(1),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** Firma con la que se publica (la elige el autor al publicar); nunca el correo ni el nombre de la cuenta sin más. */
    signature: text("signature").notNull(),
    /** Personaje del que es copia (solo `personaje`). `set null`: borrar el original deja la publicación huérfana. */
    sourceCharacterId: uuid("source_character_id").references(() => characters.id, { onDelete: "set null" }),
    /** Medio del que es copia (`clip`, `trend`, `plantilla`). `set null`, por lo mismo. */
    sourceMediaId: uuid("source_media_id").references(() => media.id, { onDelete: "set null" }),
    /**
     * Personaje **inventado** del que sale lo publicado (el propio personaje, o el del trabajo que produjo el archivo),
     * fijado al publicar. La publicación solo se ve mientras su declaración de inventado siga vigente y sea anterior a la
     * aprobación: revocarla la oculta, y volver a declararlo exige aprobarla otra vez. `set null`: borrado = huérfana.
     */
    originCharacterId: uuid("origin_character_id").references(() => characters.id, { onDelete: "set null" }),
    /** Plantilla o trend de la instalación con el que se hizo (`trend`, `plantilla`): lo que «Usar» abre en «Crear». */
    templateId: uuid("template_id").references(() => promptTemplates.id, { onDelete: "set null" }),
    challengeId: uuid("challenge_id").references(() => communityChallenges.id, { onDelete: "set null" }),
    /** Declaración expresa del autor, con su texto exacto y su fecha: «confirmo que es sintético y quiero publicarlo». */
    consentText: text("consent_text").notNull(),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    moderatedBy: uuid("moderated_by").references(() => users.id, { onDelete: "set null" }),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    /** Motivo escrito del rechazo, visible para el autor. Vacío si no se ha rechazado. */
    rejectionReason: text("rejection_reason").notNull().default(""),
    /** Primera vez que se aprobó la revisión vigente; nulo mientras no esté aprobada. */
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Una publicación viva por original: publicar dos veces lo mismo devuelve la que ya existe (idempotencia).
    uniqueIndex("community_posts_personaje_uq").on(t.sourceCharacterId).where(sql`${t.sourceCharacterId} is not null`),
    uniqueIndex("community_posts_medio_uq").on(t.sourceMediaId).where(sql`${t.sourceMediaId} is not null`),
    index("community_posts_galeria_idx").on(t.state, t.approvedAt),
    index("community_posts_autor_idx").on(t.authorId, t.createdAt),
    index("community_posts_reto_idx").on(t.challengeId),
    index("community_posts_personaje_origen_idx").on(t.originCharacterId),
  ],
);

/**
 * Copia de un medio de una publicación, en una clave propia del almacenamiento (`comunidad/…`). No es un medio de la
 * biblioteca de nadie: no aparece en ninguna biblioteca y solo se sirve por la ruta de la comunidad, que exige que la
 * publicación esté aprobada y vigente (o que quien pide sea su autor o quien modera).
 */
export const communityPostMedia = pgTable(
  "community_post_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    /** Solo imagen o vídeo: una publicación nunca lleva audio (podría ser una voz real). */
    kind: text("kind", { enum: ["imagen", "video"] }).notNull(),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: real("duration_seconds"),
    altEs: text("alt_es").notNull().default(""),
  },
  (t) => [uniqueIndex("community_post_media_posicion_uq").on(t.postId, t.position)],
);

/** Quién ha usado un trend o una plantilla compartidos: la atribución y el contador. Uno por persona y publicación. */
export const communityUses = pgTable(
  "community_uses",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

/**
 * Logros por hitos reales. La clave primaria hace que cada logro se conceda **una sola vez**; `achieved_at` es la fecha
 * del hito, no la de la consulta que lo reconoció, y `celebrated_at` marca que ya se celebró (el confeti sale una vez).
 */
export const userAchievements = pgTable(
  "user_achievements",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    achievement: text("achievement").notNull(),
    achievedAt: timestamp("achieved_at", { withTimezone: true }).notNull(),
    celebratedAt: timestamp("celebrated_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.achievement] })],
);

export type FilaPublicacion = typeof communityPosts.$inferSelect;
export type FilaMedioPublicacion = typeof communityPostMedia.$inferSelect;
export type FilaReto = typeof communityChallenges.$inferSelect;
