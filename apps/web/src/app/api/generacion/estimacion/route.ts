import { esTipoTrabajo } from "@/lib/generacion";
import { ErrorGeneracion } from "@/server/generacion/errores";
import { estimar } from "@/server/generacion/estimacion";
import { exigirRitmoDeConsultas, manejador } from "@/server/generacion/http";

export const dynamic = "force-dynamic";

/** Coste estimado y saldo del usuario: `?tipo=fotograma|animacion`. El saldo se cachea 30 s por usuario. */
export const GET = manejador(async (peticion: Request, _: unknown, actor) => {
  const tipo = new URL(peticion.url).searchParams.get("tipo");
  if (!esTipoTrabajo(tipo)) throw new ErrorGeneracion(400, "Tipo de trabajo no válido.");
  await exigirRitmoDeConsultas(actor, "estimacion");
  return Response.json(await estimar(actor.id, tipo));
});
