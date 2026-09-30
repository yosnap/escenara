import { type ContextoId, exigirMismoOrigen, exigirRitmoDeEscritura, leerId, manejador } from "@/server/asistente/http";
import { exportacionesDelProyecto, pedirExportacionProyecto } from "@/server/datos/exportacion-proyecto";

export const dynamic = "force-dynamic";

/** Últimas exportaciones del proyecto, con su estado y, si está lista y vigente, su enlace de descarga. */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) =>
  Response.json({ exportaciones: await exportacionesDelProyecto(actor, await leerId(contexto)) }),
);

/** Pide un paquete ZIP del proyecto. Si ya hay uno preparándose, devuelve ese. Lo prepara el worker. */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "exportar");
  const { exportacion, nueva } = await pedirExportacionProyecto(actor, await leerId(contexto));
  return Response.json({ exportacion }, { status: nueva ? 201 : 200 });
});
