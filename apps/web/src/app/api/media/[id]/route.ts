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

export const GET = manejador(async (_: Request, contexto: ContextoId) => {
  return Response.json(await obtenerMedio(await leerId(contexto)));
});

/** Metadatos editables: `{ titulo?, altEs?, altEn? }`. */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId) => {
  const id = await leerId(contexto);
  const cuerpo = (await peticion.json().catch(() => null)) as CambiosMetadatos | null;
  if (!cuerpo || typeof cuerpo !== "object") throw new ErrorMedio(400, "Cuerpo JSON no válido.");
  return Response.json(await actualizarMetadatos(id, cuerpo));
});

/** Sustituye el archivo de una imagen editada (modo «sobrescribir»). */
export const PUT = manejador(async (peticion: Request, contexto: ContextoId) => {
  const id = await leerId(contexto);
  const { archivo } = await leerArchivo(peticion);
  return Response.json(await reemplazarImagen(id, archivo));
});

/** Envía a la papelera; con `?definitivo=1` borra para siempre un medio que ya está en ella. */
export const DELETE = manejador(async (peticion: Request, contexto: ContextoId) => {
  const id = await leerId(contexto);
  if (new URL(peticion.url).searchParams.get("definitivo") === "1") {
    await eliminarDefinitivamente(id);
    return new Response(null, { status: 204 });
  }
  return Response.json(await enviarAPapelera(id));
});
