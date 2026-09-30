import { and, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import { apuntarObjetosPorBorrar, borrarObjetosApuntados } from "../datos/borrado-de-objetos";
import { db, type Ejecutor } from "../db/cliente";
import { communityPostMedia, communityPosts } from "../db/esquema";

/**
 * Borrado de publicaciones: la fila y **la copia** de sus medios. Las claves se apuntan en `storage_deletions` en la
 * misma transacción que borra las filas (como el borrado de un proyecto o de una cuenta), así que si el almacenamiento
 * falla después, el worker las reintenta. El original nunca se toca.
 */

/** Claves de las copias de las publicaciones que cumplen la condición. */
export async function clavesDeCopias(ej: Ejecutor, condicion: SQL): Promise<string[]> {
  const filas = await ej
    .select({ clave: communityPostMedia.storageKey })
    .from(communityPostMedia)
    .innerJoin(communityPosts, eq(communityPosts.id, communityPostMedia.postId))
    .where(condicion);
  return filas.map((f) => f.clave);
}

/** Borra las publicaciones que cumplen la condición y apunta sus copias. Dentro de la transacción de quien borra. */
export async function borrarPublicacionesEnTx(tx: Ejecutor, condicion: SQL): Promise<string[]> {
  const claves = await clavesDeCopias(tx, condicion);
  await apuntarObjetosPorBorrar(tx, claves, "comunidad");
  await tx.delete(communityPosts).where(condicion);
  return claves;
}

/**
 * Claves de las copias de todas las publicaciones de una cuenta. Las usa el borrado de la cuenta, que las apunta con las
 * suyas: las filas caen en cascada con el usuario.
 */
export const clavesDePublicacionesDe = (tx: Ejecutor, usuarioId: string) =>
  clavesDeCopias(tx, eq(communityPosts.authorId, usuarioId));

/** Primer intento de borrar las copias recién apuntadas; lo que falle lo reintenta el worker. Nunca propaga. */
export async function borrarCopiasYa(claves: string[]): Promise<void> {
  if (claves.length === 0) return;
  await borrarObjetosApuntados({ claves }).catch((error: unknown) =>
    console.error(`[comunidad] el primer intento de borrar copias ha fallado: ${String(error).slice(0, 200)}`),
  );
}

/**
 * Pasada del worker: borra las publicaciones **huérfanas** (su original se borró: personaje, archivo, proyecto) con sus
 * copias. Ya no se ven desde el instante del borrado (la visibilidad exige original); aquí desaparecen del todo.
 */
export async function barrerPublicacionesHuerfanas(limite = 100): Promise<number> {
  const huerfana = or(
    and(isNull(communityPosts.sourceCharacterId), isNull(communityPosts.sourceMediaId)),
    isNull(communityPosts.originCharacterId),
  );
  const ids = await db().select({ id: communityPosts.id }).from(communityPosts).where(huerfana).limit(limite);
  if (ids.length === 0) return 0;
  const claves = await db().transaction(async (tx) => {
    const tomadas = (await tx.execute(sql`
      select id from community_posts
      where id in (${sql.join(
        ids.map((i) => sql`${i.id}::uuid`),
        sql`, `,
      )}) and ((source_character_id is null and source_media_id is null) or origin_character_id is null)
      for update skip locked`)) as unknown as { id: string }[];
    if (tomadas.length === 0) return [];
    return await borrarPublicacionesEnTx(
      tx,
      inArray(
        communityPosts.id,
        tomadas.map((t) => t.id),
      ),
    );
  });
  await borrarCopiasYa(claves);
  return ids.length;
}
