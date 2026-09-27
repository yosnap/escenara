import { estadoDeCola } from "@/server/cola/latido";
import { manejador } from "@/server/generacion/http";
import { depositoDe } from "@/server/presupuesto/deposito";

export const dynamic = "force-dynamic";

/**
 * Estado de la cola y depósito de presupuesto de quien pregunta. Es lo que mantiene honesta la espera: el
 * navegador puede decir «hay 2 delante» y «no hay ningún worker atendiendo» en lugar de girar para siempre.
 */
export const GET = manejador(async (_: Request, __: unknown, actor) =>
  Response.json({ cola: await estadoDeCola(actor.id), deposito: await depositoDe(actor.id) }),
);
