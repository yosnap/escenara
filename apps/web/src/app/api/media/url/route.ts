import { esTipoMedio, type TipoMedio } from "@/lib/media/reglas";
import { descargarUrl } from "@/server/media/descarga-url";
import { ErrorMedio } from "@/server/media/errores";
import { manejador } from "@/server/media/http";
import { crearMedio, limiteSubida } from "@/server/media/servicio";

export const dynamic = "force-dynamic";

/** Añade un medio descargándolo desde una URL pública: `{ url, tipos? }` (tipos: lista de tipos admitidos). */
export const POST = manejador(async (peticion: Request, _: unknown, actor) => {
  const cuerpo = (await peticion.json().catch(() => null)) as { url?: unknown; tipos?: unknown } | null;
  if (!cuerpo || typeof cuerpo.url !== "string") throw new ErrorMedio(400, "Indica la URL del archivo.");
  let permitidos: TipoMedio[] | undefined;
  if (cuerpo.tipos !== undefined) {
    permitidos = Array.isArray(cuerpo.tipos) ? cuerpo.tipos.filter(esTipoMedio) : [];
    // Si se indican tipos, deben ser válidos: nunca se amplía a «todos» por error.
    if (permitidos.length === 0) throw new ErrorMedio(400, "Los tipos indicados no son válidos.");
  }
  const { archivo, origen } = await descargarUrl(cuerpo.url, limiteSubida(permitidos));
  const medio = await crearMedio(actor, archivo, {}, permitidos, origen);
  return Response.json(medio, { status: 201 });
});
