import type { AvanzadasDelProyecto } from "@/lib/proyectos";
import type { EleccionesDelPlan } from "../asistente/plan";
import type { FilaProyecto } from "../db/esquema";
import { eleccionOmni } from "../omni/registro";
import { modeloDeVideoDe, modelosDeVideoDelProyecto } from "./modelo-de-video";

/**
 * Lo que enseñan las Opciones avanzadas de un proyecto: el modelo fijado, los que se pueden fijar en su modo y con
 * cuál se generaría ahora. El modelo «en uso» sale de las **mismas** elecciones con las que se estima el plan, así
 * que lo que se lee aquí es lo que se va a pagar.
 */
export async function avanzadasDelProyecto(
  usuarioId: string,
  proyecto: FilaProyecto,
  elecciones: EleccionesDelPlan,
): Promise<AvanzadasDelProyecto> {
  const escenasHabladas = proyecto.voiceMode === "omni";
  const [modelos, enUso] = await Promise.all([
    modelosDeVideoDelProyecto(proyecto.voiceMode),
    escenasHabladas
      ? eleccionOmni(usuarioId, undefined, proyecto)
          .then((e) => e.modelo.nombre)
          .catch(() => "")
      : Promise.resolve(elecciones.animacion?.modelo.nombre ?? ""),
  ]);
  const fijado = proyecto.videoModel.trim();
  return {
    modeloVideo: fijado,
    modelos,
    enUso,
    escenasHabladas,
    fijadoNoDisponible:
      fijado !== "" && (modeloDeVideoDe(proyecto) === null || !modelos.some((m) => m.modelo === fijado)),
  };
}
