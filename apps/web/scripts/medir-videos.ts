import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Rellena el ancho y el alto de los vídeos guardados sin medidas (los generados antes de la 0.10.1),
 * leyéndolos de la cabecera del propio archivo. Idempotente: solo toca vídeos sin ancho.
 *
 * `bun run db:backup` y después `bun run medios:medir-videos`.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../.."), true, console, true);

const { and, eq, isNull } = await import("drizzle-orm");
const { db } = await import("../src/server/db/cliente");
const { media } = await import("../src/server/db/esquema");
const { leerObjeto } = await import("../src/server/almacenamiento");
const { dimensionesVideo } = await import("../src/server/media/dimensiones-video");

const sinMedidas = await db()
  .select({ id: media.id, clave: media.storageKey })
  .from(media)
  .where(and(eq(media.kind, "video"), isNull(media.width)));

let medidos = 0;
for (const fila of sinMedidas) {
  const medidas = dimensionesVideo(new Uint8Array(await leerObjeto(fila.clave).arrayBuffer()));
  if (!medidas) {
    console.log(`${fila.id}: sin cabecera legible, se deja como está.`);
    continue;
  }
  await db()
    .update(media)
    .set({ width: medidas.ancho, height: medidas.alto })
    .where(and(eq(media.id, fila.id), isNull(media.width)));
  medidos++;
}
await db().$client.close();
console.log(`${medidos} de ${sinMedidas.length} vídeos sin medidas, medidos.`);
