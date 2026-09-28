import { boolean, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { media } from "./esquema";
import { users } from "./esquema-auth";

/**
 * **Productos** (0.26.0): lo que el personaje presenta, muestra y manipula, con sus fotos de referencia.
 *
 * Reglas duras que sostiene este esquema:
 *
 * - un producto pertenece a **un usuario y nada más** (`owner_id`, borrado en cascada). Todas las lecturas
 *   filtran por el dueño en el mismo `where` que el identificador, así que uno ajeno responde 404 y ni se dice
 *   que existe;
 * - una foto de la biblioteca puede ser referencia de **varios** productos: `product_references` es una
 *   relación, no una copia, igual que `character_references`. Borrar un producto **no borra las fotos del
 *   usuario**, que puede estar usándolas en otro sitio;
 * - lo que sí desaparece con el producto son sus **derivados**: los medios generados con él, que se localizan
 *   por `generation_jobs.product_id`;
 * - cada referencia declara **qué papel hace** (`kind`). No es decorativo: la frontal con la etiqueta es la que
 *   se compara con el resultado y el detalle del mecanismo es el que hace falta para abrir la tapa. Sin el
 *   papel habría que adivinar cuál es cuál.
 */

export const tipoProducto = pgEnum("product_kind", ["fisico", "digital"]);

export const papelReferenciaProducto = pgEnum("product_reference_kind", [
  "etiqueta",
  "envase",
  "mecanismo",
  "captura_pantalla",
  "suelto",
]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Descripción corta **en castellano**. El inglés del prompt lo compone el servidor (ADR-0022). */
    description: text("description").notNull().default(""),
    kind: tipoProducto("kind").notNull().default("fisico"),
    /**
     * El usuario declara que en las fotos se ve una marca. Es **informativo**: no bloquea nada y no se detecta
     * por nuestra cuenta; sirve para poder avisarle de que el filtro del proveedor puede rechazarlo.
     */
    brandVisible: boolean("brand_visible").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Dos productos del mismo usuario no comparten nombre: una lista con dos «Crema» no sirve para elegir.
    unique("products_dueno_nombre_uq").on(t.ownerId, t.name),
    index("products_dueno_idx").on(t.ownerId, t.updatedAt),
  ],
);

export const productReferences = pgTable(
  "product_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Foto de la biblioteca del usuario. Se borra con la foto: sin imagen no hay referencia que valga. */
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    kind: papelReferenciaProducto("kind").notNull(),
    sortOrder: integer("sort_order").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // La misma foto no se añade dos veces al mismo producto: repetirla no lo describe mejor.
    unique("product_references_producto_medio_uq").on(t.productId, t.mediaId),
    index("product_references_producto_idx").on(t.productId, t.sortOrder),
    // El borrado de un producto necesita localizar sus referencias por la foto, no solo al revés.
    index("product_references_medio_idx").on(t.mediaId),
  ],
);

export type FilaProducto = typeof products.$inferSelect;
export type FilaReferenciaProducto = typeof productReferences.$inferSelect;
