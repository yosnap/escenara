import { leerTramo } from "@/lib/demo-plantilla";
import { leerObjeto } from "./almacenamiento";

/**
 * Sirve un objeto del almacenamiento desde el mismo origen, con cabeceras seguras y admitiendo `Range` (los navegadores
 * lo piden para reproducir y saltar en un vídeo). Quien llama ya ha decidido que quien pide puede verlo y ha limpiado el
 * tipo MIME contra su lista. Si el objeto no está, lanza el error que le da quien llama (con su causa).
 */
export async function responderArchivo(
  peticion: Request,
  clave: string,
  mime: string,
  sinObjeto: () => Error,
): Promise<Response> {
  const objeto = leerObjeto(clave);
  const info = await objeto.stat().catch(() => {
    throw sinObjeto();
  });
  const cabeceras: Record<string, string> = {
    "Content-Type": mime,
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  };
  const tramo = leerTramo(peticion.headers.get("range"), info.size);
  if (tramo === "fuera") {
    return new Response(null, { status: 416, headers: { ...cabeceras, "Content-Range": `bytes */${info.size}` } });
  }
  if (tramo === null) {
    return new Response(objeto.stream(), { headers: { ...cabeceras, "Content-Length": String(info.size) } });
  }
  return new Response(objeto.slice(tramo.inicio, tramo.fin + 1).stream(), {
    status: 206,
    headers: {
      ...cabeceras,
      "Content-Length": String(tramo.fin - tramo.inicio + 1),
      "Content-Range": `bytes ${tramo.inicio}-${tramo.fin}/${info.size}`,
    },
  });
}
