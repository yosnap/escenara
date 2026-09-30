import { eq } from "drizzle-orm";
import { db } from "../db/cliente";
import { type FilaEscena, type FilaTrabajo, products } from "../db/esquema";

/**
 * `true` cuando lo que toca después de este fotograma **no** es el clip, sino insertar la captura: la escena
 * lleva un producto digital y lo que hay hecho es el fotograma de la pantalla apagada.
 */
export async function faltaInsertarLaCaptura(escena: FilaEscena, fotograma: FilaTrabajo): Promise<boolean> {
  if (escena.productId === null || fotograma.digitalStep !== "pantalla_negra") return false;
  // El producto vigente tiene que seguir siendo digital: si se cambió por uno físico después de la pantalla
  // apagada, no hay captura que meter y se sigue por el camino normal del clip en vez de bloquear la escena.
  const [producto] = await db()
    .select({ kind: products.kind })
    .from(products)
    .where(eq(products.id, escena.productId))
    .limit(1);
  return producto?.kind === "digital";
}
