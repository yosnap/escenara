import { sql } from "drizzle-orm";
import { db } from "../db/cliente";
import { intervalo, opcion, PAGINA_ADMIN, type Parametros, pagina } from "./filtros";
import { exigirLecturaAdmin } from "./usuarios";

export async function comunidadAdmin(actor: string, filtros: Parametros) {
  await exigirLecturaAdmin(actor);
  const { inicio, fin } = intervalo(filtros);
  const estado = opcion(filtros, "estado", ["pendiente", "aprobada", "rechazada"]);
  const actual = pagina(filtros);
  const where = sql`created_at >= ${inicio} and created_at < ${fin} and (${estado} = '' or state::text = ${estado})`;
  const [filas, totales] = await Promise.all([
    db().execute<{ id: string; title: string; state: string; author_id: string; created_at: Date }>(
      sql`select id, title, state::text, author_id, created_at from community_posts where ${where} order by created_at desc, id desc limit ${PAGINA_ADMIN} offset ${(actual - 1) * PAGINA_ADMIN}`,
    ),
    db().execute<{ n: number; autores: number }>(
      sql`select count(*)::int n, count(distinct author_id)::int autores from community_posts where ${where}`,
    ),
  ]);
  return { filas, total: totales[0]?.n ?? 0, autores: totales[0]?.autores ?? 0, pagina: actual, inicio, fin };
}
