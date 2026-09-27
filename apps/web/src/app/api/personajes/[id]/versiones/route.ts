import { type ContextoId, exigirRitmoDeAprobaciones, leerCuerpo, leerId, manejador } from "@/server/personajes/http";
import { historialDeVersiones, registrarAprobacion } from "@/server/personajes/versiones";

export const dynamic = "force-dynamic";

/**
 * Historial de versiones de la ficha con sus aprobaciones. El dueño lo ve entero; quien administra ve los
 * números, las fechas y qué cambió —para poder auditar un consentimiento—, pero **no** el contenido de la
 * ficha ni la hoja de personaje. Un personaje ajeno sin consentimiento de tercero responde 404.
 */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) =>
  Response.json(await historialDeVersiones(actor, await leerId(contexto))),
);

/**
 * Registra una aprobación contra la versión vigente: `{ tipo, asunto? }`. Es la pieza sobre la que se montan
 * las aprobaciones de guion y escenas (0.17.0); aquí existe para que la invalidación al versionar tenga algo
 * que invalidar y se pueda comprobar. Solo el dueño.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  await exigirRitmoDeAprobaciones(actor);
  return Response.json(await registrarAprobacion(actor, id, { tipo: cuerpo.tipo, asunto: cuerpo.asunto }), {
    status: 201,
  });
});
