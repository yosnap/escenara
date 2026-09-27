import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, type Ejecutor } from "../db/cliente";
import {
  characters,
  claims,
  type FilaAfirmacion,
  type FilaEscena,
  type FilaProyecto,
  projects,
  scenes,
} from "../db/esquema";
import type { Actor } from "../media/servicio";
import { ErrorProyecto } from "./errores";

/**
 * Lecturas de proyectos, escenas y afirmaciones, **siempre con el dueño en la consulta**.
 *
 * Aquí vive toda la autorización de la 0.17.0 y es deliberadamente aburrida: un proyecto ajeno no se
 * distingue de uno que no existe (404), y quien administra **no** es una excepción. Un proyecto es el guion de
 * alguien, con su idea y su protagonista: no hay ninguna razón para que se lo lea otra persona, y `/admin` no
 * tiene ninguna pantalla que lo necesite.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const esUuidProyecto = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Fila del proyecto si es del actor; 404 en cualquier otro caso (no existe, es de otro, o el id no es un id). */
export async function proyectoPropio(actor: Actor, id: unknown, ejecutor: Ejecutor = db()): Promise<FilaProyecto> {
  if (!esUuidProyecto(id)) throw new ErrorProyecto(404, "Ese proyecto no existe.");
  const [fila] = await ejecutor
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, actor.id)))
    .limit(1);
  if (!fila) throw new ErrorProyecto(404, "Ese proyecto no existe.");
  return fila;
}

/** Igual, pero bloqueando la fila: lo usan las escrituras que tienen que ser atómicas (aprobar, reordenar). */
export async function proyectoPropioBloqueado(actor: Actor, id: unknown, tx: Ejecutor): Promise<FilaProyecto> {
  if (!esUuidProyecto(id)) throw new ErrorProyecto(404, "Ese proyecto no existe.");
  const [fila] = await tx
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, actor.id)))
    .limit(1)
    .for("update");
  if (!fila) throw new ErrorProyecto(404, "Ese proyecto no existe.");
  return fila;
}

/**
 * Escena del actor con su proyecto. El dueño se comprueba en la misma consulta que trae la escena: sin el
 * cruce con `projects`, un identificador de escena de otra persona sería suficiente para editar su guion.
 */
export async function escenaPropia(
  actor: Actor,
  id: unknown,
  ejecutor: Ejecutor = db(),
): Promise<{ escena: FilaEscena; proyecto: FilaProyecto }> {
  if (!esUuidProyecto(id)) throw new ErrorProyecto(404, "Esa escena no existe.");
  const [fila] = await ejecutor
    .select({ escena: scenes, proyecto: projects })
    .from(scenes)
    .innerJoin(projects, eq(projects.id, scenes.projectId))
    .where(and(eq(scenes.id, id), eq(projects.userId, actor.id)))
    .limit(1);
  if (!fila) throw new ErrorProyecto(404, "Esa escena no existe.");
  return fila;
}

/** Afirmación del actor con su escena y su proyecto. Mismo cruce, misma razón. */
export async function afirmacionPropia(
  actor: Actor,
  id: unknown,
): Promise<{ afirmacion: FilaAfirmacion; escena: FilaEscena }> {
  if (!esUuidProyecto(id)) throw new ErrorProyecto(404, "Esa afirmación no existe.");
  const [fila] = await db()
    .select({ afirmacion: claims, escena: scenes })
    .from(claims)
    .innerJoin(scenes, eq(scenes.id, claims.sceneId))
    .innerJoin(projects, eq(projects.id, scenes.projectId))
    .where(and(eq(claims.id, id), eq(projects.userId, actor.id)))
    .limit(1);
  if (!fila) throw new ErrorProyecto(404, "Esa afirmación no existe.");
  return fila;
}

/** Escenas de un proyecto, en orden. Quien llama ya ha comprobado el dueño del proyecto. */
export function escenasDe(proyectoId: string, ejecutor: Ejecutor = db()): Promise<FilaEscena[]> {
  return ejecutor.select().from(scenes).where(eq(scenes.projectId, proyectoId)).orderBy(asc(scenes.sortOrder));
}

/** Afirmaciones de esas escenas, en orden de aparición. */
export async function afirmacionesDe(escenaIds: string[]): Promise<FilaAfirmacion[]> {
  if (escenaIds.length === 0) return [];
  return db().select().from(claims).where(inArray(claims.sceneId, escenaIds)).orderBy(asc(claims.createdAt));
}

/** Filas de los proyectos del actor, de lo más reciente a lo más antiguo. */
export function proyectosDe(actor: Actor): Promise<FilaProyecto[]> {
  return db().select().from(projects).where(eq(projects.userId, actor.id)).orderBy(desc(projects.updatedAt));
}

/**
 * Escenas de varios proyectos **en una sola consulta**, agrupadas por proyecto. La lista de proyectos las
 * necesita todas para sumar el coste estimado, y una consulta por proyecto es una consulta por fila de la
 * pantalla: el mismo problema que se evitó en el historial de trabajos.
 */
export async function escenasDeProyectos(proyectoIds: string[]): Promise<Map<string, FilaEscena[]>> {
  const porProyecto = new Map<string, FilaEscena[]>(proyectoIds.map((id) => [id, []]));
  if (proyectoIds.length === 0) return porProyecto;
  const filas = await db()
    .select()
    .from(scenes)
    .where(inArray(scenes.projectId, proyectoIds))
    .orderBy(asc(scenes.projectId), asc(scenes.sortOrder));
  for (const fila of filas) porProyecto.get(fila.projectId)?.push(fila);
  return porProyecto;
}

/** Proyecto al que pertenece una escena. Quien llama ya ha comprobado el dueño de la escena o de su trabajo. */
export async function proyectoDeEscena(escenaId: string): Promise<string> {
  const [fila] = await db()
    .select({ projectId: scenes.projectId })
    .from(scenes)
    .where(eq(scenes.id, escenaId))
    .limit(1);
  if (!fila) throw new ErrorProyecto(404, "Esa escena no existe.");
  return fila.projectId;
}

/** Nombre del personaje principal de un proyecto, si lo tiene y sigue existiendo. */
export async function nombreDePersonaje(personajeId: string | null): Promise<string | null> {
  if (!personajeId) return null;
  const [fila] = await db()
    .select({ nombre: characters.name })
    .from(characters)
    .where(eq(characters.id, personajeId))
    .limit(1);
  return fila?.nombre ?? null;
}
