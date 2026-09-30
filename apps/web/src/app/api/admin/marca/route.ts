import { exigirAdministracion, exigirRitmoDeMarca, leerJson, manejador } from "@/server/marca/http";
import { descartarBorrador, estadoDeLaMarca, guardarBorrador } from "@/server/marca/instalacion";

export const dynamic = "force-dynamic";

/** Estado de la marca de la instalación para el editor: borrador, publicada, historial y archivos. */
export const GET = manejador(async (_: Request, __: unknown, actor) => Response.json(await estadoDeLaMarca(actor)));

/** Guarda el borrador. Un documento inválido no se guarda y la respuesta dice qué campo falla. */
export const PUT = manejador(async (peticion: Request, __: unknown, actor) => {
  exigirAdministracion(actor);
  await exigirRitmoDeMarca(actor);
  const cuerpo = await leerJson(peticion);
  const borrador = await guardarBorrador(actor, {
    documento: cuerpo.documento,
    activos: cuerpo.activos,
    notas: cuerpo.notas,
  });
  return Response.json({ borrador });
});

/** Descarta el borrador. Lo publicado no cambia. */
export const DELETE = manejador(async (_: Request, __: unknown, actor) => {
  await descartarBorrador(actor);
  return new Response(null, { status: 204 });
});
