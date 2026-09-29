import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/asistente/http";
import { guardarMontaje, leerCambiosDeMontaje, montajeDelProyecto } from "@/server/montaje/servicio";
import { montajeParaLaVista } from "@/server/montaje/vista";

export const dynamic = "force-dynamic";

/**
 * Montaje de un proyecto (RF08, 0.32.0).
 *
 * `GET` devuelve la línea de tiempo vigente, las escenas con su clip, las exportaciones y la **comprobación
 * previa** del render. Es lectura: no monta nada y no cuesta nada. Si el proyecto no tiene montaje todavía, se
 * crea con la línea de tiempo propuesta (todas las escenas con clip, en orden y sin recortar).
 *
 * `PUT` guarda la línea de tiempo entera: orden, recortes, volúmenes, subtítulos y etiqueta. Es una sustitución y
 * no un parche a propósito: reordenar, recortar y quitar un fragmento son la misma operación sobre la misma lista,
 * y un parche por fragmento haría imposible el control de versión optimista que evita pisar lo de otra pestaña.
 */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) => {
  const { montaje, material } = await montajeDelProyecto(actor, await leerId(contexto));
  return Response.json(await montajeParaLaVista(actor, montaje, material));
});

export const PUT = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "montaje");
  const cambios = leerCambiosDeMontaje(await leerCuerpo(peticion));
  const { montaje, material } = await guardarMontaje(actor, await leerId(contexto), cambios);
  return Response.json(await montajeParaLaVista(actor, montaje, material));
});
