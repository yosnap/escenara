import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Coleccion } from "@/lib/media/tipos";
import { db } from "../db/cliente";
import { collectionMedia, collections, media } from "../db/esquema";
import { ErrorMedio } from "./errores";
import type { Actor } from "./servicio";

const LARGO_MAX_NOMBRE = 60;
const MAX_COLECCIONES = 200;
const MAX_POR_OPERACION = 100;

function nombreValido(nombre: unknown): string {
  const limpio = typeof nombre === "string" ? nombre.trim() : "";
  if (!limpio) throw new ErrorMedio(400, "Ponle un nombre a la colección.");
  if (limpio.length > LARGO_MAX_NOMBRE)
    throw new ErrorMedio(400, `El nombre admite hasta ${LARGO_MAX_NOMBRE} caracteres.`);
  return limpio;
}

/** Solo el dueño modifica una colección; lo ajeno responde 404 (el admin puede verlas, no cambiarlas). */
async function coleccionPropia(actor: Actor, id: string) {
  const [coleccion] = await db().select().from(collections).where(eq(collections.id, id)).limit(1);
  if (!coleccion || coleccion.ownerId !== actor.id) throw new ErrorMedio(404, "La colección no existe.");
  return coleccion;
}

/** Colecciones de un usuario con cuántos medios (fuera de la papelera) tiene cada una. */
export async function listarColecciones(actor: Actor, propietario?: string | null): Promise<Coleccion[]> {
  const dueno =
    actor.esAdmin && propietario && propietario !== "mios" && propietario !== "todos" ? propietario : actor.id;
  const filas = await db()
    .select({
      id: collections.id,
      nombre: collections.name,
      total: sql<number>`count(${media.id})::int`,
    })
    .from(collections)
    .leftJoin(collectionMedia, eq(collectionMedia.collectionId, collections.id))
    .leftJoin(media, and(eq(media.id, collectionMedia.mediaId), isNull(media.deletedAt)))
    .where(eq(collections.ownerId, dueno))
    .groupBy(collections.id)
    .orderBy(asc(collections.name));
  return filas;
}

export async function crearColeccion(actor: Actor, nombre: unknown): Promise<Coleccion> {
  const limpio = nombreValido(nombre);
  const [fila] = await db().select({ total: count() }).from(collections).where(eq(collections.ownerId, actor.id));
  if ((fila?.total ?? 0) >= MAX_COLECCIONES) throw new ErrorMedio(409, "Has llegado al máximo de colecciones.");
  const [creada] = await db().insert(collections).values({ ownerId: actor.id, name: limpio }).returning();
  if (!creada) throw new Error("Inserción sin resultado");
  return { id: creada.id, nombre: creada.name, total: 0 };
}

export async function renombrarColeccion(actor: Actor, id: string, nombre: unknown): Promise<void> {
  await coleccionPropia(actor, id);
  await db()
    .update(collections)
    .set({ name: nombreValido(nombre), updatedAt: new Date() })
    .where(eq(collections.id, id));
}

/** Borra la colección; los archivos siguen en la biblioteca. */
export async function borrarColeccion(actor: Actor, id: string): Promise<void> {
  await coleccionPropia(actor, id);
  await db().delete(collections).where(eq(collections.id, id));
}

function idsValidos(ids: unknown): string[] {
  if (!Array.isArray(ids) || ids.length === 0) throw new ErrorMedio(400, "Indica qué archivos.");
  if (ids.length > MAX_POR_OPERACION) throw new ErrorMedio(400, `Como máximo ${MAX_POR_OPERACION} archivos a la vez.`);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!ids.every((id) => typeof id === "string" && uuid.test(id)))
    throw new ErrorMedio(400, "Identificadores no válidos.");
  return [...new Set(ids as string[])];
}

/** Añade archivos propios a una colección propia (los que ya estaban se ignoran). */
export async function anadirAColeccion(actor: Actor, id: string, ids: unknown): Promise<number> {
  await coleccionPropia(actor, id);
  const lista = idsValidos(ids);
  const propios = await db()
    .select({ id: media.id })
    .from(media)
    .where(and(inArray(media.id, lista), eq(media.ownerId, actor.id)));
  if (propios.length !== lista.length) throw new ErrorMedio(404, "Alguno de los archivos no existe.");
  await db()
    .insert(collectionMedia)
    .values(propios.map((m) => ({ collectionId: id, mediaId: m.id })))
    .onConflictDoNothing();
  return propios.length;
}

export async function quitarDeColeccion(actor: Actor, id: string, ids: unknown): Promise<void> {
  await coleccionPropia(actor, id);
  await db()
    .delete(collectionMedia)
    .where(and(eq(collectionMedia.collectionId, id), inArray(collectionMedia.mediaId, idsValidos(ids))));
}
