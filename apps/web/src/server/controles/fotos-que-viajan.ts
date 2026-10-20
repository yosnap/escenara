import { and, eq, inArray, isNull } from "drizzle-orm";
import type { FotosQueViajan } from "@/lib/controles";
import type { RepartoDeReferencias } from "@/lib/reparto-referencias";
import { db } from "../db/cliente";
import { media } from "../db/esquema";
import { entradaDelLugar, type LugarDelEnvio } from "../lugares/en-el-envio";
import { type Actor, aDto } from "../media/servicio";
import { referenciasDeProductoGuardadas } from "../productos/referencias";
import { type EnvioConProducto, fotosDelPersonajeEnElEnvio } from "../productos/reparto-del-envio";

/**
 * **Las fotos del producto y la maestra del lugar que viajarán con el envío**, para enseñarlas antes de pagar junto a
 * las del personaje o a la imagen que se anima (zona de claridad). Salen de las mismas funciones que guarda el envío,
 * así que lo que se enseña es lo que se manda. `null` si el envío no lleva ninguna de las dos.
 */
export async function fotosQueViajan(
  actor: Actor,
  entrada: {
    producto: { fotos: readonly string[] } | null;
    conProducto: { reparto: { producto: number } } | null;
    conLugar: LugarDelEnvio | null;
    reparto: RepartoDeReferencias;
    envio: EnvioConProducto;
    /** El cupo que se reparte: el de galería del adaptador, que puede ser menor que el tope del modelo. */
    cupo: number;
  },
): Promise<FotosQueViajan | null> {
  const { producto, conProducto, conLugar, reparto, envio, cupo } = entrada;
  const delProducto = referenciasDeProductoGuardadas(producto, conProducto).referenciasProducto ?? [];
  const delLugar = entradaDelLugar(conLugar, reparto).referenciasLugar ?? [];
  if (delProducto.length === 0 && delLugar.length === 0) return null;
  // Los ids ya salen de un producto y un lugar del usuario; filtrar por dueño es una segunda puerta, no la única.
  const filas = await db()
    .select()
    .from(media)
    .where(and(inArray(media.id, [...delProducto, ...delLugar]), eq(media.ownerId, actor.id), isNull(media.deletedAt)));
  const porId = new Map(filas.map((f) => [f.id, aDto(f, actor)]));
  const medios = (ids: string[]) => ids.flatMap((id) => porId.get(id) ?? []);
  return {
    producto: medios(delProducto),
    lugar: medios(delLugar),
    cupo,
    // Las que competían por el cupo, contadas como el reparto: con la hoja de identidad es una sola.
    fotosDelPersonaje: await fotosDelPersonajeEnElEnvio(envio),
  };
}
