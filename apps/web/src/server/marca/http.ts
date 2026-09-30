import type { ParContraste } from "@/lib/marca-contraste";
import type { ErrorCampo } from "@/lib/marca-esquema";
import { esAdmin, sesionDePeticion } from "../auth/sesion";
import { dentroDelLimite, type Limite } from "../limite";
import type { Actor } from "../media/servicio";

/**
 * Error de la marca con la causa concreta para quien la usa. Puede llevar **los errores por campo** del documento y
 * **los pares de contraste** que impiden publicar: la pantalla los enseña uno por uno, no un «no se ha podido».
 */
export class ErrorMarca extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
    readonly errores: ErrorCampo[] = [],
    readonly bloqueos: ParContraste[] = [],
  ) {
    super(mensaje);
    this.name = "ErrorMarca";
  }
}

const SOLO_LECTURA = new Set(["GET", "HEAD"]);

/** Lo que cambia datos tiene que venir de esta misma instalación (defensa además de la cookie `SameSite`). */
function exigirMismoOrigen(peticion: Request): void {
  if (SOLO_LECTURA.has(peticion.method)) return;
  const origen = peticion.headers.get("origin");
  if (!origen) throw new ErrorMarca(403, "Petición sin origen: vuelve a cargar la página.");
  let host: string;
  try {
    host = new URL(origen).host;
  } catch {
    throw new ErrorMarca(403, "Origen no válido.");
  }
  if (host !== new URL(peticion.url).host) throw new ErrorMarca(403, "Esta petición no viene de Escenara.");
}

export function respuestaError(error: unknown): Response {
  if (error instanceof ErrorMarca) {
    return Response.json(
      { error: error.message, errores: error.errores, bloqueos: error.bloqueos },
      { status: error.estado },
    );
  }
  // Solo el tipo y el mensaje: un error de Drizzle vuelca la consulta con sus parámetros.
  const fallo = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[marca] error interno: ${fallo}`);
  return Response.json({ error: "Error interno al procesar la marca. Vuelve a intentarlo." }, { status: 500 });
}

/** Envoltorio de las rutas de la marca: sesión (401), mismo origen en las escrituras y errores con su causa. */
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

/** Puerta de la marca de la instalación: solo administración. Se llama en **cada** operación, no solo en la página. */
export function exigirAdministracion(actor: Actor): void {
  if (!actor.esAdmin) throw new ErrorMarca(403, "Solo la administración puede cambiar la marca de la instalación.");
}

/** Ritmo de escrituras: subir archivos y guardar borradores. Treinta por minuto sobran para una persona. */
const LIMITE_ESCRITURAS: Limite = { ventanaSegundos: 60, maximo: 30 };

export async function exigirRitmoDeMarca(actor: Actor): Promise<void> {
  if (!(await dentroDelLimite(`marca:escritura:${actor.id}`, LIMITE_ESCRITURAS))) {
    throw new ErrorMarca(429, "Estás cambiando la marca muy seguido. Espera un minuto y vuelve a intentarlo.");
  }
}

/** Cuerpo JSON de una petición, o un 400 con la causa. */
export async function leerJson(peticion: Request): Promise<Record<string, unknown>> {
  const cuerpo = await peticion.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    throw new ErrorMarca(400, "Envía los datos en JSON.");
  }
  return cuerpo as Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export type ContextoId = { params: Promise<{ id: string }> };

/** Margen para las cabeceras del formulario multiparte y los campos de texto. */
const MARGEN_MULTIPARTE = 64 * 1024;

/** Lee el archivo de un formulario multiparte, cortando por la cabecera antes de leer el cuerpo en memoria. */
export async function leerArchivo(peticion: Request, maximo: number): Promise<{ archivo: File; campos: FormData }> {
  const declarado = Number(peticion.headers.get("content-length") ?? 0);
  if (declarado > maximo + MARGEN_MULTIPARTE) throw new ErrorMarca(413, "El archivo supera el tamaño máximo.");
  const campos = await peticion.formData().catch(() => {
    throw new ErrorMarca(400, "Envía el archivo como formulario multiparte.");
  });
  const archivo = campos.get("archivo");
  if (!(archivo instanceof File)) throw new ErrorMarca(400, "Falta el archivo.");
  if (archivo.size > maximo) throw new ErrorMarca(413, "El archivo supera el tamaño máximo.");
  return { archivo, campos };
}
