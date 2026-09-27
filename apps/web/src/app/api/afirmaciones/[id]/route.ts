import { resolverAfirmacion } from "@/server/asistente/afirmaciones";
import { escenaPropia } from "@/server/asistente/consulta";
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
 * Resuelve una afirmación señalada: `{ estado: "verificada" | "corregida" | "descartada", fuente? }`.
 *
 * Verificar exige escribir la fuente. Escenara no verifica nada por su cuenta: aquí solo se guarda lo que
 * decide una persona.
 */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "afirmacion");
  const cuerpo = await leerCuerpo(peticion);
  const afirmacion = await resolverAfirmacion(actor, await leerId(contexto), cuerpo.estado, cuerpo.fuente);
  const { escena } = await escenaPropia(actor, afirmacion.sceneId);
  return Response.json(await detalleProyecto(actor, escena.projectId));
});
