import { leerAjustes } from "../ajustes";
import { ErrorProyecto } from "../asistente/errores";
import { esAdmin, sesionDePeticion } from "../auth/sesion";
import { ErrorGeneracion } from "../generacion/errores";
import { dentroDelLimite, type Limite } from "../limite";
import type { Actor } from "../media/servicio";
import { ErrorProducto } from "../productos/errores";
import { ErrorPreset } from "../prompts/errores";
import { ErrorCatalogo } from "../proveedores/contrato";
import { ErrorAnuncio } from "./errores";

/**
 * Envoltorio de las rutas de la estrategia del anuncio: exige sesión (401), comprueba el `Origin` en todo lo que
 * cambia datos y traduce los errores sin filtrar detalles internos.
 *
 * Quién puede ver o cambiar qué **no se decide aquí**: lo deciden las consultas de `ofertas.ts` y `brief.ts` con
 * el usuario de la sesión, y una oferta o un proyecto ajenos responden 404.
 *
 * Los tres errores de otros módulos que llegan hasta aquí lo hacen por caminos concretos: el del proyecto al leer
 * o guardar el brief de uno propio, el del producto al atar una oferta a un producto, y el del preset al validar
 * el ángulo contra el catálogo.
 */

export type ContextoId = { params: Promise<{ id: string }> };

export function respuestaError(error: unknown): Response {
  if (error instanceof ErrorAnuncio) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorProyecto) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorProducto) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorPreset) return Response.json({ error: error.message }, { status: error.estado });
  /**
   * Los dos que llegan por el camino de **pedir hooks y guion** (0.27.0): el de generación lo lanzan la clave de
   * idempotencia, la confirmación del coste y el sello del precio, y el del catálogo, un modelo de texto sin
   * precio registrado. Los dos traen su código y un mensaje que ya dice qué hacer.
   */
  if (error instanceof ErrorGeneracion) return Response.json({ error: error.message }, { status: error.estado });
  if (error instanceof ErrorCatalogo) return Response.json({ error: error.message }, { status: error.estado });
  // Solo el tipo y el mensaje: un error de Drizzle vuelca la consulta con sus parámetros, y aquí los parámetros
  // son el texto de la oferta y el brief de alguien.
  const fallo = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[anuncio] error interno: ${fallo}`);
  return Response.json({ error: "Error interno al procesar la estrategia del anuncio." }, { status: 500 });
}

/** Métodos que no cambian nada: son los únicos que no exigen `Origin` del mismo sitio. */
const SOLO_LECTURA = new Set(["GET", "HEAD"]);

function exigirMismoOrigen(peticion: Request): void {
  if (SOLO_LECTURA.has(peticion.method)) return;
  const origen = peticion.headers.get("origin");
  if (!origen) throw new ErrorAnuncio(403, "Petición sin origen: vuelve a cargar la página.");
  let host: string;
  try {
    host = new URL(origen).host;
  } catch {
    throw new ErrorAnuncio(403, "Origen no válido.");
  }
  if (host !== new URL(peticion.url).host) throw new ErrorAnuncio(403, "Esta petición no viene de Escenara.");
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
 * Ritmo de las escrituras. Rellenar un brief y editar una oferta no cuesta CPU ni créditos, pero sí escribe
 * filas: sesenta por minuto sobran para una persona y evitan que un bucle del navegador llene la tabla.
 */
const LIMITE_ESCRITURAS: Limite = { ventanaSegundos: 60, maximo: 60 };

export async function exigirRitmoDeEscritura(actor: Actor): Promise<void> {
  if (!(await dentroDelLimite(`anuncio:escritura:${actor.id}`, LIMITE_ESCRITURAS))) {
    throw new ErrorAnuncio(429, "Demasiados cambios seguidos. Espera unos segundos y vuelve a intentarlo.");
  }
}

/**
 * El brief está encendido en esta instalación (Admin › Ajustes, encendido de fábrica). Se comprueba **antes de
 * escribir**, no al leer: apagarlo deja de ofrecer el brief y las variantes, pero **no borra** los briefs ya
 * escritos ni impide verlos, que sería perder trabajo de alguien por un interruptor.
 */
export async function exigirBriefActivo(): Promise<void> {
  if (!(await leerAjustes()).anuncioBriefActivo) {
    throw new ErrorAnuncio(
      409,
      "El brief del anuncio está desactivado en esta instalación. Quien la administra puede encenderlo en Admin › Ajustes.",
    );
  }
}

/**
 * Las variantes por ángulo están encendidas. Dependen del brief: sin brief no hay ángulo del que variar, así que
 * se comprueban los dos. La usa quien crea proyectos hermanos.
 */
export async function exigirVariantesActivas(): Promise<void> {
  const ajustes = await leerAjustes();
  if (!ajustes.anuncioBriefActivo || !ajustes.anuncioVariantesActivas) {
    throw new ErrorAnuncio(
      409,
      "Las variantes por ángulo están desactivadas en esta instalación. Quien la administra puede encenderlas en Admin › Ajustes.",
    );
  }
}

export async function leerCuerpo(peticion: Request): Promise<Record<string, unknown>> {
  const cuerpo = await peticion.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== "object") throw new ErrorAnuncio(400, "Envía los datos en JSON.");
  return cuerpo as Record<string, unknown>;
}

export async function leerId(contexto: ContextoId): Promise<string> {
  return (await contexto.params).id;
}
