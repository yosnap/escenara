import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { media } from "./esquema";
import { users } from "./esquema-auth";

/**
 * **Declaración de derechos del audio con el que se canta** (RF10, 0.29.0).
 *
 * Mismo patrón que `consent_records` y que la declaración de veracidad del anuncio: se guarda el **texto
 * aceptado entero**, con su fecha, su IP y la cuenta que lo aceptó. Lo que hay que poder demostrar es qué se le
 * puso delante a alguien, no que pulsara una casilla, y si una versión futura cambia la redacción, lo ya
 * aceptado conserva la suya.
 *
 * Va **por usuario y por audio**, no por escena (decisión del propietario, 2026-09-28): el mismo archivo se
 * puede usar en varias escenas del mismo usuario con una sola declaración, y un audio distinto —o una subida
 * nueva del mismo, que es otro medio— pide otra. Por escena obligaría a repetir la misma afirmación sobre el
 * mismo archivo, que no añade ninguna prueba.
 *
 * Esto es un **control, no una garantía**: nadie comprueba que lo declarado sea cierto, y ningún proveedor
 * documenta un filtro de audio con derechos. Lo que hace es dejar por escrito quién lo afirmó y sobre qué.
 */
export const tipoDerechosCanto = pgEnum("music_rights_kind", ["propia", "licenciada", "hablado_propio"]);

export const musicRightsDeclarations = pgTable(
  "music_rights_declarations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Quién lo declaró. Cascada: sin cuenta no hay nadie de quien fuera la declaración. */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Audio declarado. Cascada, igual que en `music_tracks`: una declaración de derechos sobre un archivo que
     * ya no existe no es una prueba de nada.
     */
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    kind: tipoDerechosCanto("kind").notNull(),
    /** Referencia de la licencia. Obligatoria en `licenciada`; vacía en los otros dos tipos. */
    licenseReference: text("license_reference").notNull().default(""),
    /** Texto que se aceptó, entero y de la versión que estaba vigente entonces. */
    acceptedText: text("accepted_text").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    /** IP desde la que se aceptó, tal como la ve esta instalación. Vacía si no se pudo determinar. */
    ip: text("ip").notNull().default(""),
  },
  (t) => [
    /**
     * Una declaración por usuario y audio. Declarar otra vez el mismo audio **sustituye** la anterior (el
     * usuario puede corregir el tipo o la referencia de la licencia), y por eso hace falta el índice único:
     * es lo que permite resolver el conflicto en una sola escritura en lugar de acumular filas contradictorias
     * sobre el mismo archivo.
     */
    uniqueIndex("music_rights_declarations_usuario_medio_uq").on(t.userId, t.mediaId),
    index("music_rights_declarations_usuario_idx").on(t.userId, t.acceptedAt),
  ],
);

export type FilaDeclaracionCanto = typeof musicRightsDeclarations.$inferSelect;
