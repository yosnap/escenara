import { and, asc, eq, isNull } from "drizzle-orm";
import type { PapelReferencia } from "@/lib/productos";
import { ordenarPorPrioridad, type RepartoDeReferencias } from "@/lib/reparto-referencias";
import { db } from "../db/cliente";
import { media } from "../db/esquema";
import { productReferences } from "../db/esquema-productos";

/**
 * **Qué fotos del producto viajan al proveedor** (0.26.0). El reparto del cupo de referencias entre el
 * personaje y el producto es una función pura que vive en `lib/reparto-referencias.ts`, porque el navegador
 * necesita la misma cuenta para enseñar cuántas fotos caben; aquí se reexporta para que el servidor la pida
 * siempre por el mismo sitio, y se lee de la base de datos qué fotos tiene el producto.
 */
export { type RepartoDeReferencias, repartirReferencias } from "@/lib/reparto-referencias";

/**
 * Fotos del producto que pueden viajar, ordenadas por prioridad de papel y, dentro de un papel, como las dejó
 * su dueño. Se excluyen las que están en la papelera: su archivo puede desaparecer en cualquier momento.
 */
export async function fotosDelProducto(
  productoId: string,
  accion = "",
  /**
   * Papel único que se admite en este envío. Lo usa el **segundo paso del producto digital**: ahí lo que se
   * inserta es la captura de pantalla y nada más, y mandarle además el envase le daría al modelo una segunda
   * imagen que podría acabar dentro de la pantalla.
   */
  soloPapel?: PapelReferencia,
): Promise<string[]> {
  const filas = await db()
    .select({ mediaId: productReferences.mediaId, papel: productReferences.kind, orden: productReferences.sortOrder })
    .from(productReferences)
    .innerJoin(media, eq(media.id, productReferences.mediaId))
    .where(
      and(
        eq(productReferences.productId, productoId),
        isNull(media.deletedAt),
        ...(soloPapel ? [eq(productReferences.kind, soloPapel)] : []),
      ),
    )
    .orderBy(asc(productReferences.sortOrder), asc(productReferences.createdAt));
  return ordenarPorPrioridad(filas, accion).map((f) => f.mediaId);
}

/**
 * Las referencias del personaje que se guardan en el trabajo: **solo las que caben** tras dejar su sitio al
 * producto, en su orden de prioridad. El worker aplica el mismo tope al enviar, así que guardarlas ya recortadas
 * no cambia lo que llega al proveedor: hace que el trabajo diga lo mismo que el aviso.
 */
export function referenciasDelPersonajeQueViajan<T>(
  referencias: readonly T[],
  reparto: Pick<RepartoDeReferencias, "personaje"> | null,
): T[] {
  return reparto && reparto.personaje > 0 ? referencias.slice(0, reparto.personaje) : [...referencias];
}

/**
 * Lo que se guarda en el trabajo de las fotos del producto: **solo las que caben**, en el orden de prioridad con
 * el que se van a enviar. El worker no vuelve a repartir nada; envía esto, que es lo que se ha avisado y se ha
 * confirmado.
 */
export function referenciasDeProductoGuardadas(
  producto: { fotos: readonly string[] } | null,
  conProducto: { reparto: { producto: number } } | null,
): { referenciasProducto?: string[] } {
  if (!producto || !conProducto || conProducto.reparto.producto === 0) return {};
  return { referenciasProducto: producto.fotos.slice(0, conProducto.reparto.producto) };
}
