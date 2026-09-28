import { count, eq } from "drizzle-orm";
import { db } from "../db/cliente";
import { generationJobs, media, scenes } from "../db/esquema";
import { productReferences, products } from "../db/esquema-productos";
import type { Actor } from "../media/servicio";
import { filaPropia } from "./consulta";

/**
 * Borrado de un producto (0.26.0). **No se lleva por delante nada de lo generado** (decisión firme del
 * propietario, 2026-09-28), y ahí se separa del borrado de un personaje (0.13.0), que sí borra sus derivados.
 *
 * El motivo de la diferencia es el consentimiento. Un personaje es una persona: revocar su consentimiento
 * obliga a que su cara desaparezca de donde esté. Un producto es un bote: no hay nada que revocar, y los
 * vídeos y fotogramas que se hicieron con él **son del usuario, ya están pagados y se quedan en su
 * biblioteca**. Lo único que pierden es el vínculo con el producto.
 *
 * Qué se borra, entonces: la **ficha** del producto y sus **referencias propias** (las filas que dicen «esta
 * foto es la etiqueta de este producto»). Nada más.
 *
 * Qué se queda:
 *
 * - los **medios generados** con él, en la biblioteca, con su archivo intacto;
 * - los **trabajos** de generación, con su prompt y su coste, solo que sin producto (`product_id` a nulo);
 * - las **escenas**, con su guion, sin producto y sin acción de producto;
 * - las **fotos de la biblioteca** que hacían de referencia: son fotos del usuario y puede estar usándolas en
 *   otro sitio. Lo que desaparece es la relación.
 *
 * Y por eso **no hay nada que bloquear ni que cancelar**: un trabajo que ya está en el proveedor puede
 * terminar tranquilamente y su resultado llegará a la biblioteca como cualquier otro, sin producto al que
 * referirse. Antes se bloqueaba con un 409 porque ese resultado habría llegado después de borrarse todo lo
 * demás; ahora no se borra nada de eso.
 */

export interface ResumenBorradoProducto {
  nombre: string;
  /** Fotos que dejan de estar asociadas al producto. Siguen en la biblioteca. */
  referencias: number;
  /** Medios generados con él que **se quedan** en la biblioteca. Se enumeran para poder decirlo. */
  generados: number;
  /** Escenas que se quedan sin producto y siguen existiendo. */
  escenas: number;
  /** Trabajos que se quedan en el historial y solo pierden el producto. */
  trabajos: number;
}

/** Cuántos medios generados citan este producto. Se quedan: se cuentan para poder decir que se quedan. */
async function generadosDe(productoId: string): Promise<number> {
  const filas = await db()
    .select({ total: count() })
    .from(generationJobs)
    .innerJoin(media, eq(media.id, generationJobs.resultMediaId))
    .where(eq(generationJobs.productId, productoId));
  return filas[0]?.total ?? 0;
}

/** Qué pasa al borrar, para poder enumerarlo en el diálogo antes de confirmar. */
export async function resumenBorrado(actor: Actor, id: unknown): Promise<ResumenBorradoProducto> {
  const producto = await filaPropia(actor, id);
  const total = (filas: { total: number }[]) => filas[0]?.total ?? 0;
  const [referencias, escenas, trabajos, generados] = await Promise.all([
    db().select({ total: count() }).from(productReferences).where(eq(productReferences.productId, producto.id)),
    db().select({ total: count() }).from(scenes).where(eq(scenes.productId, producto.id)),
    db().select({ total: count() }).from(generationJobs).where(eq(generationJobs.productId, producto.id)),
    generadosDe(producto.id),
  ]);
  return {
    nombre: producto.name,
    referencias: total(referencias),
    escenas: total(escenas),
    trabajos: total(trabajos),
    generados,
  };
}

export interface BorradoProductoRealizado {
  producto: string;
  referenciasBorradas: number;
  /** Escenas que se han quedado sin producto y siguen existiendo. */
  escenasLiberadas: number;
  /** Trabajos que se han quedado sin producto y siguen en el historial. */
  trabajosLiberados: number;
}

export async function borrarProducto(actor: Actor, id: unknown): Promise<BorradoProductoRealizado> {
  const producto = await filaPropia(actor, id);
  // Una sola transacción: o el producto desaparece con sus referencias y todo lo demás queda suelto, o no
  // pasa nada. No se toca el almacenamiento, porque no se borra ningún archivo.
  const hecho = await db().transaction(async (tx) => {
    const referencias = await tx
      .delete(productReferences)
      .where(eq(productReferences.productId, producto.id))
      .returning({ id: productReferences.id });
    const escenas = await tx
      .update(scenes)
      .set({ productId: null, productAction: "", updatedAt: new Date() })
      .where(eq(scenes.productId, producto.id))
      .returning({ id: scenes.id });
    // El trabajo conserva su acción: forma parte de lo que se pidió y de lo que se pagó, y el historial tiene
    // que poder decir con qué se generó cada cosa aunque el producto ya no esté.
    const trabajos = await tx
      .update(generationJobs)
      .set({ productId: null })
      .where(eq(generationJobs.productId, producto.id))
      .returning({ id: generationJobs.id });
    await tx.delete(products).where(eq(products.id, producto.id));
    return { referencias: referencias.length, escenas: escenas.length, trabajos: trabajos.length };
  });

  console.info(
    `[productos] producto borrado · referencias=${hecho.referencias} escenas=${hecho.escenas} trabajos=${hecho.trabajos}`,
  );
  return {
    producto: producto.name,
    referenciasBorradas: hecho.referencias,
    escenasLiberadas: hecho.escenas,
    trabajosLiberados: hecho.trabajos,
  };
}
