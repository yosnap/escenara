import { and, eq, isNull } from "drizzle-orm";
import { leerObjeto } from "@/server/almacenamiento";
import { db } from "@/server/db/cliente";
import { media } from "@/server/db/esquema";
import { type ContextoId, leerId, manejador } from "@/server/media/http";
import { ErrorMedio } from "@/server/media/servicio";

export const dynamic = "force-dynamic";

/**
 * Contenido del archivo desde el mismo origen. Lo usa el editor de imagen para dibujar en un canvas
 * sin depender de la configuración CORS del almacenamiento.
 */
export const GET = manejador(async (_: Request, contexto: ContextoId) => {
  const id = await leerId(contexto);
  const [fila] = await db()
    .select({ clave: media.storageKey, mime: media.mimeType })
    .from(media)
    .where(and(eq(media.id, id), isNull(media.deletedAt)))
    .limit(1);
  if (!fila) throw new ErrorMedio(404, "El medio no existe.");
  const objeto = leerObjeto(fila.clave);
  // Sin esta comprobación, un objeto perdido respondería 200 con un cuerpo que falla a mitad.
  const info = await objeto.stat().catch(() => {
    throw new ErrorMedio(404, "El archivo del medio no está en el almacenamiento.");
  });
  return new Response(objeto.stream(), {
    headers: {
      "Content-Type": fila.mime,
      "Content-Length": String(info.size),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});
