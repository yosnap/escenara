import { esAdmin, sesionDePeticion } from "../auth/sesion";
import { ErrorMedio } from "./errores";
import { limiteSubida } from "./servicio";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ContextoId = { params: Promise<{ id: string }> };

/** Convierte errores en respuestas JSON sin filtrar detalles internos. */
export function respuestaError(error: unknown): Response {
  if (error instanceof ErrorMedio) return Response.json({ error: error.message }, { status: error.estado });
  console.error("[media]", error);
  return Response.json({ error: "Error interno al procesar el medio." }, { status: 500 });
}

/**
 * Envuelve un manejador de ruta: exige sesión (401) y rol de administrador (404, como si no existiera)
 * y traduce los errores. En 0.8.0 cada usuario tendrá acceso a sus propios medios.
 */
export function manejador<C>(fn: (peticion: Request, contexto: C) => Promise<Response>) {
  return async (peticion: Request, contexto: C): Promise<Response> => {
    try {
      const sesion = await sesionDePeticion(peticion);
      if (!sesion) return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
      if (!esAdmin(sesion)) return new Response(null, { status: 404 });
      return await fn(peticion, contexto);
    } catch (error) {
      return respuestaError(error);
    }
  };
}

export async function leerId(contexto: ContextoId): Promise<string> {
  const { id } = await contexto.params;
  if (!UUID.test(id)) throw new ErrorMedio(404, "El medio no existe.");
  return id;
}

/** Margen para las cabeceras del formulario multiparte y los campos de texto. */
const MARGEN_MULTIPARTE = 1024 * 1024;

export async function leerArchivo(peticion: Request): Promise<{ archivo: File; campos: FormData }> {
  // Rechaza por la cabecera antes de leer el cuerpo en memoria.
  const declarado = Number(peticion.headers.get("content-length") ?? 0);
  if (declarado > limiteSubida() + MARGEN_MULTIPARTE) {
    throw new ErrorMedio(413, "El archivo supera el tamaño máximo.");
  }
  const campos = await peticion.formData().catch(() => {
    throw new ErrorMedio(400, "Envía el archivo como formulario multiparte.");
  });
  const archivo = campos.get("archivo");
  if (!(archivo instanceof File)) throw new ErrorMedio(400, "Falta el archivo.");
  return { archivo, campos };
}
