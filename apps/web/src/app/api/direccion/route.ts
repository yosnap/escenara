import { manejador } from "@/server/asistente/http";
import { opcionesDeDireccion } from "@/server/direccion/opciones";

export const dynamic = "force-dynamic";

/**
 * Catálogo de la dirección del clip para la pantalla de escena: plano, ángulo, óptica, luz, sitio, cámara y
 * micro-acción, **en castellano y sin el fragmento en inglés de cada opción** (ADR-0022).
 *
 * Es una lectura del catálogo del propio usuario (el suyo y el de la instalación), como la de «Crear».
 */
export const GET = manejador(async (_peticion: Request, _contexto: unknown, actor) => {
  return Response.json(await opcionesDeDireccion(actor.id));
});
