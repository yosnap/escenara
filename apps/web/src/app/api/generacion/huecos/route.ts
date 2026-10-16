import { huecosDeCola } from "@/server/cola/encolar";
import { manejador } from "@/server/generacion/http";

export const dynamic = "force-dynamic";

/**
 * Cuántos trabajos puede encargar ahora quien pregunta: el tope de la instalación, los que ya tiene en marcha y los
 * que caben. Es una lectura sin coste; el tope de verdad se vuelve a comprobar al encolar.
 */
export const GET = manejador(async (_: Request, __: unknown, actor) => Response.json(await huecosDeCola(actor.id)));
