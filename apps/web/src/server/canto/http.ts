import { ErrorProyecto } from "../asistente/errores";
import { esAdmin, sesionDePeticion } from "../auth/sesion";
import { ErrorGeneracion } from "../generacion/errores";
import { dentroDelLimite, type Limite } from "../limite";
import type { Actor } from "../media/servicio";
import { ErrorPersonaje } from "../personajes/errores";
import { ErrorCatalogo } from "../proveedores/contrato";
import { ErrorCanto } from "./errores";

/**
 * Envoltorio de las rutas del canto: exige sesión (401), comprueba el `Origin` en todo lo que cambia datos y
 * traduce los errores sin filtrar detalles internos.
 *
 * Quién puede ver o cambiar qué **no se decide aquí**: lo deciden las consultas con el usuario de la sesión, y una
 * escena, un proyecto o un audio ajenos responden 404. Es la misma forma que la estrategia del anuncio (0.27.0).
 *
 * Los errores de otros módulos que llegan hasta aquí lo hacen por caminos concretos: el del proyecto al leer una
 * escena propia, el del personaje al leer el retrato del protagonista, el de generación desde las comprobaciones
 * del gasto (clave de idempotencia, coste confirmado, sello, ritmo) y el del catálogo desde el modelo y su precio.
 */

export type ContextoId = { params: Promise<{ id: string }> };

export function respuestaError(error: unknown): Response {
  if (error instanceof ErrorCanto) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorProyecto) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorPersonaje) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorGeneracion) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorCatalogo) return Response.json({ error: error.message }, { status: error.estado });
  // Solo el tipo y el mensaje: un error de Drizzle vuelca la consulta con sus parámetros, y aquí los parámetros
  // son el guion de alguien y los identificadores de sus archivos.
  const fallo = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[canto] error interno: ${fallo}`);
  return Response.json({ error: "Error interno al preparar el canto de la escena." }, { status: 500 });
}

/** Métodos que no cambian nada: son los únicos que no exigen `Origin` del mismo sitio. */
const SOLO_LECTURA = new Set(["GET", "HEAD"]);

function exigirMismoOrigen(peticion: Request): void {
  if (SOLO_LECTURA.has(peticion.method)) return;
  const origen = peticion.headers.get("origin");
  if (!origen) throw new ErrorCanto(403, "Petición sin origen: vuelve a cargar la página.");
  let host: string;
  try {
    host = new URL(origen).host;
  } catch {
    throw new ErrorCanto(403, "Origen no válido.");
  }
  if (host !== new URL(peticion.url).host) throw new ErrorCanto(403, "Esta petición no viene de Escenara.");
}

export function manejador<C>(fn: (peticion: Request, contexto: C, actor: Actor) => Promise<Response>) {
  return async (peticion: Request, contexto: C): Promise<Response> => {
    try {
      const sesion = await sesionDePeticion(peticion);
      if (!sesion) return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
      exigirMismoOrigen(peticion);
      return await fn(peticion, contexto, { id: sesion.user.id, esAdmin: esAdmin(sesion) });
    } catch (error) {
      return respuestaError(error);
    }
  };
}

/**
 * Ritmo de las escrituras que **no cuestan créditos**: elegir el audio, quitarlo y declarar sus derechos. Medir un
 * audio con `ffprobe` sí cuesta CPU y disco del servidor, así que el tope es más estricto que el de un formulario:
 * treinta por minuto sobran para una persona y evitan que un bucle del navegador se coma la máquina.
 *
 * El ritmo de **generar** no es este: ese lo pone `exigirRitmo` en el camino del gasto, que es el de siempre.
 */
const LIMITE_ESCRITURAS: Limite = { ventanaSegundos: 60, maximo: 30 };

export async function exigirRitmoDeEscritura(actor: Actor): Promise<void> {
  if (!(await dentroDelLimite(`canto:escritura:${actor.id}`, LIMITE_ESCRITURAS))) {
    throw new ErrorCanto(429, "Demasiados cambios seguidos en el canto. Espera unos segundos y vuelve a intentarlo.");
  }
}

export async function leerCuerpo(peticion: Request): Promise<Record<string, unknown>> {
  const cuerpo = await peticion.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== "object") throw new ErrorCanto(400, "Envía los datos en JSON.");
  return cuerpo as Record<string, unknown>;
}

export async function leerId(contexto: ContextoId): Promise<string> {
  return (await contexto.params).id;
}
