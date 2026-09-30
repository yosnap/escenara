import { esAdmin, respuestaSinSesion, sesionDePeticion } from "../auth/sesion";
import { ErrorMedioEnUso, ErrorPersonaje } from "../personajes/errores";
import { ErrorMedio } from "./errores";
import { type Actor, limiteSubida } from "./servicio";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const esUuid = (valor: unknown): valor is string => typeof valor === "string" && UUID.test(valor);

/** Filtro de dueño (solo admin): «todos», «mios» o el id de un usuario; cualquier otra cosa es un error. */
export function leerPropietario(valor: string | null): string | null {
  if (valor === null || valor === "todos" || valor === "mios" || esUuid(valor)) return valor;
  throw new ErrorMedio(400, "Filtro de usuario no válido.");
}

export type ContextoId = { params: Promise<{ id: string }> };

/** Convierte errores en respuestas JSON sin filtrar detalles internos. */
export function respuestaError(error: unknown): Response {
  if (error instanceof ErrorMedio) return Response.json({ error: error.message }, { status: error.estado });
  // El borrado definitivo de un medio puede toparse con un personaje que lo usa: el aviso lleva la lista,
  // para que la interfaz pueda enumerar a quién afecta antes de que se confirme.
  if (error instanceof ErrorMedioEnUso) {
    return Response.json({ error: error.message, enUsoPor: error.personajes }, { status: error.estado });
  }
  if (error instanceof ErrorPersonaje) return Response.json({ error: error.message }, { status: error.estado });
  console.error("[media]", error);
  return Response.json({ error: "Error interno al procesar el medio." }, { status: 500 });
}

/**
 * Envuelve un manejador de ruta: exige sesión (401), pasa quién hace la petición y traduce los errores.
 * Qué puede ver o cambiar cada uno lo decide el servicio (lo ajeno responde 404).
 */
export function manejador<C>(fn: (peticion: Request, contexto: C, actor: Actor) => Promise<Response>) {
  return async (peticion: Request, contexto: C): Promise<Response> => {
    try {
      const sesion = await sesionDePeticion(peticion);
      if (!sesion) return await respuestaSinSesion(peticion);
      return await fn(peticion, contexto, { id: sesion.user.id, esAdmin: esAdmin(sesion) });
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
