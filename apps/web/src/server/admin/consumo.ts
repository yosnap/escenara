import { sql } from "drizzle-orm";
import { db } from "../db/cliente";
import { intervalo, opcion, PAGINA_ADMIN, type Parametros, pagina, texto, usuarioFiltro } from "./filtros";
import { exigirLecturaAdmin } from "./usuarios";

export async function consultarConsumo(actorId: string, p: Parametros) {
  await exigirLecturaAdmin(actorId);
  const { inicio, fin } = intervalo(p);
  const usuario = usuarioFiltro(p);
  const proveedor = opcion(p, "proveedor", ["kie", "google", "elevenlabs", "compatible", "local"]);
  const tipo = opcion(p, "tipo", ["generacion", "asistente", "traduccion", "revision"]);
  const estado = opcion(p, "estado", [
    "preparando",
    "en_cola",
    "enviando",
    "enviado",
    "en_curso",
    "listo",
    "fallido",
    "desconocido",
    "esperando_limite",
    "cancelado",
    "reservado",
    "cerrado",
  ]);
  const actual = pagina(p);
  // UNION cuenta entidades reales; ledger no multiplica el número de llamadas.
  const trabajos = sql`with llamadas as (
    select id, user_id, 'generacion'::text tipo, kind::text subtipo, provider::text proveedor, model modelo, state::text estado, created_at fecha from generation_jobs
    union all select id, user_id, case when kind = 'traduccion' then 'traduccion' else 'asistente' end, kind::text, provider::text, model, state::text, created_at from assistant_runs
    union all select r.id, r.reviewer_id, 'revision', r.kind::text, l.provider::text, l.model, r.state::text, r.created_at from review_results r join usage_ledger l on l.review_id = r.id and l.entry_type = 'reserva' where r.kind = 'multimodal'
  ), filtradas as (select * from llamadas where fecha >= ${inicio} and fecha < ${fin}
    and (${usuario} = '' or user_id::text = ${usuario}) and (${proveedor} = '' or proveedor = ${proveedor})
    and (${tipo} = '' or tipo = ${tipo}) and (${estado} = '' or estado = ${estado}))`;
  const [filas, totales, agregados] = await Promise.all([
    db().execute<{
      id: string;
      user_id: string;
      tipo: string;
      subtipo: string;
      proveedor: string;
      modelo: string;
      estado: string;
      fecha: Date;
    }>(
      sql`${trabajos} select * from filtradas order by fecha desc, id desc limit ${PAGINA_ADMIN} offset ${(actual - 1) * PAGINA_ADMIN}`,
    ),
    db().execute<{ n: number }>(sql`${trabajos} select count(*)::int n from filtradas`),
    db().execute<{
      proveedor: string;
      nombre: string;
      tipo: string;
      reservado: number;
      retenido: number;
      consumido: number;
      euros: number | null;
      sin_euros: number;
      informado: number;
      estimado: number;
    }>(sql`
      select l.provider::text proveedor, l.provider_name nombre,
        case when l.job_id is not null then 'generacion' when l.review_id is not null then 'revision' when a.kind = 'traduccion' then 'traduccion' when a.id is not null then 'asistente' when l.entry_type = 'ajuste' then 'ajuste' else 'sin-referencia' end tipo,
        sum(case when entry_type in ('reserva','liberacion') then l.credits else 0 end)::float8 reservado,
        sum(case when entry_type in ('reserva','liberacion') and (j.state = 'desconocido' or a.state = 'reservado' or r.state = 'reservado') then l.credits else 0 end)::float8 retenido,
        sum(case when entry_type in ('consumo','ajuste') then l.credits else 0 end)::float8 consumido,
        sum(case when entry_type in ('consumo','ajuste') then amount_eur end)::float8 euros,
        count(*) filter(where entry_type in ('consumo','ajuste') and amount_eur is null)::int sin_euros,
        sum(case when entry_type in ('consumo','ajuste') and informed then l.credits else 0 end)::float8 informado,
        sum(case when entry_type in ('consumo','ajuste') and not informed then l.credits else 0 end)::float8 estimado
      from usage_ledger l left join generation_jobs j on j.id = l.job_id left join assistant_runs a on a.id = l.assistant_run_id left join review_results r on r.id = l.review_id
      where l.created_at >= ${inicio} and l.created_at < ${fin} and (${usuario} = '' or l.user_id::text = ${usuario}) and (${proveedor} = '' or l.provider::text = ${proveedor})
        and (${tipo} = '' or case when l.job_id is not null then 'generacion' when l.review_id is not null then 'revision' when a.kind = 'traduccion' then 'traduccion' when a.id is not null then 'asistente' when l.entry_type = 'ajuste' then 'ajuste' else 'sin-referencia' end = ${tipo})
        and (${estado} = '' or coalesce(j.state::text, a.state::text, r.state::text) = ${estado})
      group by 1,2,3 order by 1,2,3
    `),
  ]);
  // El intervalo mide movimientos del periodo: no presentarlos como saldo actual del usuario.
  return {
    filas,
    total: totales[0]?.n ?? 0,
    agregados,
    pagina: actual,
    inicio,
    fin,
    filtroUsuario: texto(p, "usuario"),
  };
}
