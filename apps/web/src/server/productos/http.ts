import { esAdmin, sesionDePeticion } from "../auth/sesion";
import { dentroDelLimite, type Limite } from "../limite";
import { ErrorMedio } from "../media/errores";
import type { Actor } from "../media/servicio";
import { ErrorProducto } from "./errores";

/**
 * Envoltorio de las rutas de productos: exige sesión (401), comprueba el `Origin` en todo lo que cambia datos
 * y traduce los errores sin filtrar detalles internos. Qué puede ver o cambiar cada uno lo decide la consulta:
 * un producto ajeno responde 404, igual que en la biblioteca y en los personajes.
 */

export type ContextoId = { params: Promise<{ id: string }> };

export function respuestaError(error: unknown): Response {
  if (error instanceof ErrorProducto) return Response.json({ error: error.message }, { status: error.estado });
  // Añadir una foto pasa por la biblioteca: su cuota y sus formatos llegan hasta aquí con su código.
  if (error instanceof ErrorMedio) return Response.json({ error: error.message }, { status: error.estado });
  // Solo el tipo y el mensaje: un error de Drizzle vuelca la consulta con sus parámetros, y aquí los
  // parámetros son nombres de productos e identificadores de fotos de alguien.
  const fallo = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[productos] error interno: ${fallo}`);
  return Response.json({ error: "Error interno al procesar el producto." }, { status: 500 });
}

/** Métodos que no cambian nada: son los únicos que no exigen `Origin` del mismo sitio. */
const SOLO_LECTURA = new Set(["GET", "HEAD"]);

function exigirMismoOrigen(peticion: Request): void {
  if (SOLO_LECTURA.has(peticion.method)) return;
  const origen = peticion.headers.get("origin");
  if (!origen) throw new ErrorProducto(403, "Petición sin origen: vuelve a cargar la página.");
  let host: string;
  try {
    host = new URL(origen).host;
  } catch {
    throw new ErrorProducto(403, "Origen no válido.");
  }
  if (host !== new URL(peticion.url).host) throw new ErrorProducto(403, "Esta petición no viene de Escenara.");
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
 * Ritmo de las escrituras. Crear, editar y añadir fotos no cuesta CPU (las imágenes ya están en la biblioteca),
 * pero sí escribe filas: sesenta por minuto sobran para una persona y evitan que un bucle del navegador llene
 * la tabla.
 */
const LIMITE_ESCRITURAS: Limite = { ventanaSegundos: 60, maximo: 60 };

export async function exigirRitmoDeEscritura(actor: Actor): Promise<void> {
  if (!(await dentroDelLimite(`productos:escritura:${actor.id}`, LIMITE_ESCRITURAS))) {
    throw new ErrorProducto(429, "Demasiados cambios seguidos. Espera unos segundos y vuelve a intentarlo.");
  }
}

export async function leerCuerpo(peticion: Request): Promise<Record<string, unknown>> {
  const cuerpo = await peticion.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== "object") throw new ErrorProducto(400, "Envía los datos en JSON.");
  return cuerpo as Record<string, unknown>;
}

export async function leerId(contexto: ContextoId): Promise<string> {
  return (await contexto.params).id;
}
