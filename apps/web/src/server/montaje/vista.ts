import { eq } from "drizzle-orm";
import {
  duracionTotalDeFragmentos,
  type EscenaMontableVista,
  type ExportacionVista,
  MOTIVO_ETIQUETA_OBLIGATORIA,
  type MontajeVista,
} from "@/lib/montaje";
import { leerAjustes } from "../ajustes";
import { urlTemporalDescargaMontaje } from "../almacenamiento";
import { db } from "../db/cliente";
import { type FilaExportacion, type FilaMontaje, media } from "../db/esquema";
import { type Actor, aDto } from "../media/servicio";
import { exportacionesDeProyecto } from "./exportacion";
import type { MaterialDelProyecto } from "./material";
import { controlesDelMontajeParaMostrar } from "./puerta";

/**
 * El montaje y sus exportaciones **tal como viajan al navegador** (RF08, 0.32.0).
 *
 * Todo lo que sale de aquí es del usuario o es suyo de ver: sus clips con URL temporal, sus subtítulos editados y
 * los motivos de los frenos escritos para él. No sale ninguna clave del almacenamiento, ninguna ruta del servidor
 * ni ningún argumento de FFmpeg.
 */

/** Primeras palabras del guion, para reconocer la escena en la línea de tiempo. */
const resumenDe = (texto: string): string => {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > 80 ? `${limpio.slice(0, 79)}…` : limpio;
};

export function escenasParaLaVista(actor: Actor, material: MaterialDelProyecto): EscenaMontableVista[] {
  return material.escenas.map((e) => ({
    escenaId: e.escena.id,
    orden: e.escena.sortOrder,
    resumen: resumenDe(e.escena.scriptText || e.escena.action),
    duracionClip: e.duracionClip,
    medioClip: e.clip ? aDto(e.clip, actor) : null,
    tieneVoz: e.voz !== null,
    audioDelClipQuitado: e.escena.clipAudioMuted,
    subtitulos: e.subtitulos,
  }));
}

/** Una exportación, con su MP4 y su URL temporal de descarga si sigue existiendo. */
export async function exportacionParaLaVista(
  actor: Actor,
  exportacion: FilaExportacion,
  versionVigente: number,
): Promise<ExportacionVista> {
  const medio = exportacion.resultMediaId ? await medioSiSigue(actor, exportacion.resultMediaId) : null;
  return {
    id: exportacion.id,
    estado: exportacion.state,
    etapa: exportacion.stage,
    progreso: exportacion.progress,
    formato: exportacion.format,
    ancho: exportacion.width,
    alto: exportacion.height,
    duracion: exportacion.durationSeconds,
    tamano: exportacion.sizeBytes,
    medio,
    etiquetaAplicada: exportacion.labelApplied,
    etiquetaPosicion: exportacion.labelPosition,
    subtitulosQuemados: exportacion.burnedSubtitles,
    tieneSubtitulos: exportacion.subtitlesSrt.trim() !== "",
    error: exportacion.errorMessage,
    montajeVersion: exportacion.montageVersion,
    vigente: exportacion.montageVersion === versionVigente,
    creadoEn: exportacion.createdAt.toISOString(),
    terminadoEn: exportacion.finishedAt?.toISOString() ?? null,
  };
}

/** El medio del resultado, o `null` si el usuario lo ha borrado o enviado a la papelera. */
async function medioSiSigue(actor: Actor, medioId: string) {
  const [fila] = await db().select().from(media).where(eq(media.id, medioId)).limit(1);
  return fila && fila.deletedAt === null
    ? { ...aDto(fila, actor), url: urlTemporalDescargaMontaje(fila.storageKey) }
    : null;
}

/** Todo lo que la pantalla de montaje necesita, en una sola respuesta. */
export async function montajeParaLaVista(
  actor: Actor,
  montaje: FilaMontaje,
  material: MaterialDelProyecto,
): Promise<MontajeVista> {
  const segundos = duracionTotalDeFragmentos(montaje.fragments);
  const [{ montajeActivo }, controles, filas] = await Promise.all([
    leerAjustes(),
    controlesDelMontajeParaMostrar(actor, montaje, material, segundos),
    exportacionesDeProyecto(material.proyecto.id),
  ]);
  const exportaciones = await Promise.all(filas.map((fila) => exportacionParaLaVista(actor, fila, montaje.version)));
  return {
    proyectoId: material.proyecto.id,
    version: montaje.version,
    formato: montaje.format,
    fragmentos: montaje.fragments,
    volumenVoz: montaje.voiceVolume,
    volumenMusica: montaje.musicVolume,
    subtitulosQuemados: montaje.burnSubtitles,
    formatoSubtitulos: montaje.subtitleFormat,
    etiquetaVisible: montaje.labelVisible,
    etiquetaPosicion: montaje.labelPosition,
    etiquetaObligatoria: true,
    motivoEtiqueta: MOTIVO_ETIQUETA_OBLIGATORIA,
    duracionTotal: segundos,
    escenas: escenasParaLaVista(actor, material),
    controles,
    activo: montajeActivo,
    exportaciones,
    actualizadoEn: montaje.updatedAt.toISOString(),
  };
}
