"use server";

import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";
import { conSesionReciente, esSesionAntigua } from "@/server/auth/sesion-reciente";

/**
 * Cierra una sesión propia por su identificador. El navegador nunca recibe los tokens de sesión: el
 * servidor busca el token entre las sesiones del usuario actual y solo entonces la revoca.
 */
export async function cerrarSesionDispositivo(id: string): Promise<{ ok: boolean; codigo?: string }> {
  const cabeceras = await headers();
  const listado = await conSesionReciente(async () => (await auth()).api.listSessions({ headers: cabeceras }));
  if (listado.antigua) return { ok: false, codigo: "SESSION_NOT_FRESH" };
  const objetivo = listado.valor.find((s) => s.id === id);
  if (!objetivo) return { ok: false };
  try {
    await (await auth()).api.revokeSession({ body: { token: objetivo.token }, headers: cabeceras });
  } catch (error) {
    // Se devuelve como resultado, no como excepción: lanzada desde una acción de servidor, la pantalla se rompía.
    if (esSesionAntigua(error)) return { ok: false, codigo: "SESSION_NOT_FRESH" };
    throw error;
  }
  return { ok: true };
}
