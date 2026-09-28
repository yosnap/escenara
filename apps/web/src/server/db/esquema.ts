import { boolean, index, integer, pgEnum, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./esquema-auth";

export const tipoMedio = pgEnum("media_kind", ["imagen", "video", "audio"]);

/**
 * Archivos subidos (imagen, vídeo o audio). Cada uno pertenece a un usuario (`owner_id`);
 * `deleted_at` marca los medios en la papelera.
 */
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    /**
     * `true` en los documentos de consentimiento (0.13.0). Hacen dos cosas distintas de una foto normal: se
     * guardan **sin pasar por el recorte ni la reconversión** de imágenes, porque un documento reducido puede
     * dejar de ser legible, y no se pueden usar como referencia de un personaje ni elegirse en «Crear». Lo
     * impide el servidor, no la interfaz.
     */
    isDocument: boolean("is_document").notNull().default(false),
    /**
     * Personaje del que este medio es su **hoja de personaje** (0.15.0); `null` en todo lo demás. Es la marca que
     * hace que la hoja se trate como material reservado: no la ve quien administra en `/admin/medios` ni por
     * `/api/media/*`, igual que las fotos de referencia, porque es un montaje **con esas mismas fotos**.
     *
     * Sin restricción de clave ajena a propósito, como `generation_jobs.reservation_id`: `characters` referencia
     * a `media` y una referencia de vuelta cerraría un ciclo entre los dos módulos del esquema. La marca se lee
     * **antes** de borrar el personaje, que se lleva sus hojas en la misma operación; si algo fallara, lo que
     * queda es un medio marcado y oculto, no un medio visible que no debería verse.
     */
    characterSheetOf: uuid("character_sheet_of"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // Índice del borrado del personaje: hay que localizar sus hojas, incluidas las que quedaron huérfanas.
    index("media_hoja_personaje_idx").on(t.characterSheetOf),
    index("media_listado_idx").on(t.deletedAt, t.createdAt),
    index("media_propietario_idx").on(t.ownerId, t.deletedAt, t.createdAt),
  ],
);

export type FilaMedio = typeof media.$inferSelect;
export type NuevoMedio = typeof media.$inferInsert;

export * from "./esquema-auth";
export * from "./esquema-biblioteca";
export * from "./esquema-boveda";
export * from "./esquema-catalogo";
export * from "./esquema-coherencia";
export * from "./esquema-controles";
export * from "./esquema-direcciones";
export * from "./esquema-generacion";
export * from "./esquema-mapa";
export * from "./esquema-personajes";
export * from "./esquema-presets";
export * from "./esquema-presupuesto";
export * from "./esquema-proyectos";
export * from "./esquema-revision";
export * from "./esquema-voz";
