"use server";

import type { CompatibleVista } from "@/lib/compatible";
import { exigirSesion } from "@/server/auth/sesion";
import {
  borrarCompatible,
  guardarCompatible,
  listarCompatibles,
  modelosDelServicio,
  probarCompatible,
  type ResultadoCompatible,
  type ResultadoModelos,
} from "@/server/boveda/compatibles";

/**
 * Acciones de los servicios compatibles con la API de OpenAI del usuario (0.21.1). La sesión se comprueba
 * contra la base de datos en cada acción y el identificador del usuario sale de ella, nunca del navegador:
 * nadie puede tocar los servicios de otra persona ni indicando su identificador.
 *
 * Ninguna respuesta lleva la clave: solo la vista con la pista de cuatro caracteres.
 */
export type RespuestaCompatible = ResultadoCompatible;

/** Da de alta un servicio o sustituye el que tuviera ese nombre; solo se guarda si la prueba pasa. */
export async function guardarCompatibleAccion(datos: {
  nombre: string;
  urlBase: string;
  clave: string;
  modelos: string[];
  soloCuota: boolean;
}): Promise<RespuestaCompatible> {
  const sesion = await exigirSesion("/cuenta");
  try {
    return await guardarCompatible(sesion.user.id, datos);
  } catch (error) {
    // Nunca se registra la clave ni la respuesta del servicio: solo el tipo de fallo.
    console.error("[boveda] no se ha podido guardar un servicio compatible:", (error as Error).message);
    return { ok: false, error: "No se ha podido guardar. Inténtalo de nuevo." };
  }
}

/** Vuelve a probar la clave guardada de ese servicio. */
export async function probarCompatibleAccion(id: string): Promise<RespuestaCompatible> {
  const sesion = await exigirSesion("/cuenta");
  try {
    return await probarCompatible(sesion.user.id, id);
  } catch (error) {
    console.error("[boveda] no se ha podido probar un servicio compatible:", (error as Error).message);
    return { ok: false, error: "No se ha podido probar. Inténtalo de nuevo." };
  }
}

/** Borra el servicio del usuario. */
export async function borrarCompatibleAccion(id: string): Promise<RespuestaCompatible> {
  const sesion = await exigirSesion("/cuenta");
  const borrado = await borrarCompatible(sesion.user.id, id);
  return borrado
    ? { ok: true, proveedores: await listarCompatibles(sesion.user.id), mensaje: "Servicio borrado." }
    : { ok: false, error: "No tienes ningún servicio guardado con ese identificador." };
}

export type { CompatibleVista };

/** Lista de modelos del servicio para elegirlos en el formulario. No guarda nada. */
export async function modelosDelServicioAccion(datos: {
  urlBase: string;
  clave: string;
  id?: string;
}): Promise<ResultadoModelos> {
  const sesion = await exigirSesion("/cuenta");
  try {
    return await modelosDelServicio(sesion.user.id, datos);
  } catch (error) {
    console.error("[boveda] no se ha podido pedir la lista de modelos:", (error as Error).message);
    return { ok: false, error: "No se ha podido pedir la lista de modelos al servicio. Revisa la dirección." };
  }
}
