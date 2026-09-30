import { sql } from "drizzle-orm";
import type { MiPublicacionVista } from "@/lib/comunidad";
import { db } from "../db/cliente";
import type { Actor } from "../media/servicio";
import { misPublicaciones } from "./consulta";
import { logrosDe } from "./logros";

/**
 * Exportación de lo tuyo en la comunidad: tus publicaciones en cualquier estado (con el motivo de un rechazo y sin
 * claves del almacenamiento: los archivos se enlazan por su ruta) y tus logros. Nada de otras cuentas.
 */
export async function exportarMiComunidad(actor: Actor) {
  const [publicaciones, logros] = await Promise.all([misPublicaciones(actor), logrosDe(actor.id)]);
  return {
    esquema: "escenara.comunidad",
    version: 1,
    exportadoEl: new Date().toISOString(),
    publicaciones,
    logros: logros
      .filter((l) => l.conseguidoEl !== null)
      .map(({ clave, titulo, conseguidoEl }) => ({ clave, titulo, conseguidoEl })),
  };
}

/**
 * Tus publicaciones que salen de un proyecto (para su ZIP de «Tus datos»): las de archivos generados en sus escenas y
 * las de los personajes que salen en él. En cualquier estado y con el motivo de un rechazo; nunca las de otra cuenta.
 */
export async function publicacionesDelProyecto(usuarioId: string, proyectoId: string): Promise<MiPublicacionVista[]> {
  const ids = (await db().execute(sql`
    select cp.id from community_posts cp
    where cp.author_id = ${usuarioId}
      and (cp.source_media_id in (select j.result_media_id from generation_jobs j
                                  where j.project_id = ${proyectoId}
                                     or j.scene_id in (select s.id from scenes s where s.project_id = ${proyectoId}))
           or cp.source_character_id in (select p.main_character_id from projects p where p.id = ${proyectoId}
                                         union select sc.character_id from scene_characters sc
                                         join scenes s on s.id = sc.scene_id where s.project_id = ${proyectoId}))
  `)) as unknown as { id: string }[];
  if (ids.length === 0) return [];
  const deLaCuenta = new Set(ids.map((f) => f.id));
  return (await misPublicaciones({ id: usuarioId, esAdmin: false })).filter((p) => deLaCuenta.has(p.id));
}
