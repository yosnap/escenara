import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeConsultas,
  leerIdTrabajo,
  manejador,
} from "@/server/generacion/http";
import { reconciliar } from "@/server/generacion/seguimiento";

export const dynamic = "force-dynamic";

/**
 * «Volver a consultar»: reconcilia el trabajo con el `task_id` guardado, sin reenviar nada al proveedor.
 * Con límite por usuario y con el suelo entre consultas del propio seguimiento.
 */
export const POST = manejador<ContextoId>(async (peticion: Request, contexto, actor) => {
  exigirMismoOrigen(peticion);
  const id = await leerIdTrabajo(contexto);
  await exigirRitmoDeConsultas(actor, "reconciliar");
  return Response.json(await reconciliar(actor, id));
});
