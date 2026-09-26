import { manejador } from "@/server/media/http";
import { espacioUsado } from "@/server/media/servicio";

export const dynamic = "force-dynamic";

/** Espacio usado por quien consulta y su cuota (`cuotaBytes: null` = sin límite). */
export const GET = manejador(async (_: Request, __: unknown, actor) => Response.json(await espacioUsado(actor)));
