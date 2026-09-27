import { esAdmin, sesionDePeticion } from "../auth/sesion";
import { ErrorGeneracion } from "../generacion/errores";
import { dentroDelLimite, type Limite } from "../limite";
import { ErrorMedio } from "../media/errores";
import type { Actor } from "../media/servicio";
import { ErrorMedioEnUso, ErrorPersonaje, ErrorReferenciaRechazada } from "./errores";

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
  // El control de calidad devuelve el detalle por foto: la interfaz necesita saber cuál falló y por qué para
  // poder ofrecer «usar de todas formas» solo donde tiene sentido.
  if (error instanceof ErrorReferenciaRechazada) {
    return Response.json({ error: error.message, rechazos: error.rechazos }, { status: error.estado });
  }
  if (error instanceof ErrorPersonaje) return Response.json({ error: error.message }, { status: error.estado });
  // Subir una referencia pasa por la biblioteca: su cuota y sus formatos llegan hasta aquí con su código.
  if (error instanceof ErrorMedio) return Response.json({ error: error.message }, { status: error.estado });
  // Pedir una vista sintética encola un trabajo normal: sus rechazos (coste sin confirmar, sin clave, tope de
  // trabajos, presupuesto) llegan hasta aquí y conservan su código en lugar de convertirse en un 500.
  if (error instanceof ErrorGeneracion) return Response.json({ error: error.message }, { status: error.estado });
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

/**
 * Ritmo del análisis de fotos: añadir referencias mide cada imagen con `sharp`, así que es la única operación
 * de personajes que cuesta CPU de verdad. Sesenta peticiones por minuto sobran para una persona (cada una puede
 * llevar hasta veinte fotos) y evitan que una cuenta ponga el servidor a decodificar imágenes sin parar.
 */
const LIMITE_ANALISIS: Limite = { ventanaSegundos: 60, maximo: 60 };

export async function exigirRitmoDeAnalisis(actor: Actor): Promise<void> {
  if (!(await dentroDelLimite(`personajes:analisis:${actor.id}`, LIMITE_ANALISIS))) {
    throw new ErrorPersonaje(429, "Estás añadiendo fotos muy seguidas. Espera un minuto y vuelve a intentarlo.");
  }
}

export async function leerCuerpo(peticion: Request): Promise<Record<string, unknown>> {
  const cuerpo = await peticion.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== "object") throw new ErrorPersonaje(400, "Envía los datos en JSON.");
  return cuerpo as Record<string, unknown>;
}

export async function leerId(contexto: ContextoId): Promise<string> {
  return (await contexto.params).id;
}
