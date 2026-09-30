import { manejador } from "@/server/marca/http";
import { volverALaMarcaDeEscenara } from "@/server/marca/instalacion";

export const dynamic = "force-dynamic";

/** Retira la marca publicada y la instalación vuelve a la de Escenara. La versión queda en el historial. */
export const POST = manejador(async (_: Request, __: unknown, actor) => {
  await volverALaMarcaDeEscenara(actor);
  return new Response(null, { status: 204 });
});
