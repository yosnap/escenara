import { escenaPropia } from "@/server/asistente/consulta";
import { borrarEscena, editarEscena } from "@/server/asistente/escenas";
import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/asistente/http";
import { detalleProyecto } from "@/server/asistente/plan";

export const dynamic = "force-dynamic";

/**
 * Edita una escena a mano: `{ texto?, accion?, segundos?, promptFotograma?, promptAnimacion? }`.
 *
 * Si estaba aprobada, deja de estarlo y la respuesta lo indica: el plan se revisa y se aprueba otra vez.
 */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "escena");
  const cuerpo = await leerCuerpo(peticion);
  const escena = await editarEscena(actor, await leerId(contexto), cuerpo);
  return Response.json(await detalleProyecto(actor, escena.projectId));
});

/** Borra una escena y renumera las que quedan. Una escena ya producida no se borra. */
export const DELETE = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  const id = await leerId(contexto);
  // Se lee antes de borrar para poder devolver el proyecto al que pertenecía.
  const { escena } = await escenaPropia(actor, id);
  await borrarEscena(actor, id);
  return Response.json(await detalleProyecto(actor, escena.projectId));
});
