import { eq } from "drizzle-orm";
import type { ProductoElegido } from "@/lib/productos";
import { db } from "../db/cliente";
import { scenes } from "../db/esquema";
import { productoPropio } from "./eleccion";
import type { EleccionDeFotos } from "./prompt";

/**
 * Qué producto se guarda en la fila de un trabajo de generación (0.26.0).
 *
 * Hay dos orígenes y **la escena manda**: cuando el clip o el fotograma salen de un proyecto, el producto es el
 * que se eligió en la escena, no lo que diga el navegador al confirmar. El camino de «Crear» no tiene escena, y
 * allí sí llega elegido con la confirmación, comprobando que sea de quien lo pide.
 *
 * En esta versión el producto **solo se guarda**: es lo que permite borrar sus derivados al borrar el producto
 * y saber con qué se pidió cada trabajo. Lo que se le envía al proveedor no cambia todavía.
 */
export async function productoDelTrabajo(
  usuarioId: string,
  escenaId: string | null,
  elegido: ProductoElegido | undefined,
): Promise<{ productId: string | null; productAction: string }> {
  if (escenaId) {
    const [escena] = await db()
      .select({ productId: scenes.productId, productAction: scenes.productAction })
      .from(scenes)
      .where(eq(scenes.id, escenaId))
      .limit(1);
    return { productId: escena?.productId ?? null, productAction: escena?.productAction ?? "" };
  }
  const propio = await productoPropio(usuarioId, elegido ?? null);
  return { productId: propio.productoId === "" ? null : propio.productoId, productAction: propio.accion };
}

/**
 * Fotos del producto que el usuario eligió enviar en este trabajo. **Manda la escena** cuando el trabajo sale de
 * una, igual que con el producto y la acción: es la elección que guardó allí, y lo que diga el navegador se
 * ignora. En «Crear» viene con la petición y es estricta: si no es válida o no cabe, se rechaza.
 */
export async function eleccionDeFotosDelTrabajo(
  escenaId: string | null,
  elegido: ProductoElegido | undefined,
): Promise<EleccionDeFotos> {
  if (!escenaId) return { ids: elegido?.fotos ?? [], estricta: true };
  const [escena] = await db()
    .select({ ids: scenes.productPhotoIds })
    .from(scenes)
    .where(eq(scenes.id, escenaId))
    .limit(1);
  return { ids: escena?.ids ?? [], estricta: false };
}
