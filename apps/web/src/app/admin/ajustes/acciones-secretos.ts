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

export async function guardarSecretoAccion(
  clave: string,
  valor: string,
  anterior: string | null,
): Promise<ResultadoSecretos> {
  const sesion = await exigirAdmin("/admin/ajustes");
  if (!esClaveSecreta(clave)) return { ok: false, error: "Ese secreto no existe." };
  if (!bovedaDisponible()) return { ok: false, error: AVISO_BOVEDA_ADMIN };
  try {
    if (anterior === undefined) return { ok: false, error: "Recarga antes de guardar la credencial." };
    await guardarSecreto(clave, valor, sesion.user.id, anterior);
    return { ok: true, secretos: await listarSecretos() };
  } catch (error) {
    if (error instanceof ErrorSecreto) return { ok: false, error: error.message };
    // Nunca se registra el valor: solo que el guardado ha fallado y por qué (cifrado, base de datos…).
    console.error(`[boveda] no se ha podido guardar el secreto ${clave}; detalle privado omitido.`);
    return { ok: false, error: "No se ha podido guardar. Revisa el registro del servidor." };
  }
}

export async function quitarSecretoAccion(clave: string, anterior: string | null): Promise<ResultadoSecretos> {
  const sesion = await exigirAdmin("/admin/ajustes");
  if (!esClaveSecreta(clave)) return { ok: false, error: "Ese secreto no existe." };
  try {
    if (anterior === undefined) return { ok: false, error: "Recarga antes de quitar la credencial." };
    await quitarSecreto(clave, sesion.user.id, anterior);
    return { ok: true, secretos: await listarSecretos() };
  } catch (error) {
    if (error instanceof ErrorSecreto) return { ok: false, error: error.message };
    console.error(`[boveda] no se ha podido quitar el secreto ${clave}; detalle privado omitido.`);
    return { ok: false, error: "No se ha podido quitar. Revisa el registro del servidor." };
  }
}
