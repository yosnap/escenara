import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { type EncuadresDelMontaje, FORMATOS_MONTAJE } from "@/lib/formatos";
import type { KitDeExportacion } from "@/lib/marca-kit";
import type { Fragmento } from "@/lib/montaje";
import { media } from "./esquema";
import { projects } from "./esquema-proyectos";
import { jsonb } from "./jsonb";

/**
 * Montaje y exportación de un proyecto (RF08, 0.32.0).
 *
 * Dos tablas y una idea: **el montaje es editable para siempre y la exportación es un hecho histórico**. El
 * montaje guarda la línea de tiempo vigente y sube de versión con cada guardado; cada exportación anota con qué
 * versión se hizo, qué salió y qué etiqueta llevaba. Por eso exportar no congela el proyecto: se puede seguir
 * tocando la línea de tiempo y lo ya descargado sigue siendo lo que se descargó.
 *
 * Los nombres de las tablas siguen la convención del esquema (inglés, como `projects`, `scenes` y
 * `music_tracks`). La de exportaciones es `montage_exports` y no `exports` porque `exports` es una palabra con
 * significado propio en un módulo de JavaScript y el nombre de la constante de Drizzle se lee en todas partes.
 *
 * El render **no cuesta créditos**: pasa por FFmpeg en la propia máquina, así que aquí no hay reserva de
 * presupuesto, ni sello de precio, ni apunte en `usage_ledger`. Lo único que consume es la cuota de biblioteca
 * del usuario, que la comprueba `media/servicio.ts` al guardar el resultado.
 */

/** Formato de salida. Un solo valor en esta versión: 16:9 y 1:1 llegan en la 0.41.0. */
export const formatoMontaje = pgEnum("montage_format", FORMATOS_MONTAJE);

/** Dónde va la etiqueta de contenido sintético. Se elige la posición, no si se pone. */
export const posicionEtiquetaMontaje = pgEnum("montage_label_position", ["arriba", "abajo"]);

export const formatoSubtitulosMontaje = pgEnum("montage_subtitle_format", ["srt", "vtt"]);

/**
 * Montaje de un proyecto: **uno por proyecto** y siempre editable.
 *
 * `version` sube con cada guardado y es lo que hace idempotente la exportación: repetir la petición con la misma
 * versión devuelve la exportación que ya existe en lugar de montar otro fichero.
 */
export const montages = pgTable(
  "montages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Un montaje por proyecto (`unique`). La línea de tiempo es del proyecto, no un documento suelto: tener dos
     * dejaría sin respuesta la pregunta «qué se exporta cuando pulso exportar».
     */
    projectId: uuid("project_id")
      .notNull()
      .unique("montages_proyecto_uq")
      .references(() => projects.id, { onDelete: "cascade" }),
    /**
     * Lista **ordenada** de fragmentos: de qué escena, desde qué segundo y hasta qué segundo. El orden de la
     * lista es el orden del vídeo, así que reordenar es reescribir esta columna y no tocar ninguna otra fila.
     *
     * Es `jsonb` y no una tabla de fragmentos a propósito: no se consulta un fragmento por su cuenta, no hay
     * nada que referenciarle y la línea de tiempo se lee y se escribe siempre entera. Que las escenas sean del
     * proyecto y tengan clip lo comprueba el servidor en cada guardado (`server/montaje/servicio.ts`).
     */
    fragments: jsonb<Fragmento[]>("fragments").notNull().default([]),
    /**
     * Volumen de la **voz** en la mezcla (0–2, es decir 0 %–200 %). En los modos `clip` y `omni` la voz viaja
     * dentro del propio clip, así que gobierna el audio del clip; en modo `pista` gobierna la pista de voz
     * generada y el clip entra con su volumen original, que ahí es solo ambiente.
     */
    voiceVolume: real("voice_volume").notNull().default(1),
    /** Volumen de la música, que multiplica el de cada pista (`music_tracks.volume`). */
    musicVolume: real("music_volume").notNull().default(1),
    /**
     * Quemar los subtítulos en la imagen. **Apagado de fábrica** (decisión del propietario, 2026-09-29): el
     * fichero adjunto es lo que las plataformas saben usar, y unos subtítulos quemados no se pueden quitar.
     * El fichero se adjunta **siempre**, con esto encendido o apagado.
     */
    burnSubtitles: boolean("burn_subtitles").notNull().default(false),
    /** Formato del fichero adjunto: SRT de fábrica, que es el que aceptan las tres plataformas. */
    subtitleFormat: formatoSubtitulosMontaje("subtitle_format").notNull().default("srt"),
    /**
     * Etiqueta de contenido sintético visible. Encendida de fábrica y obligatoria en toda exportación, también
     * cuando el personaje es animado: el servidor lo impide, no la interfaz
     * (`lib/montaje.ts › MOTIVO_ETIQUETA_OBLIGATORIA`).
     */
    labelVisible: boolean("label_visible").notNull().default(true),
    labelPosition: posicionEtiquetaMontaje("label_position").notNull().default("abajo"),
    format: formatoMontaje("format").notNull().default("vertical_9_16"),
    /**
     * Encuadre ajustado por formato y escena (0.41.0): qué parte del clip se queda al llevarlo a un formato que no
     * es el suyo. Lo que no está es el automático (`lib/formatos.ts › encuadreAutomatico`), así que un montaje
     * anterior, con esto vacío, se exporta exactamente igual que antes. Cambia los píxeles del MP4: se guarda con
     * la línea de tiempo y sube la versión.
     */
    framings: jsonb<EncuadresDelMontaje>("framings").notNull().default({}),
    /** Sube con cada guardado. Es la mitad de la clave de idempotencia de la exportación. */
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("montages_proyecto_idx").on(t.projectId)],
);

export const estadoExportacion = pgEnum("montage_export_state", ["en_cola", "en_curso", "listo", "fallido"]);

/**
 * Etapa **real** del render. No es un porcentaje calculado por tiempo: cada valor se apunta cuando FFmpeg entra
 * de verdad en esa etapa, igual que `generation_jobs.stage` (0.19.0).
 */
export const etapaExportacion = pgEnum("montage_export_stage", [
  "preparando",
  "normalizando",
  "montando",
  "guardando",
  "listo",
]);

/**
 * Una exportación: qué montaje se montó, con qué versión, qué salió y qué etiqueta llevaba.
 *
 * **Idempotente por montaje y versión**: la restricción única de abajo es lo que impide que pulsar «Exportar»
 * dos veces deje dos MP4 ocupando la cuota del usuario. Una exportación fallida sí se puede repetir, y por eso
 * la restricción no la incluye (la migración la crea como índice único parcial).
 */
export const montageExports = pgTable(
  "montage_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    montageId: uuid("montage_id")
      .notNull()
      .references(() => montages.id, { onDelete: "cascade" }),
    /** Versión del montaje con la que se exportó. Con ella se sabe si lo descargado sigue siendo lo vigente. */
    montageVersion: integer("montage_version").notNull(),
    format: formatoMontaje("format").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /**
     * MP4 resultante en la biblioteca del usuario. `set null`: si borra el archivo, la exportación sigue siendo
     * un hecho (se hizo, con esta etiqueta y esta duración) y la pantalla dice que el fichero ya no está.
     */
    resultMediaId: uuid("result_media_id").references(() => media.id, { onDelete: "set null" }),
    /** Medidas del resultado, leídas con ffprobe. `null` mientras no exista. */
    durationSeconds: real("duration_seconds"),
    sizeBytes: integer("size_bytes"),
    state: estadoExportacion("state").notNull().default("en_cola"),
    stage: etapaExportacion("stage").notNull().default("preparando"),
    /** 0–100 dentro de la etapa en curso, tal como lo informa el `-progress` de FFmpeg. */
    progress: real("progress").notNull().default(0),
    /** Etiqueta que se aplicó de verdad, con su posición. Es lo que permite responder «llevaba etiqueta». */
    labelApplied: boolean("label_applied").notNull().default(true),
    labelPosition: posicionEtiquetaMontaje("label_position").notNull().default("abajo"),
    burnedSubtitles: boolean("burned_subtitles").notNull().default(false),
    /**
     * Kit de marca del creador con el que se pidió (0.42.0): su logotipo y la esquina. Se guarda al pedirla, igual
     * que los subtítulos, para que el vídeo salga con el kit de ese momento. `null` = sin kit (lo de siempre).
     */
    brandKit: jsonb<KitDeExportacion | null>("brand_kit"),
    /**
     * Subtítulos tal como se exportaron, en los dos formatos. Se guardan **con la exportación** y no se
     * recomponen al descargarlos: los de la escena se pueden editar después, y entonces el fichero adjunto ya no
     * coincidiría con el vídeo que alguien descargó. Vacíos si el montaje no tenía ningún subtítulo.
     */
    subtitlesSrt: text("subtitles_srt").notNull().default(""),
    subtitlesVtt: text("subtitles_vtt").notNull().default(""),
    /** Causa concreta del fallo, escrita para el usuario. Vacío si no ha fallado. */
    errorMessage: text("error_message").notNull().default(""),
    /** Worker que la tiene tomada y hasta cuándo vale la toma (un worker caído la suelta al caducar). */
    lockedBy: text("locked_by"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("montage_exports_proyecto_idx").on(t.projectId, t.createdAt),
    index("montage_exports_resultado_idx").on(t.resultMediaId),
    // Índice de la toma del worker: busca las que están en cola y las tomas caducadas.
    index("montage_exports_cola_idx").on(t.state, t.lockedUntil),
    /**
     * **La idempotencia**: una sola exportación viva por montaje, versión y formato (el formato entra en la
     * 0.41.0). Es un índice único **parcial** que deja fuera las fallidas, porque un fallo sí se tiene que poder reintentar. Quien crea la exportación
     * además bloquea la fila del montaje (`server/montaje/exportacion.ts`), así que este índice es la red y no
     * el mecanismo: lo que se ve cuando se pulsa dos veces es la misma exportación, no un 500.
     */
    uniqueIndex("montage_exports_montaje_version_formato_uq")
      .on(t.montageId, t.montageVersion, t.format)
      .where(sql`${t.state} <> 'fallido'`),
  ],
);

export type FilaMontaje = typeof montages.$inferSelect;
export type FilaExportacion = typeof montageExports.$inferSelect;
