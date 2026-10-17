import { inArray } from "drizzle-orm";
import { exigeDeclaracionDeMarca } from "@/lib/productos";
import { db } from "../db/cliente";
import { type FilaTrabajo, products } from "../db/esquema";

/**
 * La declaración «Tengo derecho a usar esta marca» de un trabajo con producto: si hacía falta al enviarlo y si se
 * hizo. Hace falta cuando el producto tenía marca declarada **o estaba sin responder**; con un «no» explícito no hay
 * nada que autorizar, y entonces `brand_rights_at` se queda vacío (no se inventa una declaración que nadie hizo).
 */

/** Lo que se guarda en la entrada del trabajo: si al enviarlo se exigió la declaración de marca. */
export function marcaAlEnviar(producto: { marcaVisible: boolean | null } | null): { marcaExigida?: boolean } {
  return producto ? { marcaExigida: exigeDeclaracionDeMarca(producto.marcaVisible) } : {};
}

/** Fecha de la declaración de marca: solo cuando de verdad se exigió (y por tanto se marcó). */
export function fechaDeLaDeclaracionDeMarca(producto: { marcaVisible: boolean | null } | null): Date | null {
  return producto && exigeDeclaracionDeMarca(producto.marcaVisible) ? new Date() : null;
}

/**
 * Si el trabajo exigía la declaración de marca al enviarlo. Los trabajos anteriores a que se guardara la exigían
 * siempre que llevaran producto, así que su ausencia cuenta como `true`.
 */
export const marcaExigidaDe = (fila: Pick<FilaTrabajo, "input">): boolean =>
  (fila.input as { marcaExigida?: unknown } | null)?.marcaExigida !== false;

/**
 * La declaración de marca vista desde una versión o una conversión: `null` si no se necesitaba (sin producto, o con un
 * producto declarado sin marca), y si se necesitaba, si quedó hecha.
 */
export const derechoMarcaDelTrabajo = (fila: Pick<FilaTrabajo, "input" | "productId" | "brandRightsAt">) =>
  fila.productId && marcaExigidaDe(fila) ? fila.brandRightsAt !== null : null;

/**
 * Para cada producto, si un envío con él exige la declaración de marca (con marca o sin responder). Lo usan las
 * pantallas que confirman varios envíos a la vez (la producción de un proyecto) para pedir la casilla con la misma
 * regla que el servidor. Un producto que ya no existe no aparece: sin producto no hay marca que declarar.
 */
export async function marcasExigidas(productoIds: readonly (string | null)[]): Promise<Map<string, boolean>> {
  const ids = [...new Set(productoIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const filas = await db()
    .select({ id: products.id, marca: products.brandVisible })
    .from(products)
    .where(inArray(products.id, ids));
  return new Map(filas.map((f) => [f.id, exigeDeclaracionDeMarca(f.marca)]));
}
