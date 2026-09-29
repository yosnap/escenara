import { and, asc, eq, inArray } from "drizzle-orm";
import type { EscenaDelMontaje } from "@/lib/montaje";
import type { Subtitulo } from "@/lib/voz";
import { db } from "../db/cliente";
import {
  type FilaEscena,
  type FilaMedio,
  type FilaMontaje,
  type FilaProyecto,
  media,
  montages,
  musicTracks,
  projects,
  scenes,
} from "../db/esquema";
import { ErrorMontaje } from "./errores";

/**
 * **El material del montaje**: qué escenas hay, con qué clip, con qué voz, con qué subtítulos y con qué música.
 *
 * Todo lo que lee este fichero es del proyecto del actor: la autorización está en la consulta, no en una
 * comprobación aparte que se pueda olvidar (mismo criterio que `asistente/consulta.ts`, donde un proyecto ajeno
 * responde 404 y quien administra **no** es excepción).
 *
 * Aquí no se decide nada: ni si se puede exportar (eso es el motor de controles) ni cómo se monta (eso es
 * `render.ts`). Solo se reúne lo que hay, con la duración **real** de cada clip.
 */

/** Una escena del proyecto con su material, ya resuelto. */
export interface EscenaConMaterial {
  escena: FilaEscena;
  /** Clip guardado de la escena; `null` si no tiene o si su archivo está en la papelera. */
  clip: FilaMedio | null;
  /** Pista de voz aparte (modo `pista`); `null` en los modos `clip` y `omni`. */
  voz: FilaMedio | null;
  /**
   * Duración utilizable del clip, en segundos: la del propio archivo cuando la tiene y, si no, los segundos
   * planificados de la escena. `null` cuando no hay clip.
   *
   * El respaldo existe porque los medios anteriores a la 0.19.1 se guardaron sin duración, y sin una cifra no se
   * podría validar un recorte ni ofrecer una manecilla. Es una cifra declarada, no medida: quien manda al montar
   * es lo que diga FFmpeg del archivo.
   */
  duracionClip: number | null;
  subtitulos: Subtitulo[];
}

/** Una pista de música autorizada del proyecto, con el volumen con el que entra en la mezcla. */
export interface MusicaDelMontaje {
  medio: FilaMedio;
  /** 0–1, tal como lo guardó el usuario al añadir la pista. */
  volumen: number;
}

export interface MaterialDelProyecto {
  proyecto: FilaProyecto;
  escenas: EscenaConMaterial[];
  musica: MusicaDelMontaje[];
}

/** Medios de la biblioteca que siguen vigentes (no están en la papelera), por identificador. */
async function mediosVigentes(ids: readonly string[]): Promise<Map<string, FilaMedio>> {
  const limpios = [...new Set(ids)];
  if (limpios.length === 0) return new Map();
  const filas = await db().select().from(media).where(inArray(media.id, limpios));
  return new Map(filas.filter((f) => f.deletedAt === null).map((f) => [f.id, f]));
}

/**
 * Todo el material del proyecto, en una sola pasada. Tres consultas y no una por escena: la línea de tiempo se
 * pinta entera y una consulta por fila es el mismo problema que se evitó en el historial de trabajos.
 */
export async function materialDelProyecto(proyecto: FilaProyecto): Promise<MaterialDelProyecto> {
  const filas = await db()
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, proyecto.id))
    .orderBy(asc(scenes.sortOrder));
  const medios = await mediosVigentes([
    ...filas.flatMap((e) => (e.clipMediaId ? [e.clipMediaId] : [])),
    ...filas.flatMap((e) => (e.voiceMediaId ? [e.voiceMediaId] : [])),
  ]);
  const escenas: EscenaConMaterial[] = filas.map((escena) => {
    const clip = escena.clipMediaId ? (medios.get(escena.clipMediaId) ?? null) : null;
    return {
      escena,
      clip,
      voz: escena.voiceMediaId ? (medios.get(escena.voiceMediaId) ?? null) : null,
      duracionClip: clip ? (clip.durationSeconds ?? escena.plannedSeconds) : null,
      subtitulos: escena.subtitles,
    };
  });
  return {
    proyecto,
    escenas,
    musica: await musicaAutorizada(proyecto.id),
  };
}

/**
 * Música del proyecto que se puede mezclar: la que tiene declaración de derechos —que es **toda** la que hay,
 * porque sin ella no se pudo añadir (0.21.0)— y cuyo archivo sigue en la biblioteca.
 */
async function musicaAutorizada(proyectoId: string): Promise<MusicaDelMontaje[]> {
  const filas = await db()
    .select({ pista: musicTracks, medio: media })
    .from(musicTracks)
    .innerJoin(media, eq(musicTracks.mediaId, media.id))
    .where(eq(musicTracks.projectId, proyectoId))
    .orderBy(asc(musicTracks.createdAt));
  return filas
    .filter(({ pista, medio }) => medio.deletedAt === null && pista.rightsNote.trim() !== "")
    .map(({ pista, medio }) => ({ medio, volumen: pista.volume }));
}

/** Las escenas tal como las valida `lib/montaje.ts`: orden y duración real del clip. */
export const escenasParaValidar = (material: MaterialDelProyecto): EscenaDelMontaje[] =>
  material.escenas.map((e) => ({
    escenaId: e.escena.id,
    orden: e.escena.sortOrder,
    duracionClip: e.duracionClip,
  }));

// ── El montaje del proyecto ─────────────────────────────────────────────────────────────────────────────────

/** Montaje del proyecto, o `null` si todavía no tiene ninguno guardado. */
export async function montajeDeProyecto(proyectoId: string): Promise<FilaMontaje | null> {
  const [fila] = await db().select().from(montages).where(eq(montages.projectId, proyectoId)).limit(1);
  return fila ?? null;
}

/**
 * Montaje del proyecto de un actor, con su proyecto. Un montaje de otro responde **404**, igual que un proyecto
 * ajeno: el cruce con `projects` va en la misma consulta, así que no hay forma de leerlo sin comprobar el dueño.
 */
export async function montajePropio(
  actor: { id: string },
  montajeId: unknown,
): Promise<{ montaje: FilaMontaje; proyecto: FilaProyecto }> {
  if (typeof montajeId !== "string") throw new ErrorMontaje(404, "Ese montaje no existe.");
  const [fila] = await db()
    .select({ montaje: montages, proyecto: projects })
    .from(montages)
    .innerJoin(projects, eq(projects.id, montages.projectId))
    .where(and(eq(montages.id, montajeId), eq(projects.userId, actor.id)))
    .limit(1);
  if (!fila) throw new ErrorMontaje(404, "Ese montaje no existe.");
  return fila;
}
