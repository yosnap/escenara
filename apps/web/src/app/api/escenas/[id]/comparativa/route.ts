import { leerPeticionAB } from "@/lib/comparativas";
import { ErrorProyecto } from "@/server/asistente/errores";
import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/asistente/http";
import { estimarAB, prepararAB, ultimaComparativaDeEscena } from "@/server/comparativas/ab";
import { lanzarAB } from "@/server/comparativas/lanzamiento";

export const dynamic = "force-dynamic";

/**
 * Comparativa A/B de **una** escena del usuario (una ajena responde 404).
 *
 * - `GET`: qué modelos se pueden comparar, por qué no se puede (si no se puede) y la última comparativa de la escena;
 * - `GET ?modelos=a,b`: la estimación de cada alternativa con el precio del catálogo. **No gasta nada**;
 * - `POST`: lanza la comparativa. Exige el número de ejecuciones y el coste total confirmados, además de la
 *   confirmación de siempre; si algo no cuadra, no se encola nada.
 */
export const GET = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const modelos = new URL(peticion.url).searchParams.get("modelos");
  if (modelos !== null) {
    await exigirRitmoDeEscritura(actor, "comparativa:estimacion");
    const lista = modelos.split(",").map((m) => m.trim());
    if (lista.some((m) => m.length === 0 || m.length > 200))
      throw new ErrorProyecto(400, "Esos modelos no son válidos.");
    return Response.json(await estimarAB(actor, id, lista));
  }
  const [preparacion, ultima] = await Promise.all([prepararAB(actor, id), ultimaComparativaDeEscena(actor, id)]);
  return Response.json({ preparacion, ultima });
});

export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "comparativa:lanzar");
  const id = await leerId(contexto);
  const leida = leerPeticionAB(await leerCuerpo(peticion));
  if (typeof leida === "string") throw new ErrorProyecto(400, `${leida} No se ha encolado nada.`);
  return Response.json(await lanzarAB(actor, id, leida), { status: 201 });
});
