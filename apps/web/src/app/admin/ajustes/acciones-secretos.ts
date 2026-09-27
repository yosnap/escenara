"use server";

import { exigirAdmin } from "@/server/auth/sesion";
import { AVISO_BOVEDA_ADMIN, bovedaDisponible } from "@/server/boveda/cifrado";
import {
  ErrorSecreto,
  esClaveSecreta,
  guardarSecreto,
  listarSecretos,
  quitarSecreto,
  type SecretoVista,
} from "@/server/boveda/secretos";

/**
 * Acciones de los secretos de la instalación (Admin › Ajustes). Ninguna devuelve el valor guardado: la
 * respuesta solo lleva la pista de cuatro caracteres. El detalle de un fallo va al registro del servidor.
 */
export type ResultadoSecretos = { ok: true; secretos: SecretoVista[] } | { ok: false; error: string };

export async function guardarSecretoAccion(clave: string, valor: string): Promise<ResultadoSecretos> {
  const sesion = await exigirAdmin("/admin/ajustes");
  if (!esClaveSecreta(clave)) return { ok: false, error: "Ese secreto no existe." };
  if (!bovedaDisponible()) return { ok: false, error: AVISO_BOVEDA_ADMIN };
  try {
    await guardarSecreto(clave, valor, sesion.user.id);
    return { ok: true, secretos: await listarSecretos() };
  } catch (error) {
    if (error instanceof ErrorSecreto) return { ok: false, error: error.message };
    // Nunca se registra el valor: solo que el guardado ha fallado y por qué (cifrado, base de datos…).
    console.error(`[boveda] no se ha podido guardar el secreto ${clave}:`, (error as Error).message);
    return { ok: false, error: "No se ha podido guardar. Revisa el registro del servidor." };
  }
}

export async function quitarSecretoAccion(clave: string): Promise<ResultadoSecretos> {
  await exigirAdmin("/admin/ajustes");
  if (!esClaveSecreta(clave)) return { ok: false, error: "Ese secreto no existe." };
  try {
    await quitarSecreto(clave);
    return { ok: true, secretos: await listarSecretos() };
  } catch (error) {
    console.error(`[boveda] no se ha podido quitar el secreto ${clave}:`, (error as Error).message);
    return { ok: false, error: "No se ha podido quitar. Revisa el registro del servidor." };
  }
}
