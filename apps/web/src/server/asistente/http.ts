import { esAdmin, sesionDePeticion } from "../auth/sesion";
import { ErrorGeneracion } from "../generacion/errores";
import { dentroDelLimite, type Limite } from "../limite";
import { ErrorMedio } from "../media/errores";
import type { Actor } from "../media/servicio";
import { ErrorPersonaje } from "../personajes/errores";
import { ErrorPreset } from "../prompts/errores";
import { ErrorCatalogo } from "../proveedores/contrato";
import { ErrorProyecto } from "./errores";

/**
 * Envoltorio de las rutas de proyectos: exige sesión (401), pasa quién hace la petición y traduce los errores
 * sin filtrar detalles internos. Quién puede ver qué lo decide `consulta.ts`: un proyecto ajeno responde 404.
 *
 * Los POST, PATCH y DELETE exigen además `Origin` del mismo sitio: cambian datos de alguien (y el del asistente
 * gasta su dinero), así que un formulario en otra web no puede dispararlos con la sesión del navegador.
 */

export function respuestaError(error: unknown): Response {
  // Todos estos errores traen su código HTTP y un mensaje ya apto para mostrar. El del personaje llega al
  // asignar protagonista (consentimiento revocado, pocas fotos) y el del catálogo, al estimar sin precio.
  if (error instanceof ErrorProyecto) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorPersonaje) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorGeneracion) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorCatalogo) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorMedio) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorPreset) return Response.json({ error: error.message }, { status: error.estado });
  console.error("[proyectos]", error);
  return Response.json({ error: "Error interno al procesar el proyecto." }, { status: 500 });
}

export type ContextoId = { params: Promise<{ id: string }> };

/** Identificador de la ruta. Se valida contra la base de datos en `consulta.ts`, no aquí. */
export async function leerId(contexto: ContextoId): Promise<string> {
  const { id } = await contexto.params;
  return id;
}

export function manejador<C>(fn: (peticion: Request, contexto: C, actor: Actor) => Promise<Response>) {
  return async (peticion: Request, contexto: C): Promise<Response> => {
    try {
      const sesion = await sesionDePeticion(peticion);
      if (!sesion) return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
      return await fn(peticion, contexto, { id: sesion.user.id, esAdmin: esAdmin(sesion) });
    } catch (error) {
      return respuestaError(error);
    }
  };
}

/** Cuerpo JSON de la petición, o error si no lo es. */
export async function leerCuerpo(peticion: Request): Promise<Record<string, unknown>> {
  const cuerpo = await peticion.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== "object") throw new ErrorProyecto(400, "Envía los datos en JSON.");
  return cuerpo as Record<string, unknown>;
}

/** Una petición que cambia datos solo se acepta desde la propia aplicación. */
export function exigirMismoOrigen(peticion: Request): void {
  const origen = peticion.headers.get("origin");
  if (!origen) throw new ErrorProyecto(403, "Petición sin origen: vuelve a cargar la página.");
  let host: string;
  try {
    host = new URL(origen).host;
  } catch {
    throw new ErrorProyecto(403, "Origen no válido.");
  }
  if (host !== new URL(peticion.url).host) throw new ErrorProyecto(403, "Esta petición no viene de Escenara.");
}

/** Ritmo de las escrituras de proyectos y escenas: editar un guion cabe de sobra. */
export const RITMO_ESCRITURAS: Limite = { ventanaSegundos: 60, maximo: 60 };

export async function exigirRitmoDeEscritura(actor: Actor, accion: string): Promise<void> {
  if (!(await dentroDelLimite(`proyectos:${accion}:${actor.id}`, RITMO_ESCRITURAS))) {
    throw new ErrorProyecto(429, "Demasiados cambios seguidos. Espera unos segundos.");
  }
}
