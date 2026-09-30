import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import { GUIA_ESTILO_VACIA, type GuiaEstiloAnimado } from "@/lib/animados";
import { media } from "./esquema";
import { users } from "./esquema-auth";
import { alcanceUso, estiloRenderPersonaje, origenReferencia } from "./esquema-personajes";
import { jsonb } from "./jsonb";

/**
 * **Lugares**: el sitio poco conocido que el usuario reutiliza como escenario, con sus fotos de referencia.
 *
 * Reglas duras que sostiene este esquema, las mismas que las de productos y por los mismos motivos:
 *
 * - un lugar pertenece a **un usuario y nada más** (`owner_id`, borrado en cascada). Todas las lecturas filtran
 *   por el dueño en el mismo `where` que el identificador, así que uno ajeno responde 404 y ni se dice que existe;
 * - sus fotos son una **relación** con la biblioteca (`place_references`), no una copia. Borrar el lugar no borra
 *   las fotos del usuario ni nada de lo generado con él: las escenas y los trabajos solo pierden el vínculo;
 * - el lugar **versiona**, como la ficha de un personaje: cambiar fotos, maestra, descripción o guía de estilo
 *   crea una versión nueva, y cada trabajo guarda cuál usó. Un fotograma aprobado no puede quedar ligado a unas
 *   fotos que ya no son las del lugar;
 * - sin una **declaración de derechos vigente** no se genera con el lugar. La declaración es del usuario: la
 *   aplicación no juzga si algo es legal, pero sí exige que se haya dicho y deja constancia de cuándo.
 */

/** Cómo nació el lugar: con fotos de la biblioteca, generado desde una descripción o con una ilustración subida. */
export const origenLugar = pgEnum("place_origin", ["fotos", "generado", "ilustracion_subida"]);

/**
 * Qué papel hace cada foto. La **maestra** es el plano general con la luz de referencia: es la única que viaja al
 * proveedor y la que se compara con el resultado. Las demás ayudan a quien mira la ficha y a versiones futuras.
 */
export const papelReferenciaLugar = pgEnum("place_reference_kind", [
  "maestra",
  "general",
  "contraplano",
  "detalle",
  "zona",
]);

/** Lo que dijo la percepción en sombra sobre personas visibles en la foto. Informa, no bloquea. */
export const personasEnFoto = pgEnum("place_people_check", ["sin_comprobar", "ninguna", "hay_personas"]);

/** Origen de las fotos declarado por el usuario. */
export const origenFotosLugar = pgEnum("place_photo_origin", ["propias", "con_permiso", "generadas"]);

/**
 * Personas que se ven en las fotos, según el usuario. No hay opción para personas **reconocibles**: una foto así no
 * se puede declarar, hay que retirarlas con la edición de imagen o subir otra.
 */
export const personasVisiblesLugar = pgEnum("place_people_visible", ["ninguna", "no_reconocibles", "retiradas"]);

/** Exterior o espacio público frente a interior privado o con restricciones, que exige declarar permiso. */
export const espacioLugar = pgEnum("place_space", ["exterior", "interior"]);

export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Descripción corta **en castellano**. Es lo único del lugar que ve el usuario; el inglés lo compone el servidor. */
    description: text("description").notNull().default(""),
    /** Acabado del lugar: tiene que coincidir con el del proyecto donde se usa (no se mezclan acabados). */
    renderStyle: estiloRenderPersonaje("render_style").notNull().default("realista"),
    /** Guía de estilo de un lugar animado, con la misma forma que la del personaje. Vacía en un lugar realista. */
    styleGuide: jsonb<GuiaEstiloAnimado>("style_guide").notNull().default(GUIA_ESTILO_VACIA),
    origin: origenLugar("origin").notNull().default("fotos"),
    /** Número de la versión vigente; 0 mientras no se haya creado ninguna (un lugar recién dado de alta). */
    currentVersion: integer("current_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Dos lugares del mismo usuario no comparten nombre: una lista con dos «Bar» no sirve para elegir.
    unique("places_dueno_nombre_uq").on(t.ownerId, t.name),
    index("places_dueno_idx").on(t.ownerId, t.updatedAt),
    // Una guía de estilo solo tiene sentido en un lugar animado: en uno realista sería un estilo que nadie aplica.
    check("places_guia_solo_animado", sql`${t.renderStyle} = 'animado' or ${t.styleGuide}->>'preset' = ''`),
  ],
);

export const placeReferences = pgTable(
  "place_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    /** Foto de la biblioteca del usuario. Se va con la foto: sin imagen no hay referencia que valga. */
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    kind: papelReferenciaLugar("kind").notNull(),
    /** `vista_generada` en las que salen de una edición (retirar personas) o de un candidato animado aprobado. */
    origin: origenReferencia("origin").notNull().default("foto_original"),
    peopleCheck: personasEnFoto("people_check").notNull().default("sin_comprobar"),
    sortOrder: integer("sort_order").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("place_references_lugar_medio_uq").on(t.placeId, t.mediaId),
    index("place_references_lugar_idx").on(t.placeId, t.sortOrder),
    index("place_references_medio_idx").on(t.mediaId),
    // Una sola maestra por lugar: dos harían ambiguo qué se envía y con qué se compara.
    uniqueIndex("place_references_una_maestra_uq").on(t.placeId).where(sql`${t.kind} = 'maestra'`),
  ],
);

/** Lo que versiona de un lugar, tal como estaba al crear la versión. */
export interface InstantaneaLugar {
  descripcion: string;
  renderStyle: "realista" | "animado";
  styleGuide: GuiaEstiloAnimado;
}

/**
 * Versiones de un lugar. **No se borran nunca** salvo con el lugar: son la trazabilidad de lo generado. Las
 * listas de fotos no son claves ajenas a propósito: es lo que había, no lo que hay.
 */
export const placeVersions = pgTable(
  "place_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    snapshot: jsonb<InstantaneaLugar>("snapshot").notNull(),
    referenceMediaIds: jsonb<string[]>("reference_media_ids").notNull().default([]),
    /** Papel de cada foto, en el **mismo orden** que `reference_media_ids`. */
    referenceKinds: jsonb<string[]>("reference_kinds").notNull().default([]),
    /** La maestra de esta versión; vacío si no tenía. */
    masterMediaId: uuid("master_media_id"),
    /** Qué cambió respecto a la anterior: es el resumen que se muestra en la ficha. */
    changedFields: jsonb<string[]>("changed_fields").notNull().default([]),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("place_versions_lugar_numero_uq").on(t.placeId, t.number),
    index("place_versions_lugar_idx").on(t.placeId, t.number),
  ],
);

/**
 * Declaración de derechos del lugar. Como mucho **una vigente** por lugar; las revocadas se conservan porque son
 * la prueba de lo que se declaró y cuándo, también después de borrar el lugar.
 */
export const placeDeclarations = pgTable(
  "place_declarations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * `set null` y no cascada: borrar el lugar **no borra sus declaraciones**, ni las revocadas. Son la prueba de lo
     * que se declaró y cuándo, y lo generado con el lugar se queda en la biblioteca. Al borrar, la vigente se revoca
     * y el nombre queda en `place_name`.
     */
    placeId: uuid("place_id").references(() => places.id, { onDelete: "set null" }),
    /** Nombre del lugar al declarar: identifica la declaración aunque el lugar se borre. */
    placeName: text("place_name").notNull().default(""),
    photoOrigin: origenFotosLugar("photo_origin").notNull(),
    scope: alcanceUso("scope").notNull().default("personal"),
    space: espacioLugar("space").notNull().default("exterior"),
    /** Permiso del titular del sitio. Obligatorio en un interior privado o con restricciones. */
    placePermission: boolean("place_permission").notNull().default(false),
    peopleVisible: personasVisiblesLugar("people_visible").notNull(),
    /** Informativo, como `products.brand_visible`: sirve para avisar del filtro del proveedor. */
    brandsVisible: boolean("brands_visible").notNull().default(false),
    /** Declaración expresa de que en las fotos no sale ningún menor. Sin ella no hay declaración. */
    noMinorsDeclared: boolean("no_minors_declared").notNull(),
    /** Versión del texto que leyó el usuario al declarar. */
    textVersion: text("text_version").notNull(),
    declaredBy: uuid("declared_by").references(() => users.id, { onDelete: "set null" }),
    declaredAt: timestamp("declared_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason").notNull().default(""),
  },
  (t) => [
    index("place_declarations_lugar_idx").on(t.placeId, t.declaredAt),
    uniqueIndex("place_declarations_lugar_vigente_uq").on(t.placeId).where(sql`${t.revokedAt} is null`),
    check("place_declarations_sin_menores", sql`${t.noMinorsDeclared} = true`),
    check("place_declarations_interior_con_permiso", sql`${t.space} = 'exterior' or ${t.placePermission} = true`),
  ],
);

export type FilaLugar = typeof places.$inferSelect;
export type FilaReferenciaLugar = typeof placeReferences.$inferSelect;
export type FilaVersionLugar = typeof placeVersions.$inferSelect;
export type FilaDeclaracionLugar = typeof placeDeclarations.$inferSelect;
