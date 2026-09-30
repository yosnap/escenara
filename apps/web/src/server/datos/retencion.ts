import { sql } from "drizzle-orm";
import type { Ejecutor } from "../db/cliente";

/**
 * Lo único que sobrevive al borrado de una cuenta, escrito **dentro de la misma transacción** que la borra: si algo
 * falla, no queda ni el agregado ni la prueba a medias, y el reintento vuelve a empezar sin contar dos veces.
 *
 * - **Gasto agregado** (`usage_aggregates`): la suma por mes, proveedor, modelo y tipo de apunte. Sin cuenta, sin
 *   trabajo, sin nota y sin fecha exacta: sirve para cuadrar el gasto de la instalación, no para saber de nadie.
 * - **Prueba mínima de consentimientos y declaraciones** (`consent_evidence`): tipo, alcance, versión del texto,
 *   casillas declaradas y fechas. Sin nombres (ni del personaje, ni del lugar, ni de la canción), sin fotos ni
 *   documentos, sin IP y sin cuenta. Donde lo guardado era el texto aceptado entero, queda su huella SHA-256.
 *
 * Decisión provisional, **pendiente de revisión jurídica** (ver `docs/legal/cumplimiento-y-privacidad.md`).
 */

const ZONA = "Europe/Madrid";

/** Suma el gasto de la cuenta al agregado de la instalación. Devuelve cuántos apuntes se han agregado. */
export async function agregarGastoDeCuenta(tx: Ejecutor, usuarioId: string): Promise<number> {
  const [cuenta] = (await tx.execute<{ total: number }>(
    sql`select count(*)::int as total from usage_ledger where user_id = ${usuarioId}`,
  )) as unknown as { total: number }[];
  await tx.execute(sql`
    insert into usage_aggregates (month, provider, provider_name, model, entry_type, credits, amount_eur, entries,
                                  unconfirmed_credits)
    select date_trunc('month', l.created_at at time zone ${ZONA})::date, l.provider,
           -- El nombre de un servicio compatible lo escribe el usuario («la clave de Ana»): no sobrevive a la cuenta.
           case when l.provider = 'compatible' then '' else l.provider_name end, l.model,
           l.entry_type, sum(l.credits), sum(coalesce(l.amount_eur, 0)), count(*),
           -- Consumos que el proveedor no confirmó (estimados): se distinguen del gasto confirmado.
           sum(case when l.entry_type = 'consumo' and not l.informed then l.credits else 0 end)
    from usage_ledger l where l.user_id = ${usuarioId}
    group by 1, 2, 3, 4, 5
    on conflict (month, provider, provider_name, model, entry_type) do update set
      credits = usage_aggregates.credits + excluded.credits,
      amount_eur = usage_aggregates.amount_eur + excluded.amount_eur,
      entries = usage_aggregates.entries + excluded.entries,
      unconfirmed_credits = usage_aggregates.unconfirmed_credits + excluded.unconfirmed_credits,
      updated_at = now()
  `);
  return Number(cuenta?.total ?? 0);
}

/**
 * Copia la prueba anónima de cada consentimiento y declaración de la cuenta y **borra las declaraciones de lugar**, que
 * no caen solas con la cuenta (se conservan con `set null` al borrar un lugar). Las demás caen en cascada después.
 */
export async function archivarPruebasDeCuenta(tx: Ejecutor, usuarioId: string): Promise<number> {
  const filas = (await tx.execute<{ total: number }>(sql`
    with personajes as (
      insert into consent_evidence (kind, scope, text_version, declared, declared_at, revoked_at)
      select 'personaje', c.holder_type::text || ':' || c.usage_scope::text, '',
             jsonb_build_object('mayorDeEdad', c.adult_declared, 'sintetico', c.synthetic_declared,
                                'coherencia', c.coherence_declared, 'conDocumento', c.document_media_id is not null,
                                'revisadoYAprobado', coalesce(c.review_approved, false)),
             c.registered_at, c.revoked_at
      from consent_records c join characters ch on ch.id = c.character_id
      where ch.owner_id = ${usuarioId}
      returning 1
    ), lugares as (
      insert into consent_evidence (kind, scope, text_version, declared, declared_at, revoked_at)
      select 'lugar', d.space::text || ':' || d.scope::text || ':' || d.photo_origin::text, d.text_version,
             jsonb_build_object('permisoDelSitio', d.place_permission, 'sinMenores', d.no_minors_declared,
                                'marcasVisibles', d.brands_visible, 'personas', d.people_visible::text <> 'ninguna'),
             d.declared_at, d.revoked_at
      from place_declarations d
      where d.declared_by = ${usuarioId}
         or d.place_id in (select id from places where owner_id = ${usuarioId})
      returning 1
    ), musica as (
      insert into consent_evidence (kind, scope, text_version, declared, declared_at, revoked_at)
      select 'musica', m.kind::text, 'sha256:' || encode(sha256(convert_to(m.accepted_text, 'UTF8')), 'hex'),
             jsonb_build_object('conLicencia', m.license_reference <> ''), m.accepted_at, null
      from music_rights_declarations m where m.user_id = ${usuarioId}
      returning 1
    ), afirmaciones as (
      insert into consent_evidence (kind, scope, text_version, declared, declared_at, revoked_at)
      select 'afirmacion', a.angle_preset_key, 'sha256:' || encode(sha256(convert_to(a.accepted_text, 'UTF8')), 'hex'),
             '{}'::jsonb, a.accepted_at, null
      from sensitive_claim_declarations a join projects p on p.id = a.project_id
      where p.user_id = ${usuarioId}
      returning 1
    ), sin_lugar as (
      delete from place_declarations d
      where d.declared_by = ${usuarioId}
         or d.place_id in (select id from places where owner_id = ${usuarioId})
      returning 1
    )
    select ((select count(*) from personajes) + (select count(*) from lugares) + (select count(*) from musica)
            + (select count(*) from afirmaciones))::int as total, (select count(*) from sin_lugar) as borradas
  `)) as unknown as { total: number }[];
  return Number(filas[0]?.total ?? 0);
}
