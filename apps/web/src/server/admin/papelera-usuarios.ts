import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { leerAjustes } from "../ajustes";
import { db } from "../db/cliente";
import { accountDeletions, adminUserTrash, sessions, users } from "../db/esquema";
import { auditar, bloquearAdministracion, operacionRepetida, validarOperacion } from "./auditoria";

export type AccionPapelera = "eliminar" | "restaurar" | "definitivo";
export async function gestionarPapelera(
  actorId: string,
  id: string,
  accion: AccionPapelera,
  motivo: string,
  operationId: string,
) {
  const reason = validarOperacion(id, motivo, operationId);
  if (!["eliminar", "restaurar", "definitivo"].includes(accion)) throw new Error("Acción inválida.");
  const ajustes = await leerAjustes();
  await db().transaction(async (tx) => {
    await bloquearAdministracion(tx, actorId, id);
    if (await operacionRepetida(tx, operationId, actorId, id, accion, reason)) return;
    if (actorId === id) throw new Error("Usa el flujo de tu cuenta para pedir tu propio borrado.");
    const [usuario] = await tx.select().from(users).where(eq(users.id, id));
    if (!usuario) throw new Error("La cuenta ya no existe.");
    const [papelera] = await tx.select().from(adminUserTrash).where(eq(adminUserTrash.userId, id));
    const [abierto] = await tx
      .select({ id: accountDeletions.id })
      .from(accountDeletions)
      .where(and(eq(accountDeletions.userId, id), inArray(accountDeletions.state, ["programado", "borrando_objetos"])));
    if (accion === "eliminar") {
      if (papelera || abierto) throw new Error("La cuenta ya tiene un borrado abierto.");
      if (usuario.role === "admin") {
        const otros = await tx.execute(
          sql`select id from users u where role = 'admin' and id <> ${id}::uuid and coalesce(banned, false) = false and not exists(select 1 from account_deletions d where d.user_id = u.id and d.state in ('programado', 'borrando_objetos')) and not exists(select 1 from admin_user_trash t where t.user_id = u.id)`,
        );
        if (!otros.length) throw new Error("No se puede eliminar al último administrador habilitado.");
      }
      await tx.insert(adminUserTrash).values({
        userId: id,
        actorId,
        eligibleAt: new Date(Date.now() + ajustes.borradoCuentaDiasGracia * 86400000),
        previousBanned: usuario.banned === true,
        previousBanReason: usuario.banReason,
        previousBanExpires: usuario.banExpires,
      });
      await tx
        .update(users)
        .set({ banned: true, banReason: "Cuenta en eliminados", banExpires: null })
        .where(eq(users.id, id));
      await tx.delete(sessions).where(eq(sessions.userId, id));
    } else {
      if (!papelera) throw new Error("La cuenta no está en eliminados.");
      if (papelera.permanentRequestedAt || abierto)
        throw new Error("El borrado definitivo ya está autorizado o en curso.");
      if (accion === "restaurar") {
        await tx.delete(adminUserTrash).where(eq(adminUserTrash.userId, id));
        await tx
          .update(users)
          .set({
            banned: papelera.previousBanned,
            banReason: papelera.previousBanReason,
            banExpires: papelera.previousBanExpires,
          })
          .where(eq(users.id, id));
      } else {
        if (papelera.eligibleAt > new Date()) throw new Error("El plazo de recuperación todavía no ha terminado.");
        // El worker conserva su conciliación, agregados y borrado de objetos; nunca DELETE users desde la acción.
        await tx
          .insert(accountDeletions)
          .values({ userId: id, scheduledFor: papelera.eligibleAt, availableAt: new Date() });
        await tx
          .update(adminUserTrash)
          .set({ permanentRequestedAt: new Date() })
          .where(and(eq(adminUserTrash.userId, id), isNull(adminUserTrash.permanentRequestedAt)));
      }
    }
    await auditar(tx, { actorId, targetId: id, action: accion, reason, operationId });
  });
}
