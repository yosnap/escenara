import { type SQL, sql } from "drizzle-orm";
import { leerAjustes } from "../ajustes";
import type { FilaPublicacion } from "../db/esquema";
import type { Actor } from "../media/servicio";

/**
 * **Quién ve qué: el único punto de verdad del estado público de una publicación.**
 *
 * Una publicación la ven los demás solo si: la comunidad está encendida, está **aprobada**, su original sigue existiendo
 * y no está en la papelera (si se borró, queda huérfana y el worker la barre), el personaje inventado del que sale
 * mantiene su declaración vigente **desde antes de la aprobación** (revocarla la oculta para siempre: la aplicación no
 * deja volver a declarar un inventado, y la fecha es solo una salvaguarda) y su autor no tiene la cuenta en periodo de borrado. Su autor la ve
 * siempre (para saber su estado y el motivo de un rechazo) y quien administra también (para moderarla).
 */
export function condicionVisible(): SQL {
  // Columnas calificadas a mano: también se usa en los campos de un `select`, donde Drizzle las escribiría a secas.
  return sql.raw(`("community_posts"."state" = 'aprobada'
    and ("community_posts"."source_character_id" is not null or "community_posts"."source_media_id" is not null)
    and not exists (select 1 from media mpv where mpv.id = "community_posts"."source_media_id" and mpv.deleted_at is not null)
    and exists (select 1 from consent_records crv where crv.character_id = "community_posts"."origin_character_id"
                and crv.revoked_at is null and crv.holder_type = 'inventado' and crv.synthetic_declared = true
                and crv.registered_at <= "community_posts"."approved_at")
    and not exists (select 1 from account_deletions adv where adv.user_id = "community_posts"."author_id"
                    and adv.state in ('programado', 'borrando_objetos')))`);
}

/** El original ya no existe: la publicación no se enseña y la pasada del worker la borra con su copia. */
export const esHuerfana = (p: Pick<FilaPublicacion, "sourceCharacterId" | "sourceMediaId" | "originCharacterId">) =>
  (p.sourceCharacterId === null && p.sourceMediaId === null) || p.originCharacterId === null;

/** `true` si la comunidad está encendida en la instalación. */
export async function comunidadActiva(): Promise<boolean> {
  return (await leerAjustes()).comunidadActiva;
}

/**
 * ¿Puede `actor` ver esta publicación (y sus medios)? `visibleAhora` es el resultado de {@link condicionVisible} para
 * esa fila, calculado en la misma consulta que la leyó.
 */
export async function puedeVer(actor: Actor, publicacion: FilaPublicacion, visibleAhora: boolean): Promise<boolean> {
  if (publicacion.authorId === actor.id || actor.esAdmin) return true;
  return visibleAhora && (await comunidadActiva());
}
