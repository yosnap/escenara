import { type ContextoId, exigirMismoOrigen, exigirRitmoDeEscritura, leerId, manejador } from "@/server/asistente/http";
import { pedirExportacion } from "@/server/montaje/exportacion";
import { montajeDelProyecto } from "@/server/montaje/servicio";
import { montajeParaLaVista } from "@/server/montaje/vista";

export const dynamic = "force-dynamic";

/**
 * Pide la exportación del montaje vigente (RF08, 0.32.0). El render lo hace el **worker**, así que esto encola y
 * responde al momento con el estado completo del montaje: la pantalla sigue el progreso por su etapa real.
 *
 * **No cuesta créditos** y por eso no hay confirmación de coste, ni sello de precio, ni clave de idempotencia
 * firmada por el navegador: la idempotencia es del servidor, por montaje y versión. Pedirla dos veces devuelve la
 * misma exportación, y la pantalla lo nota porque la versión y el identificador son los mismos.
 *
 * Lo que sí se comprueba antes de encolar nada: que el montaje esté activo, que FFmpeg esté instalado, que la
 * línea de tiempo siga siendo válida, que no haya un fallo crítico abierto en la revisión y que quepa el resultado
 * en la biblioteca (`server/montaje/puerta.ts`).
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "montaje-exportacion");
  const { montaje, material } = await montajeDelProyecto(actor, await leerId(contexto));
  const { nueva } = await pedirExportacion(actor, montaje, material);
  return Response.json(await montajeParaLaVista(actor, montaje, material), { status: nueva ? 202 : 200 });
});
