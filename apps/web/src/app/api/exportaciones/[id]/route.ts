import { type ContextoId, leerId, manejador } from "@/server/asistente/http";
import { exportacionPropia } from "@/server/montaje/exportacion";
import { montajeDeProyecto } from "@/server/montaje/material";
import { exportacionParaLaVista } from "@/server/montaje/vista";

export const dynamic = "force-dynamic";

/**
 * Estado de **una** exportación (RF08, 0.32.0): su etapa real, su progreso y, cuando termina, el MP4 con su URL
 * temporal de descarga. Es lo que consulta la pantalla mientras el worker monta.
 *
 * Es lectura y es barata a propósito: se pregunta cada pocos segundos, así que no recompone el montaje entero ni
 * reevalúa los controles. Una exportación ajena responde **404**, igual que el proyecto del que sale.
 */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) => {
  const exportacion = await exportacionPropia(actor, await leerId(contexto));
  const montaje = await montajeDeProyecto(exportacion.projectId);
  return Response.json(
    await exportacionParaLaVista(actor, exportacion, montaje?.version ?? exportacion.montageVersion),
  );
});
