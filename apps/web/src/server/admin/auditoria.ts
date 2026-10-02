import { eq, sql } from "drizzle-orm";
import { exigirCuentaOperativa } from "../auth/estado-cuenta";
import type { Ejecutor } from "../db/cliente";
import { adminEvents, users } from "../db/esquema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ATRIBUTOS_AUDITABLES = new Set([
  "verificado",
  "bloqueado",
  "budgetMode",
  "budgetValue",
  "jobMode",
  "jobValue",
  "claves",
  "revision",
]);

function serializarCambios(datos: Record<string, unknown>) {
  return JSON.stringify(Object.entries(datos).sort(([a], [b]) => a.localeCompare(b)));
}

export function validarOperacion(id: string, motivo: string, operacion: string) {
  if (!UUID.test(id) || !UUID.test(operacion)) throw new Error("Identificador inválido.");
  const limpio = motivo.trim();
  if (limpio.length < 3 || limpio.length > 300)
    throw new Error("Escribe un motivo de 3 a 300 caracteres, sin datos privados.");
  return limpio;
}

/** Orden único para cambios administrativos; el actor se revalida bajo el mismo lock. */
export async function bloquearAdministracion(tx: Ejecutor, actorId: string, destinoId?: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(505000)`);
  await tx.execute(
    sql`select id from users where id in (${actorId}::uuid, ${destinoId ?? actorId}::uuid) order by id for update`,
  );
  const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, actorId));
  if (actor?.role !== "admin") throw new Error("Se necesita una cuenta administradora vigente.");
  await exigirCuentaOperativa(actorId, tx);
  const [ritmo] = await tx.execute(
    sql`select count(*)::int n from admin_events where actor_id = ${actorId}::uuid and created_at > now() - interval '1 minute'`,
  );
  if ((ritmo?.n ?? 0) >= 60) throw new Error("Demasiadas acciones administrativas. Espera un minuto.");
}

export async function auditar(tx: Ejecutor, datos: typeof adminEvents.$inferInsert) {
  // Solo atributos operativos. Nunca se acepta un objeto arbitrario de formulario como cambios.
  for (const clave of Object.keys(datos.changes ?? {})) {
    if (!ATRIBUTOS_AUDITABLES.has(clave)) throw new Error("Atributo de auditoría no permitido.");
  }
  await tx.insert(adminEvents).values(datos);
}

export async function operacionRepetida(
  tx: Ejecutor,
  operationId: string,
  actorId: string,
  targetId: string,
  action: string,
  reason: string,
  changes?: Record<string, string | number | boolean | null>,
) {
  const [evento] = await tx.select().from(adminEvents).where(eq(adminEvents.operationId, operationId));
  if (!evento) return false;
  if (evento.actorId !== actorId || evento.targetId !== targetId || evento.action !== action)
    throw new Error("Esta operación ya pertenece a otra solicitud.");
  if (evento.reason !== reason || (changes && serializarCambios(evento.changes) !== serializarCambios(changes)))
    throw new Error("Esta operación ya se completó con otros valores. Recarga antes de cambiarla.");
  return true;
}
