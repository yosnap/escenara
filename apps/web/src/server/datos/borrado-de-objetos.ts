import { and, count, eq, inArray, sql } from "drizzle-orm";
import { borrarObjeto } from "../almacenamiento";
import { db, type Ejecutor } from "../db/cliente";
import { storageDeletions } from "../db/esquema";

/**
 * Objetos del almacenamiento pendientes de borrar. Un borrado de proyecto o de cuenta **apunta aquí sus claves en la
 * misma transacción que borra las filas**: si después el almacenamiento falla (o el proceso muere), la clave no se
 * pierde en un registro de texto. Se intenta enseguida y, lo que falle, lo reintenta el worker con retroceso
 * (1, 2, 4… minutos, hasta 12 horas) y un tope de intentos; lo que lo agota queda como «fallido», visible para quien
 * administra en Admin › Ajustes › Tus datos. La fila desaparece en cuanto el objeto se borra.
 */

export const MAXIMO_INTENTOS_OBJETO = 8;
const MINUTO = 60_000;
/** Mientras un worker intenta borrar un lote, nadie más lo toca. */
const MS_TOMA = 10 * MINUTO;
const LOTE = 500;

export const retrocesoDeObjeto = (intentos: number) =>
  Math.min(2 ** Math.max(0, intentos - 1) * MINUTO, 12 * 60 * MINUTO);

export type OrigenBorradoObjeto = "proyecto" | "cuenta" | "comunidad";

/** Apunta las claves por borrar, dentro de la transacción de quien borra las filas. Idempotente por clave. */
export async function apuntarObjetosPorBorrar(
  tx: Ejecutor,
  claves: string[],
  origen: OrigenBorradoObjeto,
  cuentaId: string | null = null,
): Promise<void> {
  for (let i = 0; i < claves.length; i += LOTE) {
    const lote = claves.slice(i, i + LOTE);
    await tx
      .insert(storageDeletions)
      .values(lote.map((storageKey) => ({ storageKey, origin: origen, accountDeletionId: cuentaId })))
      .onConflictDoNothing();
  }
}

const detalle = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

export interface ResultadoBorradoObjetos {
  borrados: number;
  fallidos: number;
}

/**
 * Toma y borra objetos apuntados a los que les toca: todos (el barrido del worker), los de un borrado de cuenta o unas
 * claves concretas (el primer intento, justo después de borrar las filas).
 */
export async function borrarObjetosApuntados(
  filtro: { cuentaId?: string; claves?: string[] } = {},
  borrar: (clave: string) => Promise<void> = borrarObjeto,
  limite = LOTE,
): Promise<ResultadoBorradoObjetos> {
  // Siempre solo los que tocan: los recién apuntados tocan ya (su `next_attempt_at` es el de su transacción).
  const condicion = filtro.cuentaId
    ? sql`account_deletion_id = ${filtro.cuentaId} and next_attempt_at <= now()`
    : filtro.claves
      ? filtro.claves.length === 0
        ? sql`false`
        : sql`next_attempt_at <= now() and storage_key in (${sql.join(
            filtro.claves.slice(0, limite).map((c) => sql`${c}`),
            sql`, `,
          )})`
      : sql`next_attempt_at <= now()`;
  const hasta = new Date(Date.now() + MS_TOMA);
  const tomados = (await db().execute(sql`
    with candidatos as (
      select id from storage_deletions
      where state = 'pendiente' and ${condicion}
      order by next_attempt_at asc
      for update skip locked
      limit ${limite}
    )
    update storage_deletions d set next_attempt_at = ${hasta}, attempts = d.attempts + 1
    from candidatos c where d.id = c.id
    returning d.id, d.storage_key as clave, d.attempts as intentos
  `)) as unknown as { id: string; clave: string; intentos: number }[];
  let borrados = 0;
  let fallidos = 0;
  for (const t of tomados) {
    try {
      await borrar(t.clave);
      await db().delete(storageDeletions).where(eq(storageDeletions.id, t.id));
      borrados++;
    } catch (error) {
      fallidos++;
      const agotado = t.intentos >= MAXIMO_INTENTOS_OBJETO;
      await db()
        .update(storageDeletions)
        .set({
          state: agotado ? "fallido" : "pendiente",
          nextAttemptAt: new Date(Date.now() + retrocesoDeObjeto(t.intentos)),
          lastError: detalle(error),
        })
        .where(eq(storageDeletions.id, t.id));
      console.error(
        `[datos] no se ha podido borrar un objeto (intento ${t.intentos}${agotado ? ", sin más reintentos" : ""}): ${detalle(error)}`,
      );
    }
  }
  return { borrados, fallidos };
}

/** Cuántos quedan pendientes y cuántos agotaron los intentos, para Admin › Ajustes › Tus datos. */
export async function estadoDeObjetosPorBorrar(): Promise<{ pendientes: number; fallidos: number }> {
  const filas = await db()
    .select({ estado: storageDeletions.state, total: count() })
    .from(storageDeletions)
    .groupBy(storageDeletions.state);
  return {
    pendientes: filas.find((f) => f.estado === "pendiente")?.total ?? 0,
    fallidos: filas.find((f) => f.estado === "fallido")?.total ?? 0,
  };
}

/** Pendientes y fallidos de un borrado de cuenta. */
export async function objetosDeLaCuenta(cuentaId: string): Promise<{ pendientes: number; fallidos: number }> {
  const filas = await db()
    .select({ estado: storageDeletions.state, total: count() })
    .from(storageDeletions)
    .where(
      and(eq(storageDeletions.accountDeletionId, cuentaId), inArray(storageDeletions.state, ["pendiente", "fallido"])),
    )
    .groupBy(storageDeletions.state);
  return {
    pendientes: filas.find((f) => f.estado === "pendiente")?.total ?? 0,
    fallidos: filas.find((f) => f.estado === "fallido")?.total ?? 0,
  };
}

/** Vuelve a poner en cola los objetos «fallidos» (tras arreglar el almacenamiento). Devuelve cuántos. */
export async function reintentarObjetosFallidos(): Promise<number> {
  const filas = await db()
    .update(storageDeletions)
    .set({ state: "pendiente", attempts: 0, nextAttemptAt: new Date(), lastError: "" })
    .where(eq(storageDeletions.state, "fallido"))
    .returning({ id: storageDeletions.id });
  return filas.length;
}
