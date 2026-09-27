"use server";

import { type CredencialVista, esProveedor, MENSAJE_PRUEBA } from "@/lib/boveda";
import { exigirSesion } from "@/server/auth/sesion";
import {
  borrarCredencial,
  guardarCredencial,
  listarCredenciales,
  probarCredencial,
  type ResultadoCredencial,
} from "@/server/boveda/credenciales";

/**
 * Acciones de las credenciales de IA del usuario. La sesión se comprueba contra la base de datos en cada
 * acción y el identificador del usuario sale de ella, nunca del navegador: nadie puede tocar las
 * credenciales de otra persona.
 *
 * Ninguna respuesta lleva la clave: solo la vista con la pista de cuatro caracteres.
 */
export type RespuestaCredencial =
  | { ok: true; credenciales: CredencialVista[]; mensaje: string }
  | { ok: false; error: string };

async function respuesta(usuarioId: string, resultado: ResultadoCredencial): Promise<RespuestaCredencial> {
  if (resultado.ok) {
    const detalle = resultado.credencial.ultimoDetalle;
    return {
      ok: true,
      credenciales: await listarCredenciales(usuarioId),
      mensaje: detalle ? `${MENSAJE_PRUEBA.ok} Saldo: ${detalle}.` : MENSAJE_PRUEBA.ok,
    };
  }
  return { ok: false, error: resultado.motivo === "prueba" ? MENSAJE_PRUEBA[resultado.codigo] : resultado.mensaje };
}

/** Guarda una clave nueva o sustituye la anterior; solo se guarda si la prueba pasa. */
export async function guardarCredencialAccion(proveedor: string, secreto: string): Promise<RespuestaCredencial> {
  const sesion = await exigirSesion("/cuenta");
  if (!esProveedor(proveedor)) return { ok: false, error: "Ese proveedor no existe." };
  try {
    return await respuesta(sesion.user.id, await guardarCredencial(sesion.user.id, proveedor, secreto.trim()));
  } catch (error) {
    // Nunca se registra la clave: solo el proveedor y el tipo de fallo.
    console.error(`[boveda] no se ha podido guardar la credencial de ${proveedor}:`, (error as Error).message);
    return { ok: false, error: "No se ha podido guardar. Inténtalo de nuevo." };
  }
}

/** Vuelve a probar la clave guardada y actualiza su estado. */
export async function probarCredencialAccion(proveedor: string): Promise<RespuestaCredencial> {
  const sesion = await exigirSesion("/cuenta");
  if (!esProveedor(proveedor)) return { ok: false, error: "Ese proveedor no existe." };
  try {
    const resultado = await probarCredencial(sesion.user.id, proveedor);
    // Una prueba fallida sí cambia el estado guardado: hay que devolver la lista actualizada.
    if (!resultado.ok && resultado.motivo === "prueba") {
      return { ok: false, error: MENSAJE_PRUEBA[resultado.codigo] };
    }
    return await respuesta(sesion.user.id, resultado);
  } catch (error) {
    console.error(`[boveda] no se ha podido probar la credencial de ${proveedor}:`, (error as Error).message);
    return { ok: false, error: "No se ha podido probar. Inténtalo de nuevo." };
  }
}

/** Borra la clave guardada del proveedor. */
export async function borrarCredencialAccion(proveedor: string): Promise<RespuestaCredencial> {
  const sesion = await exigirSesion("/cuenta");
  if (!esProveedor(proveedor)) return { ok: false, error: "Ese proveedor no existe." };
  const borrada = await borrarCredencial(sesion.user.id, proveedor);
  return borrada
    ? { ok: true, credenciales: await listarCredenciales(sesion.user.id), mensaje: "Clave borrada." }
    : { ok: false, error: "No tienes ninguna clave guardada para este proveedor." };
}
