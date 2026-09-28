import { ErrorProyecto } from "../asistente/errores";
import { esAdmin, sesionDePeticion } from "../auth/sesion";
import { dentroDelLimite, type Limite } from "../limite";
import { ErrorMedio } from "../media/errores";
import type { Actor } from "../media/servicio";
import { ErrorPersonaje } from "../personajes/errores";
import { ErrorProducto } from "../productos/errores";
import { ErrorPreset } from "../prompts/errores";
import { ErrorCatalogo } from "../proveedores/contrato";
import { ErrorGeneracion } from "./errores";

/**
 * Envoltorio de las rutas de generación: exige sesión (401), pasa quién hace la petición y traduce los
 * errores sin filtrar detalles internos. Qué puede ver cada uno lo decide el servicio: un trabajo ajeno
 * responde 404.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ContextoId = { params: Promise<{ id: string }> };

export async function leerIdTrabajo(contexto: ContextoId): Promise<string> {
  const { id } = await contexto.params;
  if (!UUID.test(id)) throw new ErrorGeneracion(404, "El trabajo no existe.");
  return id;
}

export function respuestaError(error: unknown): Response {
  // Los errores de la biblioteca (cuota, formato) llegan hasta aquí al guardar el resultado, y los del
  // catálogo (modelo retirado, sin capacidad, sin precio) al elegir el modelo: los tres llevan ya su
  // código HTTP y un mensaje apto para mostrar.
  if (error instanceof ErrorGeneracion) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorCatalogo) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorMedio) return Response.json({ error: error.message }, { status: error.estado });
  // Los de presets y plantillas (0.16.0) llegan al componer el prompt: preset ajeno, desactivado, variable
  // obligatoria sin valor o formato que el modelo no admite. Todos traen su código y su motivo escrito.
  if (error instanceof ErrorPreset) return Response.json({ error: error.message }, { status: error.estado });
  // Y desde 0.18.0 también los frenos del motor de controles que pertenecen a un personaje (consentimiento,
  // referencias) o a un proyecto (plan sin aprobar, presupuesto del proyecto): la puerta los lanza con la clase
  // y el código de su familia, y el usuario tiene que ver el motivo, no un «error interno».
  if (error instanceof ErrorPersonaje) return Response.json({ error: error.message }, { status: error.estado });
  // El del producto (0.26.0) llega al elegirlo en un clip o en una escena: uno ajeno responde 404.
  if (error instanceof ErrorProducto) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorProyecto) return Response.json({ error: error.message }, { status: error.estado });
  console.error("[generacion]", error);
  return Response.json({ error: "Error interno al procesar el trabajo." }, { status: 500 });
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
  if (!cuerpo || typeof cuerpo !== "object") throw new ErrorGeneracion(400, "Envía los datos en JSON.");
  return cuerpo as Record<string, unknown>;
}

/**
 * Las peticiones que gastan dinero solo se aceptan desde la propia aplicación: un formulario en otra web
 * no puede hacer que tu navegador, con tu sesión, encargue una generación a tu cuenta del proveedor.
 * Un `Origin` de otro sitio (o ausente en un POST) se rechaza.
 */
export function exigirMismoOrigen(peticion: Request): void {
  const origen = peticion.headers.get("origin");
  if (!origen) throw new ErrorGeneracion(403, "Petición sin origen: vuelve a cargar la página.");
  let host: string;
  try {
    host = new URL(origen).host;
  } catch {
    throw new ErrorGeneracion(403, "Origen no válido.");
  }
  // `host` de la petición: lo fija el servidor a partir de la URL que se pidió.
  if (host !== new URL(peticion.url).host) throw new ErrorGeneracion(403, "Esta petición no viene de Escenara.");
}

/** Ritmo de las consultas que hace el navegador: el sondeo normal cabe de sobra. */
export const RITMO_CONSULTAS: Limite = { ventanaSegundos: 60, maximo: 40 };

export async function exigirRitmoDeConsultas(actor: Actor, accion: string): Promise<void> {
  if (!(await dentroDelLimite(`generacion:${accion}:${actor.id}`, RITMO_CONSULTAS))) {
    throw new ErrorGeneracion(429, "Demasiadas consultas seguidas. Espera unos segundos.");
  }
}
