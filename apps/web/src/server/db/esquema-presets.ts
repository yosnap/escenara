import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
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
import { users } from "./esquema-auth";
import { capacidadModelo } from "./esquema-catalogo";

/**
 * Presets y plantillas de prompt (RF04, 0.16.0). Crear deja de ser un campo de texto libre: el usuario elige
 * con botones y **el servidor compone el prompt** a partir de identificadores, nunca del texto que mande el
 * navegador.
 *
 * Reglas duras que sostiene este esquema:
 *
 * - `owner_id` nulo = **de la instalación**: lo edita quien administra y lo ve todo el mundo. Con dueño es una
 *   copia de un usuario, y solo la ve él. No hay tercera posibilidad: compartir es de 0.28.0;
 * - una plantilla es **versionada**: `prompt_template_versions` guarda la instantánea de cada texto, de sus
 *   variables y de sus restricciones, y cada trabajo cita la fila de la versión que usó. Editar la plantilla
 *   crea una versión nueva y **no cambia** lo que ya se generó;
 * - los valores de un preset y las variables de una plantilla van en columnas de **texto con JSON validado
 *   en la aplicación**, como los parámetros del catálogo de 0.11.0: se validan con el mismo código que los
 *   lee, así que ni la semilla ni el admin pueden colar algo que no se entienda.
 */

export const categoriaPreset = pgEnum("preset_category", [
  "especialidad",
  "formato",
  "estilo",
  "vestuario",
  "duracion",
  "accion",
  // Categorías de la dirección del clip y del método 6C (0.25.0). `anclajes` es el bloque C6, que compone quien
  // administra y el usuario no puede editar ni quitar.
  "formato-clip",
  "plano",
  "angulo",
  "optica",
  "luz",
  "localizacion",
  "camara",
  "microaccion",
  "registro-estetico",
  "anclajes",
]);

export const presets = pgTable(
  "presets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `null` = de la instalación (lo edita quien administra). Con dueño, es la copia de un usuario. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    category: categoriaPreset("category").notNull(),
    /** Clave estable de la semilla; es lo que hace idempotente sembrar dos veces. */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** En español: es lo que se lee en el botón. */
    description: text("description").notNull().default(""),
    /** Valores en JSON de texto (ver `ValoresPreset`): el fragmento en inglés y sus restricciones. */
    values: text("values").notNull().default("{}"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    /**
     * Preset del que se duplicó, si se duplicó de alguno. `set null`: el original puede desaparecer y la copia
     * sigue siendo válida.
     *
     * Se guarda ya en 0.16.0 porque es la **procedencia**, y es lo que necesitarán las plantillas compartibles y
     * remezclables de 0.28.0: sin ella no se podría decir «esto salió de aquello» cuando una copia circule entre
     * cuentas. Hoy se escribe al duplicar y se muestra en el admin; ninguna lógica depende de su valor.
     */
    duplicatedFrom: uuid("duplicated_from").references((): AnyPgColumn => presets.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Dos presets del mismo usuario en la misma categoría no comparten clave.
    unique("presets_dueno_categoria_clave_uq").on(t.ownerId, t.category, t.slug),
    /**
     * Y los de la instalación tampoco: en PostgreSQL dos `null` no chocan, así que la restricción de arriba
     * no cubre `owner_id is null` y la semilla podría duplicar filas al sembrar dos veces.
     */
    uniqueIndex("presets_instalacion_categoria_clave_uq").on(t.category, t.slug).where(sql`${t.ownerId} is null`),
    index("presets_listado_idx").on(t.category, t.sortOrder),
    index("presets_dueno_idx").on(t.ownerId),
  ],
);

export const promptTemplates = pgTable(
  "prompt_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * `null` = de la instalación. Igual que en `presets`.
     *
     * En 0.16.0 **todas** las plantillas son de la instalación: la interfaz no ofrece duplicarlas, solo los
     * presets. La columna (y `duplicated_from`) existen porque el servidor ya autoriza por dueño en todas sus
     * lecturas —`plantillaUsable` acepta la de la instalación **o la del usuario**—, así que 0.28.0 solo tiene que
     * añadir el botón de duplicar y las reglas de compartir, sin migrar nada ni tocar la autorización.
     */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** Capacidad de destino: es lo que decide con qué modelos puede usarse (catálogo de 0.11.0). */
    capability: capacidadModelo("capability").notNull(),
    /** Texto con variables `{{nombre}}`, en inglés. Valor vigente; su instantánea vive en las versiones. */
    template: text("template").notNull().default(""),
    /** Variables declaradas, en JSON de texto (ver `VariablePlantilla`). */
    variables: text("variables").notNull().default("[]"),
    /** Restricciones por modelo, en JSON de texto (ver `RestriccionesPlantilla`). */
    modelRestrictions: text("model_restrictions").notNull().default("{}"),
    /** Número de la versión vigente. Sube con cada cambio del texto, las variables o las restricciones. */
    version: integer("version").notNull().default(1),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    duplicatedFrom: uuid("duplicated_from").references((): AnyPgColumn => promptTemplates.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("prompt_templates_dueno_clave_uq").on(t.ownerId, t.slug),
    uniqueIndex("prompt_templates_instalacion_clave_uq").on(t.slug).where(sql`${t.ownerId} is null`),
    index("prompt_templates_capacidad_idx").on(t.capability, t.sortOrder),
    index("prompt_templates_dueno_idx").on(t.ownerId),
  ],
);

/**
 * Instantánea de una versión de la plantilla. Es lo que cita cada trabajo: editar la plantilla crea una fila
 * nueva y la anterior se conserva intacta, así que **lo ya generado no cambia**.
 */
export const promptTemplateVersions = pgTable(
  "prompt_template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => promptTemplates.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    template: text("template").notNull(),
    variables: text("variables").notNull().default("[]"),
    modelRestrictions: text("model_restrictions").notNull().default("{}"),
    /** Motivo del cambio, escrito por quien administra. */
    changeReason: text("change_reason").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("prompt_template_versions_plantilla_numero_uq").on(t.templateId, t.number),
    index("prompt_template_versions_plantilla_idx").on(t.templateId, t.number),
  ],
);

export type FilaPreset = typeof presets.$inferSelect;
export type FilaPlantilla = typeof promptTemplates.$inferSelect;
export type FilaVersionPlantilla = typeof promptTemplateVersions.$inferSelect;
