import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Ejecutor } from "../db/cliente";
import { accountDeletions, users } from "../db/esquema";
import { ErrorGeneracion } from "../generacion/errores";

export async function cuentaBloqueada(id: string, tx: Ejecutor = db()): Promise<boolean> {
  const [fila] = await tx
    .select({
      banned: users.banned,
      eliminado: sql<boolean>`exists(select 1 from admin_user_trash where user_id = ${users.id})`,
    })
    .from(users)
    .where(eq(users.id, id));
  return !fila || fila.banned === true || fila.eliminado;
}

/** El llamador de una reserva o envío ya tiene el candado users; también rechaza borrado. */
export async function exigirCuentaOperativa(id: string, tx: Ejecutor): Promise<void> {
  if (await cuentaBloqueada(id, tx))
    throw new ErrorGeneracion(403, "La cuenta está bloqueada. No se ha iniciado ningún gasto nuevo.");
  const [borrado] = await tx
    .select({ id: accountDeletions.id })
    .from(accountDeletions)
    .where(and(eq(accountDeletions.userId, id), inArray(accountDeletions.state, ["programado", "borrando_objetos"])))
    .limit(1);
  if (borrado)
    throw new ErrorGeneracion(403, "La cuenta tiene el borrado programado. No se ha iniciado ningún gasto nuevo.");
}
