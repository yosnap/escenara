import { esAdmin, respuestaSinSesion, sesionDePeticion } from "../auth/sesion";
import { dentroDelLimite, type Limite } from "../limite";
import type { Actor } from "../media/servicio";
import { ErrorComunidad } from "./errores";

/**
 * Envoltorio de las rutas de la comunidad: exige sesión (401), comprueba el `Origin` en todo lo que cambia datos y
 * traduce los errores sin filtrar detalles internos (un error de Drizzle vuelca la consulta con sus parámetros).
 */

export type ContextoId = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un identificador mal escrito responde 404 como uno que no existe: no se distingue la causa. */
export function exigirUuid(valor: unknown, que = "Esa publicación"): string {
  if (typeof valor !== "string" || !UUID.test(valor)) throw new ErrorComunidad(404, `${que} no existe.`);
  return valor;
}

export function respuestaError(error: unknown): Response {
  if (error instanceof ErrorComunidad) return Response.json({ error: error.message }, { status: error.estado });
  const fallo = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[comunidad] error interno: ${fallo.slice(0, 300)}`);
  return Response.json(
    { error: "Error interno de la comunidad: no se ha cambiado nada. Vuelve a intentarlo en un momento." },
    { status: 500 },
  );
}

const SOLO_LECTURA = new Set(["GET", "HEAD"]);

function exigirMismoOrigen(peticion: Request): void {
  if (SOLO_LECTURA.has(peticion.method)) return;
  const origen = peticion.headers.get("origin");
  if (!origen) throw new ErrorComunidad(403, "Petición sin origen: vuelve a cargar la página.");
  let host: string;
  try {
    host = new URL(origen).host;
  } catch {
    throw new ErrorComunidad(403, "Origen no válido.");
  }
  if (host !== new URL(peticion.url).host) throw new ErrorComunidad(403, "Esta petición no viene de Escenara.");
}

/**
 * `permitirBorradoProgramado`: la ruta también la puede usar una cuenta en su periodo de gracia (solo lecturas de lo
 * propio, como descargar lo que tiene antes de irse).
 */
export function manejador<C>(
  fn: (peticion: Request, contexto: C, actor: Actor) => Promise<Response>,
  opciones: { permitirBorradoProgramado?: boolean } = {},
) {
  return async (peticion: Request, contexto: C): Promise<Response> => {
    try {
      const sesion = await sesionDePeticion(peticion, opciones);
      if (!sesion) return await respuestaSinSesion(peticion);
      exigirMismoOrigen(peticion);
      return await fn(peticion, contexto, { id: sesion.user.id, esAdmin: esAdmin(sesion) });
    } catch (error) {
      return respuestaError(error);
    }
  };
}

const LIMITE_ESCRITURAS: Limite = { ventanaSegundos: 60, maximo: 30 };
/** Lecturas de medios publicados: una galería pide varias por pantalla, pero no miles por minuto. */
const LIMITE_LECTURAS: Limite = { ventanaSegundos: 60, maximo: 900 };

export async function exigirRitmoDeEscritura(actor: Actor): Promise<void> {
  if (!(await dentroDelLimite(`comunidad:escritura:${actor.id}`, LIMITE_ESCRITURAS))) {
    throw new ErrorComunidad(
      429,
      "Demasiados cambios seguidos en la comunidad. Espera un minuto y vuelve a intentarlo.",
    );
  }
}

export async function exigirRitmoDeLectura(actor: Actor): Promise<void> {
  if (!(await dentroDelLimite(`comunidad:lectura:${actor.id}`, LIMITE_LECTURAS))) {
    throw new ErrorComunidad(429, "Estás pidiendo demasiados archivos de la comunidad seguidos. Espera un minuto.");
  }
}

export async function leerCuerpo(peticion: Request): Promise<Record<string, unknown>> {
  const cuerpo = await peticion.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo))
    throw new ErrorComunidad(400, "Envía los datos en JSON.");
  return cuerpo as Record<string, unknown>;
}
