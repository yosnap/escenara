import { index, integer, pgEnum, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const tipoMedio = pgEnum("media_kind", ["imagen", "video", "audio"]);

/**
 * Archivos subidos (imagen, vídeo o audio). `owner_id` queda nulo hasta que existan cuentas;
 * `deleted_at` marca los medios en la papelera.
 */
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id"),
    kind: tipoMedio("kind").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: real("duration_seconds"),
    /** URL de la que se descargó, si se añadió desde una URL. */
    sourceUrl: text("source_url"),
    title: text("title").notNull().default(""),
    altEs: text("alt_es").notNull().default(""),
    altEn: text("alt_en").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("media_listado_idx").on(t.deletedAt, t.createdAt)],
);

export type FilaMedio = typeof media.$inferSelect;
export type NuevoMedio = typeof media.$inferInsert;
