import { destinoIconoApple } from "@/server/marca/metadatos";
import { marcaAplicada } from "@/server/marca/publicada";

export const dynamic = "force-dynamic";

/**
 * `/apple-touch-icon.png`: iOS lo pide por convención aunque la página no lo declare. Lleva al icono que toca según la
 * marca publicada (ver `destinoIconoApple`); si la marca tiene logotipo pero no icono, 404, nunca el de Escenara.
 */
export async function GET(): Promise<Response> {
  const destino = destinoIconoApple(await marcaAplicada());
  if (!destino) return new Response("Esta instalación no tiene icono de Apple.", { status: 404 });
  // Location relativa: detrás de un proxy, la URL que ve el servidor puede no ser la pública.
  return new Response(null, { status: 307, headers: { Location: destino, "Cache-Control": "no-cache" } });
}
