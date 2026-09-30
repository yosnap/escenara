import { sql } from "drizzle-orm";
import type { EslabonProcedencia } from "@/lib/comunidad";
import type { Ejecutor } from "../db/cliente";
import { mediosEnviados, productorSintetico } from "../prompts/demos";

/**
 * **Procedencia** de lo que se publica, para **explicar** (el motivo de un «no» y la cola de moderación): cada medio que
 * se envió al proveedor para generarlo, paso a paso hacia atrás, con su origen. Decide la regla de `demos.ts`; esto
 * solo la enseña, con las mismas piezas (`mediosEnviados`, `productorSintetico`).
 */

interface FilaEslabon {
  n: number;
  mid: string | null;
  tipo: string | null;
  existe: boolean;
  generado: boolean;
  seguro: boolean;
  personajes: string | null;
}

const TIPO: Record<string, string> = { imagen: "Imagen", video: "Clip", audio: "Audio" };

/** Cadena de un medio: el propio archivo (paso 0) y todo lo que se envió para generarlo, hasta cinco pasos atrás. */
export async function procedenciaDeMedio(ej: Ejecutor, medioId: string): Promise<EslabonProcedencia[]> {
  const filas = (await ej.execute(sql`
    with recursive cadena(mid, n) as (
      select ${medioId}::uuid, 0
      union
      select e2.mid, c.n + 1 from cadena c join generation_jobs jp on jp.result_media_id = c.mid
        cross join lateral ${sql.raw(mediosEnviados("jp"))} e2(mid)
      where c.mid is not null and c.n < 6)
    select min(c.n)::int as n, c.mid,
      (select m.kind::text from media m where m.id = c.mid) as tipo,
      exists (select 1 from media m where m.id = c.mid) as existe,
      exists (select 1 from generation_jobs jr where jr.result_media_id = c.mid) as generado,
      (exists (select 1 from generation_jobs jr where jr.result_media_id = c.mid)
       and not exists (select 1 from generation_jobs jx where jx.result_media_id = c.mid
                       and not ${sql.raw(productorSintetico("jx"))})) as seguro,
      (select string_agg(distinct coalesce('«' || ch.name || '»' || case when ch.virtual then ' (inventado)' else ' (no inventado)' end,
                                           'sin personaje'), ', ')
       from generation_jobs jx left join characters ch on ch.id = jx.character_id where jx.result_media_id = c.mid) as personajes
    from cadena c group by c.mid order by 1, 2`)) as unknown as FilaEslabon[];
  return filas.map((f) => {
    const que = f.n === 0 ? "Lo publicado" : `${TIPO[f.tipo ?? ""] ?? "Archivo"} enviado (paso ${f.n})`;
    if (f.mid === null)
      return { paso: f.n, descripcion: `${que}: identificador ilegible, no se puede comprobar`, seguro: false };
    if (!f.existe) return { paso: f.n, descripcion: `${que}: ya no existe, no se puede comprobar`, seguro: false };
    if (!f.generado) return { paso: f.n, descripcion: `${que}: subida (no generada aquí)`, seguro: false };
    if (!f.seguro)
      return {
        paso: f.n,
        descripcion: `${que}: generado con ${f.personajes ?? "sin personaje"}, pero no es sintético de principio a fin (persona o mascota real, producto, lugar con fotos, canto, audio subido o reparto)`,
        seguro: false,
      };
    return { paso: f.n, descripcion: `${que}: generado con ${f.personajes ?? "un lugar generado"}`, seguro: true };
  });
}

/** Referencias y retrato de un personaje, cada una con su origen real (no la etiqueta que tenga). */
export async function procedenciaDePersonaje(ej: Ejecutor, personajeId: string): Promise<EslabonProcedencia[]> {
  const filas = (await ej.execute(sql`
    select cr.origin::text as etiqueta, cr.sort_order as orden,
      exists (select 1 from generation_jobs jg where jg.result_media_id = cr.media_id and jg.character_id = cr.character_id) as generado
    from character_references cr where cr.character_id = ${personajeId}::uuid order by cr.sort_order, cr.created_at`)) as unknown as {
    etiqueta: string;
    generado: boolean;
  }[];
  if (filas.length === 0) return [{ paso: 0, descripcion: "Sin referencias guardadas", seguro: true }];
  return filas.map((f, i) => ({
    paso: i + 1,
    descripcion: f.generado
      ? `Referencia ${i + 1}: vista generada por un trabajo suyo`
      : `Referencia ${i + 1}: ${f.etiqueta === "foto_original" ? "foto original subida" : "subida etiquetada como vista generada"}`,
    seguro: f.generado,
  }));
}
