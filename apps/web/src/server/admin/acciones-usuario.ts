import { eq, sql } from "drizzle-orm";
import { exigirCuentaOperativa } from "../auth/estado-cuenta";
import { db } from "../db/cliente";
import { sessions, userPolicies, users } from "../db/esquema";
import { validarLimite } from "../presupuesto/limites-efectivos";
import { auditar, bloquearAdministracion, operacionRepetida, validarOperacion } from "./auditoria";

export type AccionUsuario = "activar" | "bloquear" | "desbloquear" | "revocar";
export async function cambiarUsuario(
  actorId: string,
  id: string,
  accion: AccionUsuario,
  motivo: string,
  operationId: string,
) {
  const reason = validarOperacion(id, motivo, operationId);
  if (!["activar", "bloquear", "desbloquear", "revocar"].includes(accion)) throw new Error("Acción inválida.");
  await db().transaction(async (tx) => {
    await bloquearAdministracion(tx, actorId, id);
    if (await operacionRepetida(tx, operationId, actorId, id, accion, reason)) return;
    const [usuario] = await tx
      .select({ role: users.role, banned: users.banned, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, id));
    if (!usuario) throw new Error("La cuenta ya no existe.");
    if (accion !== "revocar") {
      const [estado] = await tx.execute(
        sql`select (exists(select 1 from account_deletions where user_id = ${id}::uuid and state in ('programado', 'borrando_objetos')) or exists(select 1 from admin_user_trash where user_id = ${id}::uuid)) as borrado`,
      );
      if (estado?.borrado) throw new Error("La cuenta tiene el borrado programado: conserva su flujo de recuperación.");
    }
    if (accion === "bloquear") {
      if (id === actorId) throw new Error("No puedes bloquear tu propia cuenta.");
      if (usuario.role === "admin") {
        const otros = await tx.execute(
          sql`select id from users u where u.role = 'admin' and u.id <> ${id}::uuid and coalesce(u.banned, false) = false and not exists (select 1 from account_deletions d where d.user_id = u.id and d.state in ('programado', 'borrando_objetos'))`,
        );
        if (otros.length === 0) throw new Error("No se puede bloquear al último administrador habilitado.");
      }
      await tx
        .update(users)
        .set({ banned: true, banReason: "Cuenta bloqueada por administración", banExpires: null })
        .where(eq(users.id, id));
      await tx.delete(sessions).where(eq(sessions.userId, id));
    } else if (accion === "activar" || accion === "desbloquear") {
      if (accion === "activar") {
        if (usuario.banned) throw new Error("Desbloquea la cuenta antes de activarla.");
        if (usuario.emailVerified) throw new Error("La cuenta ya está verificada.");
        await tx.update(users).set({ emailVerified: true }).where(eq(users.id, id));
      } else {
        await tx.update(users).set({ banned: false, banReason: null, banExpires: null }).where(eq(users.id, id));
      }
    } else {
      await tx.delete(sessions).where(eq(sessions.userId, id));
    }
    const cambios: Record<string, boolean> = {};
    if (accion === "activar") cambios.verificado = true;
    else if (accion !== "revocar") cambios.bloqueado = accion === "bloquear";
    await auditar(tx, {
      actorId,
      targetId: id,
      action: accion,
      reason,
      operationId,
      changes: cambios,
    });
  });
}

export async function cambiarPolitica(
  actorId: string,
  id: string,
  datos: { budgetMode: unknown; budgetValue: unknown; jobMode: unknown; jobValue: unknown },
  motivo: string,
  operationId: string,
) {
  const reason = validarOperacion(id, motivo, operationId);
  const presupuesto = validarLimite(datos.budgetMode, datos.budgetValue);
  const trabajo = validarLimite(datos.jobMode, datos.jobValue);
  const cambios = {
    budgetMode: presupuesto.modo,
    budgetValue: presupuesto.valor,
    jobMode: trabajo.modo,
    jobValue: trabajo.valor,
  };
  await db().transaction(async (tx) => {
    await bloquearAdministracion(tx, actorId, id);
    if (await operacionRepetida(tx, operationId, actorId, id, "politica", reason, cambios)) return;
    await exigirCuentaOperativa(id, tx);
    await tx
      .insert(userPolicies)
      .values({ userId: id, ...cambios })
      .onConflictDoUpdate({ target: userPolicies.userId, set: cambios });
    await auditar(tx, { actorId, targetId: id, action: "politica", reason, operationId, changes: cambios });
  });
}
