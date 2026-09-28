import { index, pgTable, real, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { media } from "./esquema";
import { users } from "./esquema-auth";
import { proveedorCredencial } from "./esquema-boveda";
import { projects } from "./esquema-proyectos";

/**
 * Música de fondo de un proyecto (RF08, 0.21.0).
 *
 * **Solo se sube, no se genera** (decisión provisional del propietario, 2026-09-28): generar música es otro
 * proveedor, otro coste y otro problema de derechos, y nada de eso hace falta para que un proyecto tenga música.
 *
 * La declaración de derechos es **obligatoria y se guarda con su fecha**, igual que la casilla de derechos de una
 * imagen de referencia: una pista sin ella no se puede añadir, y lo impide el servidor, no la interfaz. Es lo que
 * permite responder «con qué derecho se usó esta canción» cuando alguien lo pregunte.
 */
export const musicTracks = pgTable(
  "music_tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /**
     * Archivo de audio en la biblioteca del usuario. Cascada: si el medio desaparece, esta fila no dice nada útil
     * (una declaración de derechos sobre un archivo que no existe no es una pista de música).
     */
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    /** Lo que declara el usuario sobre su derecho a usarla. Obligatorio: sin texto no se añade la pista. */
    rightsNote: text("rights_note").notNull(),
    /** Cuándo lo declaró. Una declaración sin fecha no se puede demostrar. */
    declaredAt: timestamp("declared_at", { withTimezone: true }).notNull().defaultNow(),
    /** 0–1. Volumen relativo con el que entrará en la mezcla final (0.22.0). */
    volume: real("volume").notNull().default(0.2),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("music_tracks_proyecto_idx").on(t.projectId, t.createdAt)],
);

export type FilaMusica = typeof musicTracks.$inferSelect;

/**
 * Muestras de voz ya pagadas: **una por voz y por combinación de parámetros**, cacheada por usuario.
 *
 * Existe para que oír una voz cueste **una sola vez**. Sin la caché, cada vez que alguien abriera el selector y
 * pulsara «oír» pagaría otra llamada, y comparar seis voces saldría por seis llamadas cada vez que se vuelve a
 * mirar. Con ella, la pantalla puede decir «ya la has oído, no cuesta nada» o «oírla cuesta N créditos», que es lo
 * que hace falta para decidir con conocimiento.
 *
 * **Por usuario y no global**, igual que la caché de traducciones (ADR-0017): la muestra se paga con la clave del
 * usuario y su archivo vive en su biblioteca, así que no es material que pueda servir a otra cuenta.
 */
export const voiceSamples = pgTable(
  "voice_samples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: proveedorCredencial("provider").notNull(),
    model: text("model").notNull(),
    voice: text("voice").notNull(),
    /**
     * Firma de los parámetros con los que se generó (`lib/voz.ts › firmaDeVoz` con el texto de la muestra). Forma
     * parte de la clave única: la misma voz con otra estabilidad suena distinto, así que es otra muestra.
     */
    paramsSignature: text("params_signature").notNull(),
    /** Audio en la biblioteca del usuario. Cascada: sin archivo, la fila no dice nada útil. */
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Una muestra por voz y por parámetros: es lo que impide pagar dos veces por oír lo mismo.
    unique("voice_samples_usuario_voz_uq").on(t.userId, t.provider, t.model, t.voice, t.paramsSignature),
  ],
);

export type FilaMuestraVoz = typeof voiceSamples.$inferSelect;
