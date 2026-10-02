import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { exigirCuentaOperativa } from "../auth/estado-cuenta";
import { db } from "../db/cliente";
import { adminEvents, adminMailEvents, userPolicies, users } from "../db/esquema";
import { intervalo, opcion, PAGINA_ADMIN, type Parametros, pagina, texto } from "./filtros";

export async function exigirLecturaAdmin(actorId: string) {
  const [actor] = await db().select({ role: users.role }).from(users).where(eq(users.id, actorId));
  if (actor?.role !== "admin") throw new Error("Acceso administrativo requerido.");
  await exigirCuentaOperativa(actorId, db());
}

const borrado = sql<boolean>`exists(select 1 from account_deletions d where d.user_id = users.id and d.state in ('programado', 'borrando_objetos'))`;
const eliminado = sql<boolean>`exists(select 1 from admin_user_trash t where t.user_id = users.id)`;
const columnas = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  createdAt: users.createdAt,
  emailVerified: users.emailVerified,
  banned: users.banned,
  borrado,
  eliminado,
  definitivo: sql<boolean>`exists(select 1 from admin_user_trash t where t.user_id = users.id and t.permanent_requested_at is not null)`,
  elegibleEn: sql<Date | null>`(select eligible_at from admin_user_trash t where t.user_id = users.id)`,
};

export async function listarUsuarios(actorId: string, p: Parametros) {
  await exigirLecturaAdmin(actorId);
  const busqueda = texto(p, "q");
  const rol = opcion(p, "rol", ["user", "admin"]);
  const verificado = opcion(p, "verificado", ["si", "no"]);
  const bloqueo = opcion(p, "bloqueado", ["si", "no"]);
  const borrando = opcion(p, "borrado", ["si", "no"]);
  const papelera = opcion(p, "papelera", ["si", "no", "todos"]);
  const actual = pagina(p);
  const fechas = p.desde || p.hasta ? intervalo(p) : null;
  const patron = `%${busqueda.replace(/[\\%_]/g, "\\$&")}%`;
  const filtros = and(
    busqueda ? or(ilike(users.name, patron), ilike(users.email, patron)) : undefined,
    rol ? eq(users.role, rol) : undefined,
    verificado ? eq(users.emailVerified, verificado === "si") : undefined,
    bloqueo ? sql`coalesce(${users.banned}, false) = ${bloqueo === "si"}` : undefined,
    borrando ? sql`${borrado} = ${borrando === "si"}` : undefined,
    fechas ? sql`${users.createdAt} >= ${fechas.inicio} and ${users.createdAt} < ${fechas.fin}` : undefined,
  );
  const where = and(filtros, papelera === "todos" ? undefined : sql`${eliminado} = ${papelera === "si"}`);
  const [filas, [cuentas]] = await Promise.all([
    db()
      .select(columnas)
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(PAGINA_ADMIN)
      .offset((actual - 1) * PAGINA_ADMIN),
    db()
      .select({
        activos: sql<number>`count(*) filter(where not (${eliminado}))::int`,
        eliminados: sql<number>`count(*) filter(where ${eliminado})::int`,
        todos: count(),
      })
      .from(users)
      .where(filtros),
  ]);
  const contadores = cuentas ?? { activos: 0, eliminados: 0, todos: 0 };
  const total =
    papelera === "todos" ? contadores.todos : papelera === "si" ? contadores.eliminados : contadores.activos;
  return { filas, total, pagina: actual, contadores };
}

export async function fichaUsuario(actorId: string, id: string) {
  await exigirLecturaAdmin(actorId);
  const [usuario] = await db().select(columnas).from(users).where(eq(users.id, id));
  if (!usuario) return null;
  const [eventos, correos, [politica], plazos] = await Promise.all([
    db()
      .select({
        id: adminEvents.id,
        action: adminEvents.action,
        reason: adminEvents.reason,
        result: adminEvents.result,
        actorId: adminEvents.actorId,
        changes: adminEvents.changes,
        createdAt: adminEvents.createdAt,
      })
      .from(adminEvents)
      .where(eq(adminEvents.targetId, id))
      .orderBy(desc(adminEvents.createdAt), desc(adminEvents.id))
      .limit(50),
    db()
      .select({ id: adminMailEvents.id, state: adminMailEvents.state, createdAt: adminMailEvents.createdAt })
      .from(adminMailEvents)
      .where(eq(adminMailEvents.userId, id))
      .orderBy(desc(adminMailEvents.createdAt))
      .limit(25),
    db().select().from(userPolicies).where(eq(userPolicies.userId, id)),
    db().execute(
      sql`select scheduled_for from account_deletions where user_id = ${id}::uuid and state in ('programado', 'borrando_objetos') limit 1`,
    ),
  ]);
  return { usuario, eventos, correos, politica, plazo: plazos[0]?.scheduled_for ?? null };
}
