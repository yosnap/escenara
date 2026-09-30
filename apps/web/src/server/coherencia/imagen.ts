import { eq } from "drizzle-orm";
import { leerObjeto } from "../almacenamiento";
import { db } from "../db/cliente";
import { media } from "../db/esquema";
import { imagenParaModelo } from "../media/procesado";

/** Imagen de un medio reducida para el modelo, o `null` si no se puede leer. */
export async function imagenDe(medioId: string | null): Promise<{ mime: string; base64: string } | null> {
  if (!medioId) return null;
  const [fila] = await db().select().from(media).where(eq(media.id, medioId)).limit(1);
  if (!fila || fila.deletedAt !== null) return null;
  try {
    return await imagenParaModelo(new Uint8Array(await leerObjeto(fila.storageKey).arrayBuffer()));
  } catch (error) {
    console.error(`[coherencia] imagen ilegible de la escena: ${(error as Error).name}`);
    return null;
  }
}
