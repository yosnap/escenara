import { esAdmin, sesionDePeticion } from "../auth/sesion";
import { ErrorMedio } from "../media/errores";
import type { Actor } from "../media/servicio";
import { ErrorMedioEnUso, ErrorPersonaje } from "./errores";

/**
 * Envoltorio de las rutas de personajes: exige sesión (401), comprueba el `Origin` en todo lo que cambia
 * datos y traduce los errores sin filtrar detalles internos. Qué puede ver o cambiar cada uno lo decide el
 * servicio: un personaje ajeno responde 404, como en la biblioteca de 0.8.0.
 *
 * Las fotos de un personaje y su documento de consentimiento son datos personales delicados, así que la
 * comprobación de `Origin` no es un adorno: un formulario en otra web no puede usar tu sesión para añadir,
 * cambiar o borrar nada tuyo.
 */

export type ContextoId = { params: Promise<{ id: string }> };

export function respuestaError(error: unknown): Response {
  if (error instanceof ErrorMedioEnUso) {
    return Response.json({ error: error.message, enUsoPor: error.personajes }, { status: error.estado });
  }
  if (error instanceof ErrorPersonaje) return Response.json({ error: error.message }, { status: error.estado });
  // Subir una referencia pasa por la biblioteca: su cuota y sus formatos llegan hasta aquí con su código.
  if (error instanceof ErrorMedio) return Response.json({ error: error.message }, { status: error.estado });
  // Solo el tipo y el mensaje: un error de Drizzle vuelca la consulta **con sus parámetros**, y aquí los
  // parámetros son nombres de personas, identificadores de fotos y de documentos de consentimiento. Nada de eso
  // tiene que acabar en el registro del servidor.
  const fallo = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[personajes] error interno: ${fallo}`);
  return Response.json({ error: "Error interno al procesar el personaje." }, { status: 500 });
}

/** Métodos que no cambian nada: son los únicos que no exigen `Origin` del mismo sitio. */
const SOLO_LECTURA = new Set(["GET", "HEAD"]);

/**
 * Las peticiones que cambian datos solo se aceptan desde la propia aplicación. Un `Origin` de otro sitio (o
 * ausente) se rechaza con 403.
 */
function exigirMismoOrigen(peticion: Request): void {
  if (SOLO_LECTURA.has(peticion.method)) return;
  const origen = peticion.headers.get("origin");
  if (!origen) throw new ErrorPersonaje(403, "Petición sin origen: vuelve a cargar la página.");
  let host: string;
  try {
    host = new URL(origen).host;
  } catch {
    throw new ErrorPersonaje(403, "Origen no válido.");
  }
  if (host !== new URL(peticion.url).host) throw new ErrorPersonaje(403, "Esta petición no viene de Escenara.");
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

export async function leerCuerpo(peticion: Request): Promise<Record<string, unknown>> {
  const cuerpo = await peticion.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== "object") throw new ErrorPersonaje(400, "Envía los datos en JSON.");
  return cuerpo as Record<string, unknown>;
}

export async function leerId(contexto: ContextoId): Promise<string> {
  return (await contexto.params).id;
}
