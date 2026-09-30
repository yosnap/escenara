import { esAdmin, respuestaSinSesion, sesionDePeticion } from "../auth/sesion";
import { dentroDelLimite, type Limite } from "../limite";
import type { Actor } from "../media/servicio";
import { ErrorPreset } from "./errores";

/**
 * Envoltorio de las rutas de presets: exige sesión (401), comprueba el `Origin` en todo lo que cambia datos y
 * traduce los errores sin filtrar detalles internos. De quién es cada preset lo decide el servicio: uno de otro
 * usuario responde 404, como en la biblioteca.
 */

const SOLO_LECTURA = new Set(["GET", "HEAD"]);

function exigirMismoOrigen(peticion: Request): void {
  if (SOLO_LECTURA.has(peticion.method)) return;
  const origen = peticion.headers.get("origin");
  if (!origen) throw new ErrorPreset(403, "Petición sin origen: vuelve a cargar la página.");
  let host: string;
  try {
    host = new URL(origen).host;
  } catch {
    throw new ErrorPreset(403, "Origen no válido.");
  }
  if (host !== new URL(peticion.url).host) throw new ErrorPreset(403, "Esta petición no viene de Escenara.");
}

export function respuestaError(error: unknown): Response {
  if (error instanceof ErrorPreset) return Response.json({ error: error.message }, { status: error.estado });
  // Solo el tipo y el mensaje: un error de Drizzle vuelca la consulta con sus parámetros.
  const fallo = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[presets] error interno: ${fallo}`);
  return Response.json({ error: "Error interno al procesar el preset." }, { status: 500 });
}

export function manejador<C>(fn: (peticion: Request, contexto: C, actor: Actor) => Promise<Response>) {
  return async (peticion: Request, contexto: C): Promise<Response> => {
    try {
      const sesion = await sesionDePeticion(peticion);
      if (!sesion) return await respuestaSinSesion(peticion);
      exigirMismoOrigen(peticion);
      return await fn(peticion, contexto, { id: sesion.user.id, esAdmin: esAdmin(sesion) });
    } catch (error) {
      return respuestaError(error);
    }
  };
}

/**
 * Ritmo de las escrituras de presets. Duplicar y editar escriben filas y nadie las borra solo, así que sin
 * límite una cuenta podría llenar la tabla desde un bucle. Treinta por minuto sobran para una persona.
 */
const LIMITE_ESCRITURAS: Limite = { ventanaSegundos: 60, maximo: 30 };

export async function exigirRitmoDePresets(actor: Actor): Promise<void> {
  if (!(await dentroDelLimite(`presets:escritura:${actor.id}`, LIMITE_ESCRITURAS))) {
    throw new ErrorPreset(429, "Estás cambiando presets muy seguidos. Espera un minuto y vuelve a intentarlo.");
  }
}

export type ContextoId = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function leerId(contexto: ContextoId): Promise<string> {
  const { id } = await contexto.params;
  if (!UUID.test(id)) throw new ErrorPreset(404, "Ese preset no existe.");
  return id;
}

/**
 * Ritmo de lectura del ejemplo de las plantillas. Cada petición hace un par de consultas y una lectura del
 * almacenamiento, y un reproductor pide varios tramos por vídeo: el tope es holgado para una persona y corta un bucle.
 */
const LIMITE_LECTURAS_DE_EJEMPLO: Limite = { ventanaSegundos: 60, maximo: 600 };

export async function exigirRitmoDeEjemplos(actor: Actor): Promise<void> {
  if (!(await dentroDelLimite(`plantillas:ejemplo:${actor.id}`, LIMITE_LECTURAS_DE_EJEMPLO))) {
    throw new ErrorPreset(429, "Estás pidiendo demasiados ejemplos seguidos. Espera un minuto y vuelve a intentarlo.");
  }
}
