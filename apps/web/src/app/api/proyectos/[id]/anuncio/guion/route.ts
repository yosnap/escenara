import { HOOKS_PEDIDOS } from "@/lib/anuncio-guion";
import { estimacionDeHooksYGuion, proponerHooksYGuion } from "@/server/anuncio/guion";
import { type ContextoId, leerCuerpo, leerId, manejador } from "@/server/anuncio/http";
import { puedePedirGuion } from "@/server/anuncio/puerta-guion";
import { proyectoPropio } from "@/server/asistente/consulta";

export const dynamic = "force-dynamic";

/**
 * **Hooks y guion desde el brief** (0.27.0) de un proyecto propio.
 *
 * `GET` es la lectura de antes de gastar: qué costaría la llamada por la entrada principal del mapa de texto del
 * usuario y si el brief ya permite pedirla. No llama a ningún proveedor ni reserva nada.
 *
 * `POST` es el camino que **gasta**, y solo con la confirmación de ese coste: `{ claveIdempotencia,
 * creditosConfirmados, selloEstimacion, escenas? }`. Devuelve los cinco hooks para elegir y deja el guion
 * propuesto escrito como borrador en las escenas del proyecto. Aquí no se genera ningún fotograma ni ningún clip.
 */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) => {
  const proyecto = await proyectoPropio(actor, await leerId(contexto));
  const [estimacion, puerta] = await Promise.all([estimacionDeHooksYGuion(actor.id), puedePedirGuion(proyecto.id)]);
  return Response.json({ estimacion, puerta, hooksPedidos: HOOKS_PEDIDOS });
});

export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  const propuesta = await proponerHooksYGuion(actor, id, {
    claveIdempotencia: cuerpo.claveIdempotencia,
    creditosConfirmados: cuerpo.creditosConfirmados,
    selloEstimacion: cuerpo.selloEstimacion,
    escenas: cuerpo.escenas,
  });
  return Response.json(propuesta);
});
