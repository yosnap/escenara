import { type ContextoId, leerIdTrabajo, manejador } from "@/server/generacion/http";
import { consultarTrabajo } from "@/server/generacion/seguimiento";

export const dynamic = "force-dynamic";

/**
 * Estado del trabajo. El servidor consulta al proveedor si ha pasado el mínimo entre consultas; el resto
 * de las veces devuelve lo que ya sabe. Un trabajo ajeno responde 404.
 */
export const GET = manejador<ContextoId>(async (_: Request, contexto, actor) =>
  Response.json(await consultarTrabajo(actor, await leerIdTrabajo(contexto))),
);
