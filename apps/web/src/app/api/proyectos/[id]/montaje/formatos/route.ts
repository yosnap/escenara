import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/asistente/http";
import { cambiarFormatosDelProyecto } from "@/server/montaje/formatos-del-proyecto";
import { montajeDelProyecto } from "@/server/montaje/servicio";
import { montajeParaLaVista } from "@/server/montaje/vista";

export const dynamic = "force-dynamic";

/**
 * Formatos de salida del proyecto (0.41.0). `PUT { formatos }` los sustituye: el primero es el principal.
 *
 * Añadir o quitar un formato **no cuesta nada**: sale del mismo clip con reencuadre en el montaje. Cambiar el
 * principal solo se acepta si los modelos elegidos lo admiten y el plan todavía no está aprobado ni hay clips.
 * Responde con el montaje completo, que es lo que pinta la pantalla.
 */
export const PUT = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "montaje");
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  await cambiarFormatosDelProyecto(actor, id, cuerpo.formatos);
  const { montaje, material } = await montajeDelProyecto(actor, id);
  return Response.json(await montajeParaLaVista(actor, montaje, material));
});
