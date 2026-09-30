import { exigirAdministracion, manejador } from "@/server/marca/http";
import { publicarBorrador } from "@/server/marca/instalacion";

export const dynamic = "force-dynamic";

/** Publica el borrador de forma atómica: o se publica entero o sigue la versión anterior. */
export const POST = manejador(async (_: Request, __: unknown, actor) => {
  exigirAdministracion(actor);
  return Response.json({ publicada: await publicarBorrador(actor) });
});
