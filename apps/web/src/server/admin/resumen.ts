import { sql } from "drizzle-orm";
import { db } from "../db/cliente";
import { consultarConsumo } from "./consumo";
import { intervalo, type Parametros } from "./filtros";
import { exigirLecturaAdmin } from "./usuarios";

export async function resumenAdmin(actor: string, filtros: Parametros) {
  await exigirLecturaAdmin(actor);
  const { inicio, fin } = intervalo(filtros);
  const bloques = await Promise.allSettled([
    db().execute<{ total: number; nuevos: number; pendientes: number; bloqueados: number }>(
      sql`select count(*)::int total, count(*) filter(where created_at >= ${inicio} and created_at < ${fin})::int nuevos, count(*) filter(where not email_verified)::int pendientes, count(*) filter(where banned)::int bloqueados from users`,
    ),
    db().execute<{ estado: string; n: number }>(
      sql`select state::text estado, count(*)::int n from generation_jobs where created_at >= ${inicio} and created_at < ${fin} group by state order by state`,
    ),
    db().execute<{ estado: string; n: number; autores: number }>(
      sql`select state::text estado, count(*)::int n, count(distinct author_id)::int autores from community_posts where created_at >= ${inicio} and created_at < ${fin} group by state order by state`,
    ),
    consultarConsumo(actor, filtros),
    db().execute<{ trabajos: number; textos: number; revisiones: number; workers: number }>(sql`select
      (select count(*)::int from generation_jobs where state = 'desconocido') trabajos,
      (select count(*)::int from assistant_runs where state = 'reservado') textos,
      (select count(*)::int from review_results where state = 'reservado') revisiones,
      (select count(*)::int from queue_workers where seen_at > now() - interval '2 minutes') workers`),
  ]);
  return { inicio, fin, bloques };
}
