import { sql } from "drizzle-orm";
import { type CausaFalloProveedor, etiquetaDelFallo } from "@/lib/causa-fallo";
import type { MotivoFallo } from "@/lib/generacion";
import { db } from "../db/cliente";

/**
 * Historial de una cuenta o de un proyecto: cronología de trabajos, revisiones, montajes y exportaciones, y gasto
 * por mes (y por proyecto). **Solo lee** lo que ya está guardado, siempre acotado por el dueño en la propia consulta,
 * y pagina en la base de datos: nunca se carga el historial entero en memoria.
 *
 * Lo que no sale nunca: el texto libre del proveedor (`error_message` de un trabajo), el prompt y los identificadores
 * de tareas. Un fallo se cuenta con su causa concreta (`lib/causa-fallo`), igual que en «Crear».
 */

export const TIPOS_EVENTO = ["trabajo", "revision", "montaje", "exportacion"] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];
export const POR_PAGINA_HISTORIAL = 30;
const ZONA = "Europe/Madrid";

export interface EventoHistorial {
  tipo: TipoEvento;
  id: string;
  fecha: string;
  proyectoId: string | null;
  proyectoTitulo: string | null;
  estado: string;
  /** Qué era: tipo de trabajo, de revisión o formato del montaje. */
  clase: string;
  proveedor: string | null;
  modelo: string | null;
  creditosEstimados: number | null;
  creditosConsumidos: number | null;
  /** Causa concreta del fallo, apta para mostrar; `null` si no falló. */
  fallo: string | null;
  /** Medio resultante, para enlazarlo (el enlace comprueba el dueño otra vez). */
  resultadoId: string | null;
}

export interface FiltroHistorial {
  tipo: TipoEvento | null;
  /** `AAAA-MM`, en hora de Madrid. */
  mes: string | null;
  proyectoId: string | null;
  pagina: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Filtro a partir de los parámetros de la URL. Lo que no es válido se ignora: nunca se interpola nada. */
export function filtroDeLaUrl(parametros: Record<string, string | string[] | undefined>): FiltroHistorial {
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const tipo = uno(parametros.tipo);
  const mes = uno(parametros.mes);
  const proyecto = uno(parametros.proyecto);
  const pagina = Number.parseInt(uno(parametros.pagina), 10);
  return {
    tipo: (TIPOS_EVENTO as readonly string[]).includes(tipo) ? (tipo as TipoEvento) : null,
    mes: /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : null,
    proyectoId: UUID.test(proyecto) ? proyecto : null,
    pagina: Number.isInteger(pagina) && pagina >= 1 && pagina <= 10_000 ? pagina : 1,
  };
}

interface FilaEvento extends Record<string, unknown> {
  tipo: TipoEvento;
  id: string;
  fecha: Date | string;
  proyecto_id: string | null;
  proyecto_titulo: string | null;
  estado: string;
  clase: string;
  proveedor: string | null;
  modelo: string | null;
  estimados: number | null;
  consumidos: number | null;
  motivo: string | null;
  causa: string | null;
  mensaje: string | null;
  resultado_id: string | null;
}

/**
 * Una página del historial de `usuarioId`. Con `filtro.proyectoId`, solo lo de ese proyecto (que tiene que ser suyo:
 * cada rama de la unión cruza con `projects.user_id`, así que un proyecto ajeno sale vacío, no con datos de otro).
 */
export async function historialDe(
  usuarioId: string,
  filtro: FiltroHistorial,
): Promise<{ eventos: EventoHistorial[]; pagina: number; hayMas: boolean }> {
  const proyecto = filtro.proyectoId;
  const soloTrabajosDeProyecto = proyecto ? sql`and s.project_id = ${proyecto}` : sql``;
  const soloProyecto = proyecto ? sql`and p.id = ${proyecto}` : sql``;
  const tipo = (t: TipoEvento) => filtro.tipo === null || filtro.tipo === t;
  const ramas = [
    tipo("trabajo") &&
      sql`select 'trabajo' as tipo, j.id, j.created_at as fecha, p.id as proyecto_id, p.title as proyecto_titulo,
            j.state::text as estado, j.kind::text as clase, j.provider::text as proveedor, j.model as modelo,
            j.estimated_credits::float8 as estimados, j.consumed_credits::float8 as consumidos,
            j.failure_reason::text as motivo, j.failure_cause as causa, null::text as mensaje,
            j.result_media_id as resultado_id
          from generation_jobs j
          left join scenes s on s.id = j.scene_id
          left join projects p on p.id = s.project_id and p.user_id = ${usuarioId}
          where j.user_id = ${usuarioId} ${soloTrabajosDeProyecto}`,
    tipo("revision") &&
      sql`select 'revision', r.id, r.created_at, p.id, p.title, r.verdict::text, r.kind::text, null, null,
            null, r.credits::float8, null, null, null, null
          from review_results r
          join scenes s on s.id = r.scene_id
          join projects p on p.id = s.project_id
          where p.user_id = ${usuarioId} ${soloProyecto}`,
    tipo("montaje") &&
      sql`select 'montaje', x.id, x.created_at, p.id, p.title, x.state::text, x.format::text, null, null,
            null, null, null, null, nullif(x.error_message, ''), x.result_media_id
          from montage_exports x
          join projects p on p.id = x.project_id
          where p.user_id = ${usuarioId} ${soloProyecto}`,
    tipo("exportacion") &&
      sql`select 'exportacion', e.id, e.created_at, p.id, p.title, e.state::text, 'zip', null, null,
            null, null, null, null, nullif(e.error_message, ''), null
          from project_exports e
          join projects p on p.id = e.project_id
          where e.user_id = ${usuarioId} and p.user_id = ${usuarioId} ${soloProyecto}`,
  ].filter((r): r is ReturnType<typeof sql> => r !== false);
  if (ramas.length === 0) return { eventos: [], pagina: filtro.pagina, hayMas: false };

  const union = sql.join(ramas, sql` union all `);
  const mes = filtro.mes ? sql`where to_char(fecha at time zone ${ZONA}, 'YYYY-MM') = ${filtro.mes}` : sql``;
  const desde = (filtro.pagina - 1) * POR_PAGINA_HISTORIAL;
  const filas = (await db().execute<FilaEvento>(sql`
    select * from (${union}) eventos ${mes}
    order by fecha desc, id desc
    limit ${POR_PAGINA_HISTORIAL + 1} offset ${desde}
  `)) as unknown as FilaEvento[];

  const eventos = filas.slice(0, POR_PAGINA_HISTORIAL).map(
    (f): EventoHistorial => ({
      tipo: f.tipo,
      id: f.id,
      fecha: new Date(f.fecha).toISOString(),
      proyectoId: f.proyecto_id,
      proyectoTitulo: f.proyecto_titulo,
      estado: f.estado,
      clase: f.clase,
      proveedor: f.proveedor,
      modelo: f.modelo,
      creditosEstimados: f.estimados,
      creditosConsumidos: f.consumidos,
      fallo:
        f.tipo === "trabajo" && f.motivo
          ? etiquetaDelFallo(f.motivo as MotivoFallo, (f.causa as CausaFalloProveedor | null) ?? null)
          : f.mensaje,
      resultadoId: f.resultado_id,
    }),
  );
  return { eventos, pagina: filtro.pagina, hayMas: filas.length > POR_PAGINA_HISTORIAL };
}

export interface GastoMensual {
  mes: string;
  proyectoId: string | null;
  proyectoTitulo: string | null;
  estimado: number;
  consumido: number;
  euros: number;
}

/**
 * Gasto de la cuenta por mes y por proyecto (o solo de un proyecto). **Estimado** es lo que se reservó al pedir;
 * **consumido**, lo que costó de verdad (consumos y ajustes). El gasto de «Crear», sin proyecto, va aparte.
 */
export async function gastoPorMes(
  usuarioId: string,
  proyectoId: string | null = null,
  meses = 24,
): Promise<GastoMensual[]> {
  const soloProyecto = proyectoId
    ? sql`and coalesce(sj.project_id, ar.project_id, sr.project_id) = ${proyectoId}`
    : sql``;
  const filas = (await db().execute<Record<string, unknown>>(sql`
    select to_char(l.created_at at time zone ${ZONA}, 'YYYY-MM') as mes,
           p.id as proyecto_id, p.title as proyecto_titulo,
           coalesce(sum(case when l.entry_type = 'reserva' then l.credits else 0 end), 0)::float8 as estimado,
           coalesce(sum(case when l.entry_type in ('consumo', 'ajuste') then l.credits else 0 end), 0)::float8 as consumido,
           coalesce(sum(case when l.entry_type in ('consumo', 'ajuste') then coalesce(l.amount_eur, 0) else 0 end), 0)::float8 as euros
    from usage_ledger l
    left join generation_jobs j on j.id = l.job_id
    left join scenes sj on sj.id = j.scene_id
    left join assistant_runs ar on ar.id = l.assistant_run_id
    left join review_results rr on rr.id = l.review_id
    left join scenes sr on sr.id = rr.scene_id
    left join projects p on p.id = coalesce(sj.project_id, ar.project_id, sr.project_id) and p.user_id = ${usuarioId}
    where l.user_id = ${usuarioId} ${soloProyecto}
    group by 1, 2, 3
    order by 1 desc, 3 asc nulls last
    limit ${meses * 40}
  `)) as unknown as Record<string, unknown>[];
  return filas.map((f) => ({
    mes: String(f.mes),
    proyectoId: (f.proyecto_id as string | null) ?? null,
    proyectoTitulo: (f.proyecto_titulo as string | null) ?? null,
    estimado: Number(f.estimado),
    consumido: Number(f.consumido),
    euros: Number(f.euros),
  }));
}

/** Totales de un proyecto, para `proyecto.json` y la cabecera de su historial. */
export async function gastoDelProyecto(proyectoId: string): Promise<{ estimado: number; consumido: number }> {
  const [fila] = (await db().execute<Record<string, unknown>>(sql`
    select coalesce(sum(case when l.entry_type = 'reserva' then l.credits else 0 end), 0)::float8 as estimado,
           coalesce(sum(case when l.entry_type in ('consumo', 'ajuste') then l.credits else 0 end), 0)::float8 as consumido
    from usage_ledger l
    left join generation_jobs j on j.id = l.job_id
    left join scenes sj on sj.id = j.scene_id
    left join assistant_runs ar on ar.id = l.assistant_run_id
    left join review_results rr on rr.id = l.review_id
    left join scenes sr on sr.id = rr.scene_id
    where coalesce(sj.project_id, ar.project_id, sr.project_id) = ${proyectoId}
  `)) as unknown as Record<string, unknown>[];
  return { estimado: Number(fila?.estimado ?? 0), consumido: Number(fila?.consumido ?? 0) };
}
