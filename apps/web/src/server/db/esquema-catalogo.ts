import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./esquema-auth";

/**
 * Catálogo de proveedores y modelos (0.11.0). Sustituye a los modelos escritos a mano en el código: cada
 * modelo declara sus capacidades, sus parámetros comprobados, su estado y su precio (que sigue en
 * `model_prices`, ampliada con versión y fecha de actualización).
 *
 * Las capacidades van en su propia tabla para poder filtrar por ellas en SQL, y los parámetros en una
 * columna de texto con JSON validado en la aplicación: los `jsonb` de esta base quedan doblemente
 * codificados (Drizzle sobre bun-sql; se corrige en 0.12.0), así que no sirven ni para consultar ni para
 * sembrar desde una migración.
 */

export const capacidadModelo = pgEnum("model_capability", [
  "image_edit",
  // 0.23.4: generar una imagen **sin ninguna de partida** (retrato de un personaje inventado, «Crear» sin foto).
  "text_to_image",
  "image_to_video",
  "text_to_video",
  "text_generation",
  "tts",
  "speech_to_text",
  "multimodal_review",
]);

export const estadoModelo = pgEnum("model_state", [
  "descubierto",
  // 0.23.0: el proveedor publica su tarifa y esta instalación sabe montar su entrada, así que se puede elegir.
  "precio_publicado",
  "compatible",
  "validado",
  "retirado",
]);

/**
 * Proveedor de modelos. No comparte enumeración con las credenciales a propósito: un proveedor puede
 * estar en el catálogo (para dejar el hueco visible) antes de que exista su adaptador.
 */
export const modelProviders = pgTable("model_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  docsUrl: text("docs_url").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const models = pgTable(
  "models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => modelProviders.id, { onDelete: "cascade" }),
    /** Identificador del modelo en el proveedor, tal cual se le envía. */
    modelId: text("model_id").notNull(),
    name: text("name").notNull(),
    state: estadoModelo("state").notNull().default("descubierto"),
    /** Unidad que factura el proveedor; enlaza con la fila de `model_prices`. */
    unit: text("unit").notNull(),
    /** `true` si el resultado lleva voz: un modelo sin voz no usa «Lo que dice». */
    hasVoice: boolean("has_voice").notNull().default(false),
    /** Parámetros comprobados, en JSON de texto (ver `ParametrosModelo`). */
    parameters: text("parameters").notNull().default("{}"),
    notes: text("notes").notNull().default(""),
    /** Evidencia de la última validación: coste medido y ejemplo o informe. */
    evidence: text("evidence").notNull().default(""),
    /** Opción por defecto de su capacidad en «Crear». */
    isDefault: boolean("is_default").notNull().default(false),
    /** Sube en cada cambio del registro. */
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("models_proveedor_modelo_uq").on(t.providerId, t.modelId), index("models_estado_idx").on(t.state)],
);

export const modelCapabilities = pgTable(
  "model_capabilities",
  {
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    capability: capacidadModelo("capability").notNull(),
  },
  (t) => [primaryKey({ name: "model_capabilities_pk", columns: [t.modelId, t.capability] })],
);

/**
 * Historial del catálogo: quién cambió qué, cuándo y con qué evidencia. Es lo que permite explicar por
 * qué una estimación anterior ya no vale (el precio cambió) sin tocar los créditos ya consumidos.
 */
export const modelCatalogChanges = pgTable(
  "model_catalog_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    /** `alta`, `estado` o `precio`. */
    field: text("field").notNull(),
    fromValue: text("from_value").notNull().default(""),
    toValue: text("to_value").notNull().default(""),
    evidence: text("evidence").notNull().default(""),
    /** Quién lo cambió; `null` si fue la semilla o si la cuenta ya no existe. */
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("model_catalog_changes_modelo_idx").on(t.modelId, t.createdAt)],
);

export type FilaProveedorModelo = typeof modelProviders.$inferSelect;
export type FilaModelo = typeof models.$inferSelect;
export type FilaCambioCatalogo = typeof modelCatalogChanges.$inferSelect;

/**
 * Sincronizaciones del catálogo con la tabla de precios pública de un proveedor (0.23.0). Una fila por pasada:
 * cuántos precios se leyeron, cuántos modelos se crearon o cambiaron y cuántos registros no se supieron
 * traducir. Es lo que deja ver en el admin **cuándo** se leyó el catálogo y **qué parte** de él se entiende.
 *
 * Un fallo también deja fila, con `ok` en falso y su motivo: una sincronización que no se hizo tiene que
 * notarse, porque si no los precios envejecen en silencio.
 */
export const modelPriceSyncs = pgTable(
  "model_price_syncs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    ok: boolean("ok").notNull().default(true),
    /** Tarifas que publicaba el proveedor en esa pasada. */
    published: integer("published").notNull().default(0),
    /** Tarifas que esta instalación supo traducir a un modelo de su catálogo. */
    understood: integer("understood").notNull().default(0),
    modelsCreated: integer("models_created").notNull().default(0),
    pricesCreated: integer("prices_created").notNull().default(0),
    pricesUpdated: integer("prices_updated").notNull().default(0),
    /** Motivo cuando `ok` es falso; vacío cuando fue bien. */
    note: text("note").notNull().default(""),
    /** Quién la lanzó; `null` cuando la lanzó el worker en su pasada diaria. */
    startedBy: uuid("started_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("model_price_syncs_proveedor_idx").on(t.provider, t.createdAt)],
);

export type FilaSincronizacionPrecios = typeof modelPriceSyncs.$inferSelect;
