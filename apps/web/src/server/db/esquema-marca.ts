import { sql } from "drizzle-orm";
import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { DocumentoMarca } from "@/lib/marca-esquema";
import { ESQUINAS_KIT } from "@/lib/marca-kit";
import type { ActivosDeVersion, RolDerivado, TipoLicenciaFuente } from "@/lib/marca-vista";
import { users } from "./esquema-auth";
import { jsonb } from "./jsonb";

/**
 * **Branding editable** (RF15): la marca de la instalación, con borrador, historial y publicación atómica, y el kit
 * de marca de cada creador para sus exportaciones. Son dos cosas separadas a propósito: el kit de un usuario no
 * cambia nada de la instalación y la marca de la instalación no entra en los vídeos de nadie.
 */

export const estadoMarca = pgEnum("brand_version_state", ["borrador", "publicada", "retirada"]);
export const ambitoActivoMarca = pgEnum("brand_asset_scope", ["instalacion", "kit"]);
export const tipoActivoMarca = pgEnum("brand_asset_kind", ["logotipo", "fuente", "derivado"]);
export const esquinaKit = pgEnum("creator_kit_corner", ESQUINAS_KIT);

/** Licencia declarada de una fuente subida. Obligatoria, con fecha y con quien la declaró. */
export interface LicenciaFuente {
  tipo: TipoLicenciaFuente;
  titular: string;
  nota: string;
  declaradaEn: string;
  declaradaPor: string;
}

/**
 * Versiones de la marca de la instalación. **Una sola publicada** y **un solo borrador** a la vez (índices únicos
 * parciales): publicar retira la anterior y publica la nueva en la misma transacción, así que nunca hay dos ni
 * ninguna a medias. Sin ninguna publicada, la instalación usa la marca de Escenara tal cual.
 */
export const brandVersions = pgTable(
  "brand_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: integer("version").notNull().unique(),
    state: estadoMarca("state").notNull().default("borrador"),
    /** Documento validado con el esquema de `escenara.brand.json`. */
    document: jsonb<DocumentoMarca>("document").notNull(),
    assets: jsonb<ActivosDeVersion>("assets").notNull().default({ logos: {}, fuentes: [] }),
    /** Activos generados al publicar (favicon, iconos, imagen social). Vacío en un borrador. */
    derived: jsonb<Partial<Record<RolDerivado, string>>>("derived").notNull().default({}),
    notes: text("notes").notNull().default(""),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("brand_versions_una_publicada_uq").on(t.state).where(sql`${t.state} = 'publicada'`),
    uniqueIndex("brand_versions_un_borrador_uq").on(t.state).where(sql`${t.state} = 'borrador'`),
  ],
);

/**
 * Archivos de marca: logotipos, fuentes y activos derivados. **Inmutables**: una versión antigua apunta a los suyos y
 * revertir a ella los vuelve a usar tal cual. El contenido se ha comprobado antes de guardarlo (`lib/marca-activos.ts`)
 * y se sirve con su tipo real y `nosniff`.
 */
export const brandAssets = pgTable(
  "brand_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: ambitoActivoMarca("scope").notNull(),
    kind: tipoActivoMarca("kind").notNull(),
    /** Dueño de un activo de kit; `null` en los de la instalación. Cascada: el kit se va con su usuario. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: text("sha256").notNull(),
    /** Solo en fuentes: la familia y la licencia declarada. */
    family: text("family"),
    license: jsonb<LicenciaFuente | null>("license"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("brand_assets_dueno_idx").on(t.scope, t.ownerId, t.createdAt)],
);

/** Kit de marca de un creador: uno por usuario, solo para sus exportaciones. */
export const creatorKits = pgTable("creator_kits", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  logoAssetId: uuid("logo_asset_id").references(() => brandAssets.id, { onDelete: "set null" }),
  corner: esquinaKit("corner").notNull().default("arriba-derecha"),
  /** Si se aplica a las exportaciones nuevas. Apagado, el kit se conserva y no se usa. */
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FilaVersionMarca = typeof brandVersions.$inferSelect;
export type FilaActivoMarca = typeof brandAssets.$inferSelect;
export type FilaKit = typeof creatorKits.$inferSelect;
