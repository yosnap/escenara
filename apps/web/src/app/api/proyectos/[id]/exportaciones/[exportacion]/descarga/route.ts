import { manejador } from "@/server/asistente/http";
import { urlDeDescarga } from "@/server/datos/exportacion-proyecto";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string; exportacion: string }> };

/**
 * Descarga del ZIP: redirige a una URL temporal del almacenamiento que dura como mucho lo que le queda al paquete. Solo
 * el dueño; uno ajeno responde 404 y uno caducado, 410 con la causa.
 */
export const GET = manejador(
  async (_: Request, contexto: Contexto, actor) => {
    const { id, exportacion } = await contexto.params;
    const url = await urlDeDescarga(actor, id, exportacion);
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store" } });
  },
  { permitirBorradoProgramado: true },
);
