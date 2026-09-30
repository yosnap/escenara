"use server";

import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";

/**
 * Cierra una sesión propia por su identificador. El navegador nunca recibe los tokens de sesión: el
 * servidor busca el token entre las sesiones del usuario actual y solo entonces la revoca.
 */
export async function cerrarSesionDispositivo(id: string): Promise<{ ok: boolean; codigo?: string; mensaje?: string }> {
  const cabeceras = await headers();
  const sesiones = await (await auth()).api.listSessions({ headers: cabeceras });
  const objetivo = sesiones.find((s) => s.id === id);
  if (!objetivo) return { ok: false };
  try {
    await (await auth()).api.revokeSession({ body: { token: objetivo.token }, headers: cabeceras });
  } catch (error) {
    // Cerrar sesiones exige una sesión reciente. Se devuelve como resultado, no como excepción: lanzada desde una
    // acción de servidor, la pantalla se rompía con «Session is not fresh» en lugar de decir qué hacer.
    const e = error as { body?: { code?: string; message?: string }; message?: string };
    const mensaje = e.body?.message ?? e.message ?? "";
    if (e.body?.code === "SESSION_NOT_FRESH" || /not fresh/i.test(mensaje)) {
      return { ok: false, codigo: "SESSION_NOT_FRESH", mensaje };
    }
    throw error;
  }
  return { ok: true };
}
