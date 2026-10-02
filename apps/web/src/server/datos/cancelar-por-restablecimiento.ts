import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/cliente";
import { accountDeletions } from "../db/esquema";
import { avisarBorradoCanceladoPorRestablecimiento } from "./avisos-borrado-cuenta";

/**
 * Restablecer la contraseña **cancela** el borrado programado de la cuenta. Es la salida del titular legítimo cuando
 * otra persona le cambió la contraseña y pidió el borrado: quien controla el buzón recupera la cuenta. Las sesiones se
 * cierran igualmente al restablecer (`revokeSessionsOnPasswordReset`).
 *
 * Se cancela aunque el worker lo tenga tomado: el worker vuelve a leer el estado bajo candado antes de borrar filas y,
 * si ya no está programado, no borra nada. Un borrado que ya está borrando archivos no se puede deshacer.
 */
export async function cancelarBorradoPorRestablecimiento(usuarioId: string): Promise<boolean> {
  const hecho = await db()
    .update(accountDeletions)
    .set({ state: "cancelado", cancelledAt: new Date(), lastError: "Cancelado al restablecer la contraseña." })
    .where(
      and(
        eq(accountDeletions.userId, usuarioId),
        eq(accountDeletions.state, "programado"),
        sql`not exists(select 1 from admin_user_trash t where t.user_id = ${usuarioId}::uuid)`,
      ),
    )
    .returning({ id: accountDeletions.id });
  if (hecho.length === 0) return false;
  console.info(`[datos] borrado de cuenta cancelado al restablecer la contraseña · ${hecho[0]?.id}`);
  await avisarBorradoCanceladoPorRestablecimiento(usuarioId).catch(() => undefined);
  return true;
}
