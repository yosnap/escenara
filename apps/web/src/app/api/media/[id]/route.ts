import type { CambiosMetadatos } from "@/lib/media/tipos";
import { type ContextoId, leerArchivo, leerId, manejador } from "@/server/media/http";
import {
  actualizarMetadatos,
  ErrorMedio,
  eliminarDefinitivamente,
  enviarAPapelera,
  obtenerMedio,
  reemplazarImagen,
} from "@/server/media/servicio";

export const dynamic = "force-dynamic";

export const GET = manejador(async (_: Request, contexto: ContextoId, actor) => {
  return Response.json(await obtenerMedio(actor, await leerId(contexto)));
});

/** Metadatos editables: `{ titulo?, altEs?, altEn? }` (dueño o admin). */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = (await peticion.json().catch(() => null)) as CambiosMetadatos | null;
  if (!cuerpo || typeof cuerpo !== "object") throw new ErrorMedio(400, "Cuerpo JSON no válido.");
  return Response.json(await actualizarMetadatos(actor, id, cuerpo));
});

/** Sustituye el archivo de una imagen editada (modo «sobrescribir»; solo el dueño). */
export const PUT = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const { archivo } = await leerArchivo(peticion);
  return Response.json(await reemplazarImagen(actor, id, archivo));
});

/** Envía a la papelera (dueño o admin); con `?definitivo=1` borra para siempre (solo el dueño). */
export const DELETE = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  if (new URL(peticion.url).searchParams.get("definitivo") === "1") {
    await eliminarDefinitivamente(actor, id);
    return new Response(null, { status: 204 });
  }
  return Response.json(await enviarAPapelera(actor, id));
});
