import type { ModeloElegible } from "@/lib/catalogo";
import { esModeloOmni } from "@/lib/omni";
import { ErrorProyecto } from "../asistente/errores";
import type { FilaProyecto } from "../db/esquema";
import { modelosParaCrearConFoto } from "../productos/modelos-sugeridos";

/**
 * Lo fijado en el proyecto si vale **para su modo**, sin mirar el catálogo: en modo `omni` solo sirve un modelo de
 * escenas habladas, así que un modelo de clip fijado antes de cambiar de modo no cuenta. `null` = nada fijado.
 */
export function modeloFijadoParaElModo(proyecto: Pick<FilaProyecto, "videoModel" | "voiceMode">): string | null {
  const fijado = proyecto.videoModel.trim();
  if (fijado === "") return null;
  if (proyecto.voiceMode === "omni" && !esModeloOmni(fijado)) return null;
  return fijado;
}

/**
 * **El único lector** del modelo de vídeo fijado en un proyecto (`projects.video_model`).
 *
 * Lo usan la estimación del plan, la aprobación, el sello que se congela, la consulta de producción y el encolado:
 * si cada uno leyera la columna a su manera, la cifra que se confirma y el modelo que se paga podrían ser distintos.
 *
 * Devuelve `null` —es decir, «el mapa de modelos de la cuenta», lo de siempre— cuando el proyecto no fija ninguno,
 * cuando lo fijado no vale para su modo y cuando **ya no es elegible** (retirado, sin precio o sin la capacidad).
 * Así un modelo que desaparece del catálogo nunca deja el proyecto sin producir: se vuelve al mapa en todos los
 * caminos a la vez, y como el coste se reestima antes de cada confirmación, no se cobra una cifra no vista.
 */
export async function modeloDeVideoDe(
  proyecto: Pick<FilaProyecto, "videoModel" | "voiceMode">,
): Promise<string | null> {
  const fijado = modeloFijadoParaElModo(proyecto);
  if (fijado === null) return null;
  const elegibles = await modelosDeVideoDelProyecto(proyecto.voiceMode);
  return elegibles.some((m) => m.modelo === fijado) ? fijado : null;
}

/**
 * Modelos que se pueden fijar en un proyecto según su modo: en `omni`, solo los de escenas habladas; en los demás,
 * todos los que animan una imagen. Son los mismos elegibles que ofrece «Crear» (con precio y estado usable).
 */
export async function modelosDeVideoDelProyecto(modoVoz: string): Promise<ModeloElegible[]> {
  const modelos = await modelosParaCrearConFoto("image_to_video");
  return modoVoz === "omni" ? modelos.filter((m) => esModeloOmni(m.modelo)) : modelos;
}

/**
 * Valida lo que llega para fijar el modelo de vídeo. Cadena vacía = volver al mapa de la cuenta. Un modelo que no
 * está entre los elegibles del modo se rechaza con su motivo y sin nombrarlo: puede ser un identificador cualquiera.
 */
export async function modeloDeVideoValido(valor: unknown, modoVoz: string): Promise<string> {
  if (typeof valor !== "string" || valor.length > 200) {
    throw new ErrorProyecto(400, "El modelo de vídeo indicado no es válido. Vuelve a elegirlo en Opciones avanzadas.");
  }
  const modelo = valor.trim();
  if (modelo === "") return "";
  const elegibles = await modelosDeVideoDelProyecto(modoVoz);
  if (!elegibles.some((m) => m.modelo === modelo)) {
    throw new ErrorProyecto(
      409,
      "Ese modelo de vídeo no está disponible para este proyecto (puede haberse retirado o no servir en este modo de voz). No se ha cambiado nada: elige otro en Opciones avanzadas o vuelve al de tu mapa de modelos.",
    );
  }
  return modelo;
}
