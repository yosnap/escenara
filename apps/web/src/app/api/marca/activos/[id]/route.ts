import { leerObjeto } from "@/server/almacenamiento";
import { esAdmin, sesionDePeticion } from "@/server/auth/sesion";
import { activoParaServir } from "@/server/marca/activos";
import { type ContextoId, ErrorMarca, esUuid, respuestaError } from "@/server/marca/http";

export const dynamic = "force-dynamic";

/**
 * Sirve un archivo de marca con su **tipo real** (el que se comprobó al subirlo), `nosniff` y una política de contenido
 * cerrada: aunque alguien abriera un SVG directamente, no puede cargar nada ni ejecutar nada. Los de la instalación son
 * públicos e inmutables (el favicon lo pide cualquiera); los de un kit, solo para su dueño.
 */
export async function GET(peticion: Request, contexto: ContextoId): Promise<Response> {
  try {
    const { id } = await contexto.params;
    if (!esUuid(id)) throw new ErrorMarca(404, "Ese archivo de marca no existe.");
    const sesion = await sesionDePeticion(peticion);
    const actor = sesion ? { id: sesion.user.id, esAdmin: esAdmin(sesion) } : null;
    const fila = await activoParaServir(id, actor);
    const datos = await leerObjeto(fila.storageKey).arrayBuffer();
    return new Response(datos, {
      headers: {
        "Content-Type": fila.mimeType,
        "Content-Length": String(datos.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Cache-Control": fila.scope === "instalacion" ? "public, max-age=31536000, immutable" : "private, max-age=3600",
      },
    });
  } catch (error) {
    return respuestaError(error);
  }
}
