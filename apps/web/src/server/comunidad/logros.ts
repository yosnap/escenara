import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { type ClaveLogro, esClaveLogro, LOGROS, type LogroVista } from "@/lib/comunidad";
import { db } from "../db/cliente";
import { userAchievements } from "../db/esquema";

/**
 * Logros por **hitos reales**, sin rachas ni presión (decisión del propietario, 2026-09-30). Cada uno sale de un hecho que
 * ya está en la base de datos, con la fecha de ese hecho, y se concede **una sola vez** (clave primaria usuario y
 * logro, `on conflict do nothing`): reconocerlo dos veces, o a la vez desde dos pestañas, no lo duplica.
 *
 * Se reconocen al abrir la comunidad, y la primera publicación aprobada también al aprobarla. Un logro ya concedido no
 * se retira aunque el hecho desaparezca después (borrar el personaje no «desconsigue» haberlo creado).
 */

/** Primera fecha del hito, por logro, para una cuenta. Solo hechos reales: filas que existen, nada contado a mano. */
const HITOS: Record<ClaveLogro, (usuarioId: string) => ReturnType<typeof sql>> = {
  primer_personaje: (u) => sql`select min(created_at) from characters where owner_id = ${u}`,
  primera_escena_aprobada: (u) =>
    sql`select min(s.approved_at) from scenes s join projects p on p.id = s.project_id
        where p.user_id = ${u} and s.approved_at is not null`,
  primera_exportacion: (u) =>
    sql`select min(f) from (
          select coalesce(e.finished_at, e.created_at) as f from montage_exports e join projects p on p.id = e.project_id
          where p.user_id = ${u} and e.state = 'listo'
          union all
          select coalesce(x.finished_at, x.created_at) from project_exports x
          where x.user_id = ${u} and x.state in ('lista', 'caducada')) h`,
  primera_publicacion_aprobada: (u) =>
    sql`select min(approved_at) from community_posts where author_id = ${u} and approved_at is not null`,
};

/** Concede los logros cuyo hito ya ha ocurrido. Idempotente. */
export async function reconocerLogros(usuarioId: string): Promise<void> {
  for (const logro of LOGROS) {
    await db().execute(sql`
      insert into user_achievements (user_id, achievement, achieved_at)
      select ${usuarioId}, ${logro.clave}, fecha from (${HITOS[logro.clave](usuarioId)}) as h(fecha)
      where fecha is not null
      on conflict do nothing`);
  }
}

/** Todos los logros con si están conseguidos, cuándo y si falta celebrarlos. */
export async function logrosDe(usuarioId: string): Promise<LogroVista[]> {
  const filas = await db().select().from(userAchievements).where(eq(userAchievements.userId, usuarioId));
  const porClave = new Map(filas.map((f) => [f.achievement, f]));
  return LOGROS.map((l) => {
    const f = porClave.get(l.clave);
    return {
      clave: l.clave,
      titulo: l.titulo,
      descripcion: l.descripcion,
      conseguidoEl: f ? f.achievedAt.toISOString() : null,
      porCelebrar: Boolean(f && f.celebratedAt === null),
    };
  });
}

/** Marca como celebrados (el confeti ya salió). Solo los propios; claves desconocidas se ignoran. */
export async function marcarCelebrados(usuarioId: string, claves: unknown): Promise<void> {
  const validas = Array.isArray(claves) ? claves.filter(esClaveLogro) : [];
  if (validas.length === 0) return;
  await db()
    .update(userAchievements)
    .set({ celebratedAt: new Date() })
    .where(
      and(
        eq(userAchievements.userId, usuarioId),
        inArray(userAchievements.achievement, validas),
        isNull(userAchievements.celebratedAt),
      ),
    );
}
