import { type ContextoId, leerId, manejador } from "@/server/asistente/http";
import { repartoDePantalla } from "@/server/reparto/pantalla";

export const dynamic = "force-dynamic";

/**
 * **Todo lo que la pantalla de la escena necesita saber del reparto** (0.28.0): quién sale, qué dice, a quién le
 * falta su consentimiento, qué formatos admite esta instalación y qué costaría producirlo.
 *
 * Es una lectura: no se llama a ningún proveedor de generación y no se aparta ni un crédito. Una escena ajena
 * responde 404, sin decir que existe.
 */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) =>
  Response.json(await repartoDePantalla(actor, await leerId(contexto))),
);
