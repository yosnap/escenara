import { exigirRitmoDeMarca, leerJson, manejador } from "@/server/marca/http";
import { guardarKit, leerKit } from "@/server/marca/kit";

export const dynamic = "force-dynamic";

/** Tu kit de marca. Cada usuario solo ve y cambia el suyo. */
export const GET = manejador(async (_: Request, __: unknown, actor) => Response.json({ kit: await leerKit(actor) }));

export const PUT = manejador(async (peticion: Request, __: unknown, actor) => {
  await exigirRitmoDeMarca(actor);
  return Response.json({ kit: await guardarKit(actor, await leerJson(peticion)) });
});
